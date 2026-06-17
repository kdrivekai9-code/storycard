"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createReview(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("UNAUTHORIZED");

  const invitationId = formData.get("invitation_id") as string;
  const rating = Number(formData.get("rating"));
  const content = (formData.get("content") as string)?.trim();

  if (!invitationId || !content || rating < 1 || rating > 5) throw new Error("INVALID_INPUT");

  await supabase.from("reviews").insert({
    invitation_id: invitationId,
    author_id: user.id,
    rating,
    content,
  });

  revalidatePath("/my");
}
