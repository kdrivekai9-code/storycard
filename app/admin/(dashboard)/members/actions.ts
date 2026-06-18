"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function toggleRole(id: string, _field: string, nextRole: string) {
  const { supabase } = await requireAdmin();

  if (nextRole !== "user" && nextRole !== "admin") throw new Error("INVALID_ROLE");

  await supabase.from("profiles").update({ role: nextRole }).eq("id", id);
  revalidatePath("/admin/members");
}

export async function updateMember(
  id: string,
  nickname: string,
  phone: string,
  ci: string,
  receiverName: string,
  shippingAddress: string,
  shippingDetail: string,
) {
  const { supabase } = await requireAdmin();

  await supabase
    .from("profiles")
    .update({
      nickname: nickname.trim() || null,
      phone: phone.trim() || null,
      ci: ci.trim() || null,
      receiver_name: receiverName.trim() || null,
      shipping_address: shippingAddress.trim() || null,
      shipping_detail: shippingDetail.trim() || null,
    })
    .eq("id", id);

  revalidatePath("/admin/members");
}

export async function deleteMember(id: string) {
  await requireAdmin();

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.deleteUser(id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/members");
}
