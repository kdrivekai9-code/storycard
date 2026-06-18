"use server";

import { redirect } from "next/navigation";
import { createClient } from "./server";
import { createAdminClient } from "./admin";
import { isPlaceholderEmail } from "./profile-utils";

export type CompleteProfileResult =
  | { ok: true }
  | { ok: false; message: string };


/** OAuth 직후 프로필에 필수/선택 정보를 저장하고 next 경로로 이동 */
export async function completeProfile(
  _prevState: CompleteProfileResult,
  formData: FormData,
): Promise<CompleteProfileResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };

  const name    = (formData.get("name") as string | null)?.trim() || null;
  const phone   = (formData.get("phone") as string | null)?.trim() || null;
  const email   = (formData.get("email") as string | null)?.trim() || null;
  const address       = (formData.get("shipping_address") as string | null)?.trim() || null;
  const addressDetail = (formData.get("shipping_detail") as string | null)?.trim() || null;
  const receiverName  = (formData.get("receiver_name") as string | null)?.trim() || null;
  const ci            = (formData.get("ci") as string | null)?.trim() || null;
  const next    = (formData.get("next") as string | null) || "/";

  // 필수 항목 검증
  if (!name)  return { ok: false, message: "이름을 입력해주세요." };
  if (!phone) return { ok: false, message: "휴대전화를 입력해주세요." };
  if (!email) return { ok: false, message: "이메일을 입력해주세요." };

  const updates: Record<string, string | boolean | null> = {
    onboarding_done: true,
    nickname: name,
    phone,
    email,
    shipping_address: address,
    shipping_detail: addressDetail,
    receiver_name: receiverName,
    ci,
  };

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id);
  if (error) return { ok: false, message: "저장에 실패했습니다. 다시 시도해주세요." };

  // auth.users.email을 placeholder → 실제 이메일로 교체
  if (isPlaceholderEmail(user.email)) {
    const admin = createAdminClient();
    await admin.auth.admin.updateUserById(user.id, { email });
  }

  redirect(next);
}

/** 현재 로그인 사용자의 프로필 조회 */
export async function getMyProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("email, phone, nickname, provider, onboarding_done, shipping_address, shipping_detail, receiver_name")
    .eq("id", user.id)
    .single();

  return data ? { ...data, authEmail: user.email } : null;
}
