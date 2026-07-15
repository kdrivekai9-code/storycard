"use server";

import sharp from "sharp";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/admin-server";

const BUCKET = "invitation-photos";
const PREFIX = "inpaint-test3";

// ── Storage helpers ──────────────────────────────────────────────────────────

async function uploadBuffer(buf: Buffer | Uint8Array, name: string, contentType: string): Promise<string> {
  const admin = createAdminClient();
  const path  = `${PREFIX}/${Date.now()}-${name}`;
  const { error } = await admin.storage.from(BUCKET).upload(path, buf, { contentType, upsert: true });
  if (error) throw new Error(`업로드 실패(${name}): ${error.message}`);
  return admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function uploadFile(file: File, name: string): Promise<string> {
  return uploadBuffer(new Uint8Array(await file.arrayBuffer()), name, file.type || "image/jpeg");
}

async function downloadBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`다운로드 실패(${url}): ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Edge Function helper ─────────────────────────────────────────────────────

async function invokeEdgeFunction(body: Record<string, unknown>) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const { data, error } = await supabase.functions.invoke("face-swap", {
    body,
    headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
  });
  if (error) {
    let detail = error.message;
    try {
      const ctx = (error as unknown as { context?: Response }).context;
      if (ctx) { const b = await ctx.json().catch(() => ctx.text()); detail = typeof b === "string" ? b : JSON.stringify(b); }
    } catch { /* ignore */ }
    return { ok: false as const, error: detail };
  }
  return { ok: true as const, data: data as Record<string, unknown> };
}

async function runBiRefNet(imageUrl: string): Promise<Buffer> {
  const res = await invokeEdgeFunction({ action: "bg-remove", image_url: imageUrl });
  if (!res.ok) throw new Error(`BiRefNet: ${res.error}`);
  const rawUrl = String(res.data.outputUrl ?? "");
  if (!rawUrl) throw new Error("BiRefNet 결과 URL 없음");
  return downloadBuffer(rawUrl);
}

async function getBoundingBox(transparentPngBuf: Buffer) {
  const { data, info } = await sharp(transparentPngBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width, maxX = 0, minY = info.height, maxY = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 32) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (minX > maxX || minY > maxY) return { left: 0, top: 0, width: info.width, height: info.height };
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

// ── HIGH-PASS FILTER ─────────────────────────────────────────────────────────
// result(x,y) = clamp(original(x,y) − blur(original, sigma)(x,y) + 128)
// 값 128 = 텍스처 없음(중립), >128 = 볼록(주름 능선), <128 = 오목(보조개·홈)

// amplify: 1.0 = 원본, 2.0 = 텍스처 편차 2× 강조 (보조개·주름 등 미세 구조 가시화)
async function applyHighPass(buf: Buffer, sigma: number, amplify = 2.0): Promise<Buffer> {
  const { data: origData, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const blurData = await sharp(buf).removeAlpha().blur(Math.max(0.3, sigma)).raw().toBuffer();
  const hpData = Buffer.allocUnsafe(origData.length);
  for (let i = 0; i < origData.length; i++) {
    hpData[i] = Math.max(0, Math.min(255, 128 + (origData[i] - blurData[i]) * amplify));
  }
  return sharp(hpData, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toBuffer();
}

// ── COLOR MATCH (히스토그램 매칭) ────────────────────────────────────────────
// 텍스처 전사 후 결과 이미지의 피부색 분포를 이미지 A(기준)와 일치시킴.
// 이렇게 하면 원본 사진의 조명·색조 차이가 보정됩니다.

async function applyColorMatch(
  imageABuf: Buffer,   // 색상 기준 (이미지 A)
  resultBuf: Buffer,   // 보정 대상 (텍스처 전사 결과)
  maskBuf:   Buffer,   // 피부 마스크
  baseW: number,
  baseH: number,
): Promise<Buffer> {
  const refData  = await sharp(imageABuf).resize(baseW, baseH).removeAlpha().raw().toBuffer();
  const { data: tgtData, info } = await sharp(resultBuf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const mskData  = await sharp(maskBuf).resize(baseW, baseH, { fit: "fill" }).grayscale().raw().toBuffer();
  const ch = info.channels; // 3

  // 각 채널 히스토그램 → CDF → LUT 생성
  const luts: Uint8Array[] = [];
  for (let c = 0; c < 3; c++) {
    const refHist = new Array(256).fill(0);
    const tgtHist = new Array(256).fill(0);
    let count = 0;
    for (let i = 0; i < baseW * baseH; i++) {
      if (mskData[i] > 128) {
        refHist[refData[i * 3 + c]]++;
        tgtHist[tgtData[i * ch + c]]++;
        count++;
      }
    }
    if (count < 50) { luts.push(Uint8Array.from({ length: 256 }, (_, i) => i)); continue; }

    // CDF 계산
    const refCdf = new Float32Array(256);
    const tgtCdf = new Float32Array(256);
    let rs = 0, ts = 0;
    for (let v = 0; v < 256; v++) {
      rs += refHist[v] / count; refCdf[v] = rs;
      ts += tgtHist[v] / count; tgtCdf[v] = ts;
    }

    // LUT: target 값 v → ref 값 중 CDF가 가장 가까운 값
    const lut = new Uint8Array(256);
    for (let v = 0; v < 256; v++) {
      let rv = 0;
      while (rv < 255 && refCdf[rv] < tgtCdf[v]) rv++;
      lut[v] = rv;
    }
    luts.push(lut);
  }

  // 마스크 영역만 LUT 적용 (엣지는 부드럽게 블렌딩)
  const outData = Buffer.from(tgtData);
  for (let i = 0; i < baseW * baseH; i++) {
    const alpha = mskData[i] / 255;
    if (alpha < 0.02) continue;
    for (let c = 0; c < 3; c++) {
      const orig   = tgtData[i * ch + c];
      const mapped = luts[c][orig];
      outData[i * ch + c] = Math.round(orig * (1 - alpha) + mapped * alpha);
    }
  }

  return sharp(outData, { raw: { width: baseW, height: baseH, channels: 3 } })
    .jpeg({ quality: 95 }).toBuffer();
}

// ── UPLOAD ACTIONS ───────────────────────────────────────────────────────────

export async function uploadOriginalPhoto(formData: FormData): Promise<
  | { ok: true;  originalUrl: string }
  | { ok: false; error: string }
> {
  await requireAdmin();
  const file = formData.get("original_photo") as File | null;
  if (!file || file.size === 0) return { ok: false, error: "원본 사진을 선택해주세요." };
  try { return { ok: true, originalUrl: await uploadFile(file, `original.${file.name.split(".").pop() || "jpg"}`) }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function uploadImageA(formData: FormData): Promise<
  | { ok: true;  imageAUrl: string }
  | { ok: false; error: string }
> {
  await requireAdmin();
  const file = formData.get("image_a") as File | null;
  if (!file || file.size === 0) return { ok: false, error: "이미지 A를 선택해주세요." };
  try { return { ok: true, imageAUrl: await uploadFile(file, `imageA.${file.name.split(".").pop() || "jpg"}`) }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function uploadTextureMask(formData: FormData): Promise<
  | { ok: true;  textureMaskUrl: string }
  | { ok: false; error: string }
> {
  await requireAdmin();
  const file = formData.get("texture_mask") as File | null;
  if (!file || file.size === 0) return { ok: false, error: "질감 마스크를 선택해주세요." };
  try { return { ok: true, textureMaskUrl: await uploadFile(file, "texture-mask.png") }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function runSam2TextureMask(
  imageAUrl: string,
  points: { x: number; y: number; label: number }[],
): Promise<
  | { ok: true;  sam2RawUrl: string }
  | { ok: false; error: string }
> {
  await requireAdmin();
  try {
    const res = await invokeEdgeFunction({ action: "sam2-mask", image_url: imageAUrl, points });
    if (!res.ok) return res;
    const rawUrl = String(res.data.outputUrl ?? "");
    if (!rawUrl) return { ok: false, error: "SAM 2 결과 URL 없음" };
    const buf = await downloadBuffer(rawUrl);
    return { ok: true, sam2RawUrl: await uploadBuffer(buf, "sam2-mask.png", "image/png") };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

// ── FACE PARSING (BiRefNet 사람 마스크 + YCbCr 피부색 검출) ─────────────────
// 외부 API 없이 Sharp 단독으로 처리.
// 1단계: BiRefNet으로 사람(인물) 실루엣 추출 → 배경 제거
// 2단계: YCbCr 색공간 피부색 범위 검출 (Kovac 기준, 다양한 피부톤 대응)
// 3단계: 두 마스크 AND → 형태학적 스무딩

export async function runFaceParsing(imageAUrl: string): Promise<
  | { ok: true;  maskUrl: string; segUrl: string }
  | { ok: false; error: string }
> {
  await requireAdmin();

  try {
    const imgBuf = await downloadBuffer(imageAUrl);

    // 원본 픽셀 (RGB 3채널)
    const { data: pixels, info } = await sharp(imgBuf)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height;

    // ── BiRefNet 사람 마스크 (실패 시 전체 이미지로 폴백) ─────────────────
    let personPx: Buffer | null = null;
    try {
      const birefBuf = await runBiRefNet(imageAUrl);
      const { data } = await sharp(birefBuf)
        .resize(W, H, { fit: "fill" })
        .ensureAlpha()
        .extractChannel(3)   // alpha 채널 = 사람 영역
        .raw()
        .toBuffer({ resolveWithObject: true });
      personPx = Buffer.from(data);
    } catch { /* BiRefNet 실패 시 전체 이미지에서 피부 검출 */ }

    // ── YCbCr 피부색 검출 ──────────────────────────────────────────────────
    // ITU-R BT.601 변환 후 Kovac 범위 적용
    // Cb: 77~127, Cr: 133~173, Y > 40 (너무 어두운 영역 제외)
    const maskRaw = Buffer.alloc(W * H, 0);
    for (let i = 0, pi = 0; pi < pixels.length; i++, pi += 3) {
      if (personPx && personPx[i] < 64) continue; // 사람 마스크 밖 = 제외

      const r = pixels[pi], g = pixels[pi + 1], b = pixels[pi + 2];
      const y  =  0.299   * r + 0.587   * g + 0.114   * b;
      const cb = -0.16874 * r - 0.33126 * g + 0.5     * b + 128;
      const cr =  0.5     * r - 0.41869 * g - 0.08131 * b + 128;

      if (y > 40 && cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173) {
        maskRaw[i] = 255;
      }
    }

    // ── 형태학적 스무딩 ────────────────────────────────────────────────────
    // blur(4) → 작은 구멍 채움 + 노이즈 제거
    // threshold(128) → 재이진화
    // blur(2) → 엣지 부드럽게
    const maskBuf = await sharp(maskRaw, { raw: { width: W, height: H, channels: 1 } })
      .blur(4)
      .threshold(128)
      .blur(2)
      .threshold(90)
      .png()
      .toBuffer();

    const maskUrl = await uploadBuffer(maskBuf, "face-parse-mask.png", "image/png");
    return { ok: true, maskUrl, segUrl: "" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── MAIN: 직접 텍스처 전사 ───────────────────────────────────────────────────

export type EyePoint = { x: number; y: number };

export async function directTextureTransfer(params: {
  originalUrl:    string;
  imageAUrl:      string;
  textureMaskUrl: string;
  blendStrength:  number;  // 0.0 ~ 1.0
  highPassRadius: number;  // Gaussian sigma (1~10): 낮을수록 모공, 높을수록 주름
  colorMatch:     boolean; // 텍스처 전사 후 이미지 A 피부톤으로 색상 보정
  // 얼굴 랜드마크 (각 이미지 원본 좌표계)
  origDims?:       { w: number; h: number };
  imageADims?:     { w: number; h: number };
  origLeftEye?:    EyePoint;
  origRightEye?:   EyePoint;
  imageALeftEye?:  EyePoint;
  imageARightEye?: EyePoint;
}): Promise<
  | { ok: true;  resultUrl: string; warpedUrl: string; highPassUrl: string }
  | { ok: false; error: string }
> {
  await requireAdmin();

  try {
    const [origBuf, baseBuf, maskBuf] = await Promise.all([
      downloadBuffer(params.originalUrl),
      downloadBuffer(params.imageAUrl),
      downloadBuffer(params.textureMaskUrl),
    ]);

    const { width: baseW, height: baseH } = await sharp(baseBuf).metadata() as { width: number; height: number };
    const { width: origW, height: origH } = await sharp(origBuf).metadata() as { width: number; height: number };

    // ── 1. ALIGNMENT ──────────────────────────────────────────────────────
    // 원본 사진을 이미지 A의 얼굴 각도·크기·위치에 정렬

    let warpedBuf: Buffer;

    const hasLandmarks =
      params.origLeftEye && params.origRightEye &&
      params.imageALeftEye && params.imageARightEye;

    if (hasLandmarks) {
      // ── 1a. 2-point similarity transform (landmark 기반) ──────────────
      // 원본을 baseW×baseH로 먼저 fit:fill 리사이즈한 뒤,
      // 스케일된 공간에서 2점 유사 변환을 계산해 affine 적용.
      // 핵심: forward 변환 계수를 직접 계산 → sx≠sy여도 정확.

      const lo = params.origLeftEye!,  ro = params.origRightEye!;
      const la = params.imageALeftEye!, ra = params.imageARightEye!;

      const sx = baseW / origW, sy = baseH / origH;
      // 원본 눈 좌표를 baseW×baseH 공간으로 스케일
      const lx0 = lo.x * sx, ly0 = lo.y * sy;
      const rx0 = ro.x * sx, ry0 = ro.y * sy;

      // 두 눈 벡터
      const dx_s = rx0 - lx0, dy_s = ry0 - ly0;   // scaled orig space
      const dx_a = ra.x - la.x, dy_a = ra.y - la.y; // imageA space

      const D = dx_s * dx_s + dy_s * dy_s;
      if (D < 1) throw new Error("원본 눈 포인트가 너무 가깝습니다.");

      // 순방향 유사 변환 계수 (scaled orig → imageA)
      const fwdA = (dx_s * dx_a + dy_s * dy_a) / D;
      const fwdB = (dx_s * dy_a - dy_s * dx_a) / D;
      const s2   = fwdA * fwdA + fwdB * fwdB; // = (scale)^2

      // 역행렬 (imageA → scaled orig): Sharp affine 입력
      const m00 =  fwdA / s2, m01 =  fwdB / s2;
      const m10 = -fwdB / s2, m11 =  fwdA / s2;

      const origResized = await sharp(origBuf).resize(baseW, baseH, { fit: "fill" }).toBuffer();
      warpedBuf = await sharp(origResized)
        .affine(
          [[m00, m01], [m10, m11]],
          { background: { r: 128, g: 128, b: 128 }, odx: la.x, ody: la.y, idx: lx0, idy: ly0 },
        )
        .resize(baseW, baseH, { fit: "fill" })
        .toBuffer();

    } else {
      // ── 1b. 랜드마크 없음 → 단순 full-image 리사이즈 ─────────────────
      // BiRefNet bbox crop 방식은 회색 캔버스 경계선이 high-pass에서
      // ghost face로 나타나는 아티팩트를 유발하므로 사용하지 않음.
      warpedBuf = await sharp(origBuf).resize(baseW, baseH, { fit: "fill" }).toBuffer();
    }

    // ── 2. HIGH-PASS FILTER ──────────────────────────────────────────────
    // 정렬된 원본에서 저주파(조명·색상) 제거 → 고주파 텍스처(모공·주름)만 남김
    // 결과는 128 중립값 기준 상하로 ±텍스처 정보 (amplify=2.0으로 편차 강조)

    const highPassBuf = await applyHighPass(warpedBuf, params.highPassRadius, 2.0);

    // 진단용 중간 결과 업로드 (비동기, 결과에 URL 포함)
    const [warpedUrl, highPassUrl] = await Promise.all([
      uploadBuffer(warpedBuf,   "dbg-warped.jpg",    "image/jpeg"),
      uploadBuffer(highPassBuf, "dbg-highpass.png",  "image/png"),
    ]);

    // ── 3. MASK + BLEND STRENGTH → alpha 채널 설정 ──────────────────────
    // 마스크 흰색(피부 영역)에만 텍스처 적용, 강도 = blendStrength

    const maskGray = await sharp(maskBuf)
      .resize(baseW, baseH, { fit: "fill" }).grayscale().raw().toBuffer();

    const { data: hpRaw, info: hpInfo } = await sharp(highPassBuf)
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    const ch = hpInfo.channels; // 4 (RGBA)
    for (let i = 0; i < baseW * baseH; i++) {
      hpRaw[i * ch + 3] = Math.round(maskGray[i] * params.blendStrength);
    }

    const maskedHP = await sharp(Buffer.from(hpRaw), { raw: { width: baseW, height: baseH, channels: ch } })
      .png().toBuffer();

    // ── 4. SOFT-LIGHT BLEND ──────────────────────────────────────────────
    // 고주파 텍스처를 이미지 A에 soft-light 모드로 합성
    // soft-light 특성: 128(중립) = 변화없음, ±편차가 미세한 명암으로 표현

    let resultBuf = await sharp(baseBuf)
      .resize(baseW, baseH)
      .composite([{ input: maskedHP, blend: "soft-light" }])
      .jpeg({ quality: 95 })
      .toBuffer();

    // ── 5. COLOR MATCH ───────────────────────────────────────────────────
    // 텍스처 전사로 생긴 색상 편차를 이미지 A의 피부톤에 맞게 히스토그램 매칭

    if (params.colorMatch) {
      resultBuf = await applyColorMatch(baseBuf, resultBuf, maskBuf, baseW, baseH);
    }

    const resultUrl = await uploadBuffer(resultBuf, "texture-transfer.jpg", "image/jpeg");
    return { ok: true, resultUrl, warpedUrl, highPassUrl };

  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
