"use server";

import { requireAdmin } from "@/lib/admin/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/admin-server";

const BUCKET = "invitation-photos";
const PREFIX = "inpaint-test";

async function uploadToStorage(file: File, name: string): Promise<string> {
  const admin = createAdminClient();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${PREFIX}/${Date.now()}-${name}.${ext}`;

  const { error } = await admin.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "image/jpeg",
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

export async function submitInpaint(formData: FormData): Promise<
  | { ok: true; status: "success"; outputUrl: string }
  | { ok: true; status: "processing"; fetchUrl: string; eta: number }
  | { ok: false; error: string }
> {
  await requireAdmin();

  const initFile = formData.get("init_image") as File | null;
  const maskFile = formData.get("mask_image") as File | null;
  const prompt   = (formData.get("prompt") as string | null)?.trim();

  if (!initFile || initFile.size === 0) return { ok: false, error: "원본 이미지를 선택해주세요." };
  if (!maskFile || maskFile.size === 0) return { ok: false, error: "마스크 이미지를 선택해주세요." };
  if (!prompt) return { ok: false, error: "프롬프트를 입력해주세요." };

  try {
    const [initUrl, maskUrl] = await Promise.all([
      uploadToStorage(initFile, "init"),
      uploadToStorage(maskFile, "mask"),
    ]);

    const result = await invokeEdgeFunction({
      action: "inpaint-submit",
      init_image:          initUrl,
      mask_image:          maskUrl,
      prompt,
      negative_prompt:     (formData.get("negative_prompt") as string) || "",
      model_id:            (formData.get("model_id") as string) || "realistic-vision-v51",
      width:               parseInt((formData.get("width") as string) || "512"),
      height:              parseInt((formData.get("height") as string) || "768"),
      guidance_scale:      parseFloat((formData.get("guidance_scale") as string) || "7.5"),
      num_inference_steps: parseInt((formData.get("num_inference_steps") as string) || "31"),
      strength:            parseFloat((formData.get("strength") as string) || "0.8"),
    });

    if (!result.ok) return result;

    const d = result.data;
    if (d.error) return { ok: false, error: String(d.error) };

    if (d.status === "success") {
      return { ok: true, status: "success", outputUrl: String(d.outputUrl) };
    }

    return {
      ok: true,
      status: "processing",
      fetchUrl: String(d.fetchUrl),
      eta: Number(d.eta ?? 20),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function pollInpaint(fetchUrl: string): Promise<
  | { status: "success"; outputUrl: string }
  | { status: "processing"; eta: number }
  | { status: "error"; error: string }
> {
  await requireAdmin();

  const result = await invokeEdgeFunction({ action: "inpaint-poll", fetchUrl });

  if (!result.ok) return { status: "error", error: result.error };

  const d = result.data;
  if (d.error) return { status: "error", error: String(d.error) };
  if (d.status === "success") return { status: "success", outputUrl: String(d.outputUrl) };

  return { status: "processing", eta: Number(d.eta ?? 5) };
}
