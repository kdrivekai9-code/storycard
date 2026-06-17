"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/requireAdmin";

const CARD_TYPES = ["wedding", "obituary", "first_birthday", "general"];
const TIERS = ["standard", "premium"];

export async function createSample(formData: FormData) {
  const { supabase } = await requireAdmin();

  const title = (formData.get("title") as string)?.trim();
  const cardType = formData.get("card_type") as string;
  const tier = formData.get("tier") as string;
  const thumbnailUrl = (formData.get("thumbnail_url") as string)?.trim() || null;
  const description = (formData.get("description") as string)?.trim() || null;
  const sortOrder = Number(formData.get("sort_order") ?? 0);
  const isPublished = formData.get("is_published") === "on";

  if (!title || !CARD_TYPES.includes(cardType) || !TIERS.includes(tier)) throw new Error("INVALID_INPUT");

  await supabase.from("samples").insert({
    title,
    card_type: cardType,
    tier,
    thumbnail_url: thumbnailUrl,
    description,
    sort_order: sortOrder,
    is_published: isPublished,
  });

  revalidatePath("/admin/samples");
  redirect("/admin/samples");
}

export async function updateSample(formData: FormData) {
  const { supabase } = await requireAdmin();

  const id = formData.get("id") as string;
  const title = (formData.get("title") as string)?.trim();
  const cardType = formData.get("card_type") as string;
  const tier = formData.get("tier") as string;
  const thumbnailUrl = (formData.get("thumbnail_url") as string)?.trim() || null;
  const description = (formData.get("description") as string)?.trim() || null;
  const sortOrder = Number(formData.get("sort_order") ?? 0);
  const isPublished = formData.get("is_published") === "on";

  if (!id || !title || !CARD_TYPES.includes(cardType) || !TIERS.includes(tier)) throw new Error("INVALID_INPUT");

  await supabase
    .from("samples")
    .update({
      title,
      card_type: cardType,
      tier,
      thumbnail_url: thumbnailUrl,
      description,
      sort_order: sortOrder,
      is_published: isPublished,
    })
    .eq("id", id);

  revalidatePath("/admin/samples");
  redirect("/admin/samples");
}

export async function deleteSample(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = formData.get("id") as string;
  await supabase.from("samples").delete().eq("id", id);
  revalidatePath("/admin/samples");
}

export async function toggleSamplePublish(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = formData.get("id") as string;
  const next = formData.get("next") === "true";
  await supabase.from("samples").update({ is_published: next }).eq("id", id);
  revalidatePath("/admin/samples");
}
