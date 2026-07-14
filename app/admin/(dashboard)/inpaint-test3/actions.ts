"use server";

import sharp from "sharp";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/admin-server";

const BUCKET = "invitation-photos";
const PREFIX = "inpaint-test3";

// ── Storage helpers ─────────────────────────────────────────────────────────

async function uploadBuffer(buf: ArrayBuffer | Buffer, name: string, contentType: string): Promise<string> {
  const admin = createAdminClient();
  const path  = `${PREFIX}/${Date.now()}-${name}`;
  const data  = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  const { error } = await admin.storage.from(BUCKET).upload(path, data, { contentType, upsert: true });
  if (error) throw new Error(`업로드 실패(${name}): ${error.message}`);
  return admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function uploadFile(file: File, name: string): Promise<string> {
  return uploadBuffer(await file.arrayBuffer(), name, file.type || "image/jpeg");
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

// ── STEP 1: 이미지 A 업로드 ─────────────────────────────────────────────────

export async function uploadImageA(formData: FormData): Promise<
  | { ok: true; imageAUrl: string }
  | { ok: false; error: string }
> {
  await requireAdmin();
  const file = formData.get("image_a") as File | null;
  if (!file || file.size === 0) return { ok: false, error: "이미지를 선택해주세요." };
  try {
    const url = await uploadFile(file, `imageA.${file.name.split(".").pop() || "jpg"}`);
    return { ok: true, imageAUrl: url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── STEP 2: 질감 마스크 업로드 ──────────────────────────────────────────────

export async function uploadTextureMask(formData: FormData): Promise<
  | { ok: true; textureMaskUrl: string }
  | { ok: false; error: string }
> {
  await requireAdmin();
  const file = formData.get("texture_mask") as File | null;
  if (!file || file.size === 0) return { ok: false, error: "질감 마스크 이미지를 선택해주세요." };
  try {
    const url = await uploadFile(file, "texture-mask.png");
    return { ok: true, textureMaskUrl: url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── STEP 2 (SAM 2 옵션): 포인트로 질감 마스크 생성 ─────────────────────────

export async function runSam2TextureMask(
  imageAUrl: string,
  points: { x: number; y: number; label: number }[],
): Promise<
  | { ok: true; sam2RawUrl: string }
  | { ok: false; error: string }
> {
  await requireAdmin();
  try {
    const res = await invokeEdgeFunction({ action: "sam2-mask", image_url: imageAUrl, points });
    if (!res.ok) return res;
    const rawUrl = String(res.data.outputUrl ?? "");
    if (!rawUrl) return { ok: false, error: "SAM 2 결과 URL 없음" };
    // 재업로드 (CORS-free Canvas 접근용)
    const buf = await downloadBuffer(rawUrl);
    const ourUrl = await uploadBuffer(buf, "sam2-texture-mask.png", "image/png");
    return { ok: true, sam2RawUrl: ourUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── STEP 3: 질감 복원 인페인팅 (low strength) ───────────────────────────────

export async function submitTextureInpainting(formData: FormData): Promise<
  | { ok: true; status: "success"; outputUrl: string }
  | { ok: true; status: "processing"; fetchUrl: string; eta: number }
  | { ok: false; error: string }
> {
  await requireAdmin();

  const imageAUrl      = (formData.get("image_a_url") as string | null)?.trim();
  const maskFile       = formData.get("texture_mask_file") as File | null;
  const textureMaskUrl = (formData.get("texture_mask_url") as string | null)?.trim();
  const prompt         = (formData.get("prompt") as string | null)?.trim();

  if (!imageAUrl) return { ok: false, error: "이미지 A URL이 없습니다." };
  if (!prompt)    return { ok: false, error: "프롬프트를 입력해주세요." };

  let maskUrl = textureMaskUrl ?? "";
  if (!maskUrl && maskFile && maskFile.size > 0) {
    maskUrl = await uploadFile(maskFile, "texture-mask-upload.png");
  }
  if (!maskUrl) return { ok: false, error: "질감 마스크가 없습니다." };

  try {
    const result = await invokeEdgeFunction({
      action:              "inpaint-submit",
      init_image:          imageAUrl,
      mask_image:          maskUrl,
      prompt,
      negative_prompt:     (formData.get("negative_prompt") as string) || "blur, artifacts, oversmoothed skin",
      model_id:            (formData.get("model_id") as string) || "realistic-vision-v51",
      width:               parseInt((formData.get("width") as string) || "512"),
      height:              parseInt((formData.get("height") as string) || "768"),
      guidance_scale:      parseFloat((formData.get("guidance_scale") as string) || "7"),
      num_inference_steps: parseInt((formData.get("num_inference_steps") as string) || "31"),
      strength:            parseFloat((formData.get("strength") as string) || "0.4"),
    });

    if (!result.ok) return result;
    const d = result.data;
    if (d.error) return { ok: false, error: String(d.error) };
    if (d.status === "success") return { ok: true, status: "success", outputUrl: String(d.outputUrl) };
    return { ok: true, status: "processing", fetchUrl: String(d.fetchUrl), eta: Number(d.eta ?? 20) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function pollTextureInpainting(fetchUrl: string): Promise<
  | { status: "success"; outputUrl: string }
  | { status: "processing"; eta: number }
  | { status: "error"; error: string }
> {
  await requireAdmin();
  const result = await invokeEdgeFunction({ action: "inpaint-poll", fetchUrl });
  if (!result.ok) return { status: "error", error: result.error };
  const d = result.data;
  if (d.error)               return { status: "error", error: String(d.error) };
  if (d.status === "success") return { status: "success", outputUrl: String(d.outputUrl) };
  return { status: "processing", eta: Number(d.eta ?? 5) };
}

// ── STEP 4: Sharp 이목구비 합성 ─────────────────────────────────────────────
// base    = STEP 3 결과 (질감 복원 이미지 B)
// source  = 이미지 A (정확한 이목구비 원본)
// mask    = 이목구비 마스크 (흰색=이목구비 영역, 검정=피부)

export async function compositeFeatures(params: {
  baseUrl:    string; // Image B (질감 복원)
  sourceUrl:  string; // Image A (원본 이목구비)
  maskUrl:    string; // 이목구비 마스크
}): Promise<
  | { ok: true; resultUrl: string }
  | { ok: false; error: string }
> {
  await requireAdmin();

  try {
    const [baseBuf, sourceBuf, maskBuf] = await Promise.all([
      downloadBuffer(params.baseUrl),
      downloadBuffer(params.sourceUrl),
      downloadBuffer(params.maskUrl),
    ]);

    // 기준 이미지 크기
    const { width, height } = await sharp(baseBuf).metadata();
    if (!width || !height) throw new Error("이미지 크기를 읽을 수 없습니다.");

    // 이목구비 마스크(흰=이목구비)를 알파로 사용해 Image A의 이목구비 영역만 추출
    const featureLayer = await sharp(sourceBuf)
      .resize(width, height, { fit: "fill" })
      .ensureAlpha()
      .composite([{
        input: await sharp(maskBuf)
          .resize(width, height, { fit: "fill" })
          .grayscale()
          .toBuffer(),
        blend: "dest-in", // 마스크 흰색 영역만 Source 픽셀 유지
      }])
      .toBuffer();

    // Image B 위에 이목구비 레이어 합성
    const resultBuf = await sharp(baseBuf)
      .resize(width, height, { fit: "fill" })
      .composite([{
        input: featureLayer,
        blend: "over",
      }])
      .jpeg({ quality: 95 })
      .toBuffer();

    const resultUrl = await uploadBuffer(resultBuf, "composite-result.jpg", "image/jpeg");
    return { ok: true, resultUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── 이목구비 마스크 파일 업로드 ─────────────────────────────────────────────

export async function uploadFeaturesMask(formData: FormData): Promise<
  | { ok: true; featuresMaskUrl: string }
  | { ok: false; error: string }
> {
  await requireAdmin();
  const file = formData.get("features_mask") as File | null;
  if (!file || file.size === 0) return { ok: false, error: "이목구비 마스크 이미지를 선택해주세요." };
  try {
    const url = await uploadFile(file, "features-mask.png");
    return { ok: true, featuresMaskUrl: url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
