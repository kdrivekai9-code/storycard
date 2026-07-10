"use server";

import { requireAdmin } from "@/lib/admin/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/admin-server";

const BUCKET = "invitation-photos";
const PREFIX = "faceswap-test";

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

/** 이미지 업로드 후 ModelsLab에 제출 — 즉시 반환 */
export async function submitFaceSwap(formData: FormData): Promise<
  | { ok: true; status: "success"; outputUrl: string }
  | { ok: true; status: "processing"; fetchUrl: string; eta: number }
  | { ok: false; error: string }
> {
  await requireAdmin();

  const initFile = formData.get("init_image") as File | null;
  const targetFile = formData.get("target_image") as File | null;
  const referenceFile = formData.get("reference_image") as File | null;

  if (!initFile || initFile.size === 0) return { ok: false, error: "init_image를 선택해주세요." };
  if (!targetFile || targetFile.size === 0) return { ok: false, error: "target_image를 선택해주세요." };
  if (!referenceFile || referenceFile.size === 0) return { ok: false, error: "reference_image를 선택해주세요." };

  try {
    const [initUrl, targetUrl, referenceUrl] = await Promise.all([
      uploadToStorage(initFile, "init"),
      uploadToStorage(targetFile, "target"),
      uploadToStorage(referenceFile, "reference"),
    ]);

    const result = await invokeEdgeFunction({
      action: "submit",
      init_image: initUrl,
      target_image: targetUrl,
      reference_image: referenceUrl,
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
      eta: Number(d.eta ?? 5),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 처리 상태 폴링 */
export async function pollFaceSwap(fetchUrl: string): Promise<
  | { status: "success"; outputUrl: string }
  | { status: "processing"; eta: number }
  | { status: "error"; error: string }
> {
  await requireAdmin();

  const result = await invokeEdgeFunction({ action: "poll", fetchUrl });

  if (!result.ok) return { status: "error", error: result.error };

  const d = result.data;
  if (d.error) return { status: "error", error: String(d.error) };
  if (d.status === "success") return { status: "success", outputUrl: String(d.outputUrl) };

  return { status: "processing", eta: Number(d.eta ?? 3) };
}
