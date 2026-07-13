"use server";

import { requireAdmin } from "@/lib/admin/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/admin-server";

const BUCKET = "invitation-photos";
const PREFIX = "cnxl-test";

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

export interface CnxlSettings {
  model_id: string;
  controlnet_model: string;
  ip_adapter_id: string;
  ip_adapter_scale: number;
  width: number;
  height: number;
  guidance_scale: number;
  num_inference_steps: number;
}

export async function submitCnxl(formData: FormData): Promise<
  | { ok: true; status: "success"; outputUrl: string }
  | { ok: true; status: "processing"; fetchUrl: string; eta: number }
  | { ok: false; error: string }
> {
  await requireAdmin();

  const controlnetFile = formData.get("controlnet_image") as File | null;
  const ipAdapterFile  = formData.get("ip_adapter_image") as File | null;
  const prompt         = (formData.get("prompt") as string | null)?.trim();

  if (!controlnetFile || controlnetFile.size === 0) return { ok: false, error: "controlnet_image를 선택해주세요." };
  if (!prompt) return { ok: false, error: "프롬프트를 입력해주세요." };

  try {
    const controlnetUrl = await uploadToStorage(controlnetFile, "controlnet");
    const ipAdapterUrl  = ipAdapterFile && ipAdapterFile.size > 0
      ? await uploadToStorage(ipAdapterFile, "ip-adapter")
      : controlnetUrl;

    const settings: CnxlSettings = {
      model_id:             (formData.get("model_id") as string) || "realistic-vision-v51",
      controlnet_model:     (formData.get("controlnet_model") as string) || "face_detector",
      ip_adapter_id:        (formData.get("ip_adapter_id") as string) || "ip-adapter-plus-face_sd15",
      ip_adapter_scale:     parseFloat((formData.get("ip_adapter_scale") as string) || "0.6"),
      width:                parseInt((formData.get("width") as string) || "512"),
      height:               parseInt((formData.get("height") as string) || "768"),
      guidance_scale:       parseFloat((formData.get("guidance_scale") as string) || "7.5"),
      num_inference_steps:  parseInt((formData.get("num_inference_steps") as string) || "21"),
    };

    const result = await invokeEdgeFunction({
      action: "cnxl-submit",
      controlnet_image: controlnetUrl,
      ip_adapter_image: ipAdapterUrl,
      prompt,
      negative_prompt: (formData.get("negative_prompt") as string) || "",
      ...settings,
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
      eta: Number(d.eta ?? 30),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function pollCnxl(fetchUrl: string): Promise<
  | { status: "success"; outputUrl: string }
  | { status: "processing"; eta: number }
  | { status: "error"; error: string }
> {
  await requireAdmin();

  const result = await invokeEdgeFunction({ action: "cnxl-poll", fetchUrl });

  if (!result.ok) return { status: "error", error: result.error };

  const d = result.data;
  if (d.error) return { status: "error", error: String(d.error) };
  if (d.status === "success") return { status: "success", outputUrl: String(d.outputUrl) };

  return { status: "processing", eta: Number(d.eta ?? 5) };
}
