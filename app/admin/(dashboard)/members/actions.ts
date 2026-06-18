"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
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
  revalidatePath(`/admin/members/${id}`);
}

export async function deleteMember(id: string) {
  await requireAdmin();

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.deleteUser(id);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/members");
}

/** 회원 비밀번호 초기화 — 등록된 이메일로 재설정 링크 전송 */
export async function sendMemberPasswordReset(email: string) {
  await requireAdmin();

  const headersList = await headers();
  const host = headersList.get("host");
  const proto = headersList.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/reset-password`,
  });
  if (error) throw new Error(error.message);
}
