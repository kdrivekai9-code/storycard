"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/requireAdmin";

const ALLOWED_FIELDS: Record<string, string[]> = {
  card_type: ["wedding", "obituary", "first_birthday", "general"],
  tier: ["standard", "premium"],
  status: ["draft", "published"],
};

export async function updateApplication(id: string, field: string, value: string) {
  const { supabase } = await requireAdmin();

  const allowed = ALLOWED_FIELDS[field];
  if (!allowed || !allowed.includes(value)) throw new Error("INVALID_FIELD");

  await supabase.from("invitations").update({ [field]: value }).eq("id", id);
  revalidatePath("/admin/applications");
}
