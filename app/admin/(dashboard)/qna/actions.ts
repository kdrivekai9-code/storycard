"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/requireAdmin";

export async function createQna(formData: FormData) {
  const { supabase } = await requireAdmin();

  const question = (formData.get("question") as string)?.trim();
  const answer = (formData.get("answer") as string)?.trim();
  const category = (formData.get("category") as string)?.trim() || null;
  const sortOrder = Number(formData.get("sort_order") ?? 0);
  const isPublished = formData.get("is_published") === "on";

  if (!question || !answer) throw new Error("INVALID_INPUT");

  await supabase.from("qna").insert({
    question,
    answer,
    category,
    sort_order: sortOrder,
    is_published: isPublished,
  });

  revalidatePath("/admin/qna");
  redirect("/admin/qna");
}

export async function updateQna(formData: FormData) {
  const { supabase } = await requireAdmin();

  const id = formData.get("id") as string;
  const question = (formData.get("question") as string)?.trim();
  const answer = (formData.get("answer") as string)?.trim();
  const category = (formData.get("category") as string)?.trim() || null;
  const sortOrder = Number(formData.get("sort_order") ?? 0);
  const isPublished = formData.get("is_published") === "on";

  if (!id || !question || !answer) throw new Error("INVALID_INPUT");

  await supabase
    .from("qna")
    .update({ question, answer, category, sort_order: sortOrder, is_published: isPublished })
    .eq("id", id);

  revalidatePath("/admin/qna");
  redirect("/admin/qna");
}

export async function deleteQna(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = formData.get("id") as string;
  await supabase.from("qna").delete().eq("id", id);
  revalidatePath("/admin/qna");
}

export async function toggleQnaPublish(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = formData.get("id") as string;
  const next = formData.get("next") === "true";
  await supabase.from("qna").update({ is_published: next }).eq("id", id);
  revalidatePath("/admin/qna");
}
