"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/requireAdmin";

export async function toggleReviewPublish(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = formData.get("id") as string;
  const next = formData.get("next") === "true";
  await supabase.from("reviews").update({ is_published: next }).eq("id", id);
  revalidatePath("/admin/reviews");
}

export async function deleteReview(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = formData.get("id") as string;
  await supabase.from("reviews").delete().eq("id", id);
  revalidatePath("/admin/reviews");
}
