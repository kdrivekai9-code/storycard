"use server";

import { requireAdmin } from "@/lib/admin/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/admin-server";

const BUCKET = "invitation-photos";
const PREFIX = "inpaint-test2";

async function uploadBuffer(buffer: ArrayBuffer, name: string, contentType: string): Promise<string> {
  const admin = createAdminClient();
  const path = `${PREFIX}/${Date.now()}-${name}`;
  const { error } = await admin.storage.from(BUCKET).upload(path, new Uint8Array(buffer), {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`스토리지 업로드 실패(${name}): ${error.message}`);
  return admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

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

async function reuploadFromUrl(url: string, name: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`이미지 다운로드 실패: ${url}`);
  const buffer = await res.arrayBuffer();
  return uploadBuffer(buffer, name, "image/png");
}

/** 원본 이미지 업로드 → Supabase URL 반환 */
export async function uploadInitImage(formData: FormData): Promise<
  | { ok: true; initUrl: string }
  | { ok: false; error: string }
> {
  await requireAdmin();
  const file = formData.get("init_image") as File | null;
  if (!file || file.size === 0) return { ok: false, error: "원본 이미지를 선택해주세요." };
  try {
    const ext = file.name.split(".").pop() || "jpg";
    const url = await uploadBuffer(await file.arrayBuffer(), `init.${ext}`, file.type || "image/jpeg");
    return { ok: true, initUrl: url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** BiRefNet 배경제거 → Supabase 재업로드 (Canvas가 CORS 없이 접근) */
export async function runBiRefNetMask(initUrl: string): Promise<
  | { ok: true; bgRemovedUrl: string }
  | { ok: false; error: string }
> {
  await requireAdmin();
  try {
    const bgRes = await invokeEdgeFunction({ action: "bg-remove", image_url: initUrl });
    if (!bgRes.ok) return bgRes;
    const rawUrl = String(bgRes.data.outputUrl ?? "");
    if (!rawUrl) return { ok: false, error: "배경 제거 결과 URL을 받지 못했습니다." };
    const ourUrl = await reuploadFromUrl(rawUrl, "bgremoved.png");
    return { ok: true, bgRemovedUrl: ourUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** SAM 2 마스크 생성 → Supabase 재업로드 */
export async function runSam2Mask(
  initUrl: string,
  points: { x: number; y: number; label: number }[],
): Promise<
  | { ok: true; sam2MaskUrl: string }
  | { ok: false; error: string }
> {
  await requireAdmin();
  try {
    const res = await invokeEdgeFunction({ action: "sam2-mask", image_url: initUrl, points });
    if (!res.ok) return res;
    const rawUrl = String(res.data.outputUrl ?? "");
    if (!rawUrl) return { ok: false, error: "SAM 2 마스크 URL을 받지 못했습니다." };
    const ourUrl = await reuploadFromUrl(rawUrl, "sam2-mask.png");
    return { ok: true, sam2MaskUrl: ourUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Flux Inpainting 제출 */
export async function submitFalInpaint(formData: FormData): Promise<
  | { ok: true; status: "processing"; statusUrl: string; responseUrl: string }
  | { ok: false; error: string }
> {
  await requireAdmin();

  const initUrl  = (formData.get("init_url") as string | null)?.trim();
  const maskFile = formData.get("mask_image") as File | null;
  const prompt   = (formData.get("prompt") as string | null)?.trim();

  if (!initUrl)                         return { ok: false, error: "원본 이미지 URL이 없습니다." };
  if (!maskFile || maskFile.size === 0) return { ok: false, error: "마스크 이미지가 없습니다." };
  if (!prompt)                          return { ok: false, error: "프롬프트를 입력해주세요." };

  try {
    const maskUrl = await uploadBuffer(await maskFile.arrayBuffer(), "mask.png", "image/png");

    const result = await invokeEdgeFunction({
      action: "fal-inpaint-submit",
      image_url:           initUrl,
      mask_url:            maskUrl,
      prompt,
      negative_prompt:     (formData.get("negative_prompt") as string) || "",
      num_inference_steps: parseInt((formData.get("num_inference_steps") as string) || "28"),
      guidance_scale:      Math.min(5, parseFloat((formData.get("guidance_scale") as string) || "3.5")),
      strength:            parseFloat((formData.get("strength") as string) || "0.85"),
      seed:                (formData.get("seed") as string) || undefined,
    });

    if (!result.ok) return result;
    const d = result.data;
    if (d.error) return { ok: false, error: String(d.error) };

    return {
      ok: true,
      status: "processing",
      statusUrl:   String(d.statusUrl),
      responseUrl: String(d.responseUrl),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function pollFalInpaint(statusUrl: string, responseUrl: string): Promise<
  | { status: "success"; outputUrl: string }
  | { status: "processing" }
  | { status: "error"; error: string }
> {
  await requireAdmin();
  const result = await invokeEdgeFunction({ action: "fal-inpaint-poll", statusUrl, responseUrl });
  if (!result.ok) return { status: "error", error: result.error };
  const d = result.data;
  if (d.error)              return { status: "error", error: String(d.error) };
  if (d.status === "success") return { status: "success", outputUrl: String(d.outputUrl) };
  return { status: "processing" };
}
