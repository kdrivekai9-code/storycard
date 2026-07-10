"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/requireAdmin";

// ── 서비스 설정 업데이트 ─────────────────────────────────────────────────────

export async function updateServiceConfig(formData: FormData) {
  const { supabase } = await requireAdmin();

  const serviceId = formData.get("service_id") as string;
  const isActive = formData.get("is_active") === "on";
  const model = (formData.get("model") as string)?.trim();
  const modelOptionsRaw = (formData.get("model_options") as string)?.trim();
  const defaultPrompt = (formData.get("default_prompt") as string)?.trim() ?? "";
  const estimateSec = Number(formData.get("estimate_sec") ?? 60);

  if (!serviceId || !model) throw new Error("INVALID_INPUT");

  let modelOptions: Record<string, unknown> = {};
  try {
    modelOptions = JSON.parse(modelOptionsRaw || "{}");
  } catch {
    throw new Error("모델 옵션이 올바른 JSON 형식이 아닙니다.");
  }

  await supabase
    .from("premium_service_configs")
    .update({
      is_active: isActive,
      model,
      model_options: modelOptions,
      default_prompt: defaultPrompt,
      estimate_sec: estimateSec,
      updated_at: new Date().toISOString(),
    })
    .eq("service_id", serviceId);

  revalidatePath("/admin/premium");
  redirect(`/admin/premium?service=${serviceId}`);
}

// ── 서비스 프리셋 (말풍선 텍스트 등) ─────────────────────────────────────────

export async function createPreset(formData: FormData) {
  const { supabase } = await requireAdmin();

  const serviceId = formData.get("service_id") as string;
  const label = (formData.get("label") as string)?.trim();
  const value = (formData.get("value") as string)?.trim();
  const sortOrder = Number(formData.get("sort_order") ?? 0);

  if (!serviceId || !label || !value) throw new Error("INVALID_INPUT");

  await supabase.from("premium_service_presets").insert({
    service_id: serviceId,
    label,
    value,
    sort_order: sortOrder,
    is_active: true,
  });

  revalidatePath("/admin/premium");
  redirect(`/admin/premium?service=${serviceId}`);
}

export async function deletePreset(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = formData.get("id") as string;
  const serviceId = formData.get("service_id") as string;
  await supabase.from("premium_service_presets").delete().eq("id", id);
  revalidatePath("/admin/premium");
  redirect(`/admin/premium?service=${serviceId}`);
}

export async function togglePreset(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = formData.get("id") as string;
  const next = formData.get("next") === "true";
  await supabase.from("premium_service_presets").update({ is_active: next }).eq("id", id);
  revalidatePath("/admin/premium");
}

// ── 배경 스타일 (서비스4) ────────────────────────────────────────────────────

export async function createBgStyle(formData: FormData) {
  const { supabase } = await requireAdmin();

  const id = (formData.get("id") as string)?.trim().toLowerCase().replace(/\s+/g, "-");
  const label = (formData.get("label") as string)?.trim();
  const seed = formData.get("seed") ? Number(formData.get("seed")) : null;
  const prompt = (formData.get("prompt") as string)?.trim() ?? "";
  const imageUrl = (formData.get("image_url") as string)?.trim() ?? "";
  const modelImageUrl = (formData.get("model_image_url") as string)?.trim() ?? "";
  const sortOrder = Number(formData.get("sort_order") ?? 0);

  if (!id || !label) throw new Error("INVALID_INPUT");

  await supabase.from("premium_bg_styles").insert({
    id,
    label,
    seed,
    prompt,
    image_url: imageUrl,
    model_image_url: modelImageUrl,
    sort_order: sortOrder,
    is_active: true,
  });

  revalidatePath("/admin/premium");
  redirect("/admin/premium?service=bg-change");
}

export async function updateBgStyle(formData: FormData) {
  const { supabase } = await requireAdmin();

  const id = formData.get("id") as string;
  const label = (formData.get("label") as string)?.trim();
  const seed = formData.get("seed") ? Number(formData.get("seed")) : null;
  const prompt = (formData.get("prompt") as string)?.trim() ?? "";
  const imageUrl = (formData.get("image_url") as string)?.trim() ?? "";
  const modelImageUrl = (formData.get("model_image_url") as string)?.trim() ?? "";
  const sortOrder = Number(formData.get("sort_order") ?? 0);
  const isActive = formData.get("is_active") === "on";

  if (!id || !label) throw new Error("INVALID_INPUT");

  await supabase
    .from("premium_bg_styles")
    .update({
      label,
      seed,
      prompt,
      image_url: imageUrl,
      model_image_url: modelImageUrl,
      sort_order: sortOrder,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath("/admin/premium");
  redirect("/admin/premium?service=bg-change");
}

export async function deleteBgStyle(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = formData.get("id") as string;
  await supabase.from("premium_bg_styles").delete().eq("id", id);
  revalidatePath("/admin/premium");
}
