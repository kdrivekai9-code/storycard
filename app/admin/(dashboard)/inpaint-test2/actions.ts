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

async function uploadFile(file: File, name: string): Promise<string> {
  return uploadBuffer(await file.arrayBuffer(), name, file.type || "image/jpeg");
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

/** STEP 1: 원본 이미지 업로드 → ModelsLab 배경제거 → Supabase 재업로드 */
export async function generateMask(formData: FormData): Promise<
  | { ok: true; initUrl: string; bgRemovedUrl: string }
  | { ok: false; error: string }
> {
  await requireAdmin();

  const initFile = formData.get("init_image") as File | null;
  if (!initFile || initFile.size === 0) return { ok: false, error: "원본 이미지를 선택해주세요." };

  try {
    const initUrl = await uploadFile(initFile, `init.${initFile.name.split(".").pop() || "jpg"}`);

    // 배경 제거 (fal.ai BiRefNet, 동기 응답)
    const bgRes = await invokeEdgeFunction({ action: "bg-remove", image_url: initUrl });
    if (!bgRes.ok) return bgRes;

    const bgRemovedUrl = String(bgRes.data.outputUrl ?? "");
    if (!bgRemovedUrl) return { ok: false, error: "배경 제거 결과 URL을 받지 못했습니다." };

    const dlRes = await fetch(bgRemovedUrl);
    if (!dlRes.ok) return { ok: false, error: "배경 제거 이미지 다운로드 실패" };
    const buffer = await dlRes.arrayBuffer();
    const ourBgRemovedUrl = await uploadBuffer(buffer, "bgremoved.png", "image/png");

    return { ok: true, initUrl, bgRemovedUrl: ourBgRemovedUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** STEP 2: 마스크 + 프롬프트 → fal.ai Juggernaut Flux Inpainting */
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
    const maskUrl = await uploadFile(maskFile, "mask.png");

    const result = await invokeEdgeFunction({
      action: "fal-inpaint-submit",
      image_url:           initUrl,
      mask_url:            maskUrl,
      prompt,
      negative_prompt:     (formData.get("negative_prompt") as string) || "",
      num_inference_steps: parseInt((formData.get("num_inference_steps") as string) || "28"),
      guidance_scale:      parseFloat((formData.get("guidance_scale") as string) || "3.5"),
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
