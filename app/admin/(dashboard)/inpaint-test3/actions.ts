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
      if (ctx) {
        const b = await ctx.json().catch(() => ctx.text());
        detail = typeof b === "string" ? b : JSON.stringify(b);
      }
    } catch { /* ignore */ }
    return { ok: false as const, error: detail };
  }
  return { ok: true as const, data: data as Record<string, unknown> };
}

// BiRefNet 배경 제거 → 마스크 버퍼 반환 (인물 영역 감지용)
async function runBiRefNet(imageUrl: string): Promise<Buffer> {
  const res = await invokeEdgeFunction({ action: "bg-remove", image_url: imageUrl });
  if (!res.ok) throw new Error(`BiRefNet 오류: ${res.error}`);
  const rawUrl = String(res.data.outputUrl ?? "");
  if (!rawUrl) throw new Error("BiRefNet 결과 URL 없음");
  return downloadBuffer(rawUrl);
}

// 투명 PNG에서 비투명 픽셀의 바운딩 박스 계산
async function getBoundingBox(transparentPngBuf: Buffer): Promise<{ left: number; top: number; width: number; height: number }> {
  const { data, info } = await sharp(transparentPngBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let minX = info.width, maxX = 0, minY = info.height, maxY = 0;
  const w = info.width;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 32) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (minX > maxX || minY > maxY) return { left: 0, top: 0, width: info.width, height: info.height };
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

// ── STEP 1: 원본 사진 업로드 ─────────────────────────────────────────────────

export async function uploadOriginalPhoto(formData: FormData): Promise<
  | { ok: true;  originalUrl: string }
  | { ok: false; error: string }
> {
  await requireAdmin();
  const file = formData.get("original_photo") as File | null;
  if (!file || file.size === 0) return { ok: false, error: "원본 사진을 선택해주세요." };
  try {
    const url = await uploadFile(file, `original.${file.name.split(".").pop() || "jpg"}`);
    return { ok: true, originalUrl: url };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

// ── STEP 1: 이미지 A 업로드 (페이스스왑 완료본) ──────────────────────────────

export async function uploadImageA(formData: FormData): Promise<
  | { ok: true;  imageAUrl: string }
  | { ok: false; error: string }
> {
  await requireAdmin();
  const file = formData.get("image_a") as File | null;
  if (!file || file.size === 0) return { ok: false, error: "이미지 A를 선택해주세요." };
  try {
    const url = await uploadFile(file, `imageA.${file.name.split(".").pop() || "jpg"}`);
    return { ok: true, imageAUrl: url };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

// ── STEP 2: 질감 마스크 업로드 ──────────────────────────────────────────────

export async function uploadTextureMask(formData: FormData): Promise<
  | { ok: true;  textureMaskUrl: string }
  | { ok: false; error: string }
> {
  await requireAdmin();
  const file = formData.get("texture_mask") as File | null;
  if (!file || file.size === 0) return { ok: false, error: "질감 마스크 이미지를 선택해주세요." };
  try {
    const url = await uploadFile(file, "texture-mask.png");
    return { ok: true, textureMaskUrl: url };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

// ── STEP 2: SAM 2 포인트로 질감 마스크 생성 ─────────────────────────────────

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
    const ourUrl = await uploadBuffer(buf, "sam2-texture-mask.png", "image/png");
    return { ok: true, sam2RawUrl: ourUrl };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

// ── STEP 3: Sharp 직접 텍스처 전사 ──────────────────────────────────────────
//
// 원본 사진의 피부 질감(주름·보조개·모공)을 이미지 A의 피부 영역에 직접 전사합니다.
// BiRefNet으로 두 이미지의 인물 영역을 감지해 얼굴 위치를 자동 정렬한 뒤,
// soft-light 블렌드 모드로 텍스처를 합성합니다.
//
// - useAutoAlign=true : BiRefNet 바운딩박스 기반 자동 정렬 (느리지만 정확)
// - useAutoAlign=false: 단순 리사이즈 정렬 (빠르지만 구도가 비슷한 경우에만 유효)

export async function directTextureTransfer(params: {
  originalUrl:    string;
  imageAUrl:      string;
  textureMaskUrl: string;
  blendStrength:  number; // 0.0 ~ 1.0
  useAutoAlign:   boolean;
}): Promise<
  | { ok: true;  resultUrl: string }
  | { ok: false; error: string }
> {
  await requireAdmin();

  try {
    const [origBuf, baseBuf, maskBuf] = await Promise.all([
      downloadBuffer(params.originalUrl),
      downloadBuffer(params.imageAUrl),
      downloadBuffer(params.textureMaskUrl),
    ]);

    const baseMeta = await sharp(baseBuf).metadata();
    const baseW = baseMeta.width!;
    const baseH = baseMeta.height!;

    // ── 1. 원본 사진을 이미지 A 얼굴 위치에 정렬 ───────────────────────────

    let alignedOrigBuf: Buffer;

    if (params.useAutoAlign) {
      // BiRefNet으로 두 이미지의 인물 영역 감지 → 바운딩박스 산출
      const [origPersonMask, basePersonMask] = await Promise.all([
        runBiRefNet(params.originalUrl),
        runBiRefNet(params.imageAUrl),
      ]);

      const [origBbox, baseBbox] = await Promise.all([
        getBoundingBox(origPersonMask),
        getBoundingBox(basePersonMask),
      ]);

      // 인물 바운딩박스의 상단 45%를 얼굴/두상 영역으로 추정
      const origFace = {
        left:   origBbox.left,
        top:    origBbox.top,
        width:  origBbox.width,
        height: Math.max(1, Math.round(origBbox.height * 0.45)),
      };
      const baseFace = {
        left:   baseBbox.left,
        top:    baseBbox.top,
        width:  baseBbox.width,
        height: Math.max(1, Math.round(baseBbox.height * 0.45)),
      };

      const origMeta = await sharp(origBuf).metadata();
      const safeOrigFace = {
        left:   Math.max(0, origFace.left),
        top:    Math.max(0, origFace.top),
        width:  Math.min(origFace.width,  origMeta.width!  - Math.max(0, origFace.left)),
        height: Math.min(origFace.height, origMeta.height! - Math.max(0, origFace.top)),
      };

      // 원본 얼굴 크롭 → 이미지 A 얼굴 크기로 리사이즈
      const origFaceCrop = await sharp(origBuf)
        .extract(safeOrigFace)
        .resize(baseFace.width, baseFace.height, { fit: "fill" })
        .toBuffer();

      // 회색(128) 캔버스 위에 정렬된 얼굴 크롭 배치
      const grayCanvas = await sharp({
        create: { width: baseW, height: baseH, channels: 3, background: { r: 128, g: 128, b: 128 } },
      }).png().toBuffer();

      alignedOrigBuf = await sharp(grayCanvas)
        .composite([{
          input: origFaceCrop,
          top:   Math.max(0, baseFace.top),
          left:  Math.max(0, baseFace.left),
        }])
        .png()
        .toBuffer();

    } else {
      // 단순 리사이즈: 원본을 이미지 A 크기에 맞게 축소(비율 유지) + 중앙 배치
      const origMeta = await sharp(origBuf).metadata();
      const scale  = Math.min(baseW / origMeta.width!, baseH / origMeta.height!);
      const fitW   = Math.round(origMeta.width!  * scale);
      const fitH   = Math.round(origMeta.height! * scale);
      const offsetX = Math.round((baseW - fitW) / 2);
      const offsetY = Math.round((baseH - fitH) / 2);

      const resized = await sharp(origBuf).resize(fitW, fitH).png().toBuffer();
      const grayCanvas = await sharp({
        create: { width: baseW, height: baseH, channels: 3, background: { r: 128, g: 128, b: 128 } },
      }).png().toBuffer();

      alignedOrigBuf = await sharp(grayCanvas)
        .composite([{ input: resized, top: offsetY, left: offsetX }])
        .png()
        .toBuffer();
    }

    // ── 2. 질감 마스크를 알파로 적용 (피부 영역만 전사) ──────────────────────

    // 마스크 그레이스케일 리사이즈
    const maskGray = await sharp(maskBuf)
      .resize(baseW, baseH, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // alignedOrig에 알파 추가 후 마스크 값으로 알파 설정
    const alignedRaw = await sharp(alignedOrigBuf)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const aData   = alignedRaw.data;
    const mData   = maskGray.data;
    const pixels  = baseW * baseH;

    for (let i = 0; i < pixels; i++) {
      // alpha = mask_value * blend_strength
      aData[i * 4 + 3] = Math.round(mData[i] * params.blendStrength);
    }

    const maskedAligned = await sharp(Buffer.from(aData), {
      raw: { width: baseW, height: baseH, channels: 4 },
    }).png().toBuffer();

    // ── 3. soft-light 블렌드로 이미지 A에 텍스처 전사 ───────────────────────

    const resultBuf = await sharp(baseBuf)
      .resize(baseW, baseH)
      .composite([{ input: maskedAligned, blend: "soft-light" }])
      .jpeg({ quality: 95 })
      .toBuffer();

    const resultUrl = await uploadBuffer(resultBuf, "texture-transfer.jpg", "image/jpeg");
    return { ok: true, resultUrl };

  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
