"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

/** 새 관리자 계정 생성 */
export async function createAdminAccount(formData: FormData) {
  await requireAdmin();

  const email = (formData.get("email") as string)?.trim();
  const password = formData.get("password") as string;
  const nickname = (formData.get("nickname") as string)?.trim();

  if (!email || !password || password.length < 8) throw new Error("INVALID_INPUT");

  const adminClient = createAdminClient();

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !data.user) throw new Error(error?.message ?? "CREATE_FAILED");

  await adminClient
    .from("profiles")
    .update({ role: "admin", nickname: nickname || null, onboarding_done: true })
    .eq("id", data.user.id);

  revalidatePath("/admin/account");
}

/** 관리자 계정 닉네임 수정 */
export async function updateAdminNickname(targetId: string, nickname: string) {
  const { supabase } = await requireAdmin();

  await supabase
    .from("profiles")
    .update({ nickname: nickname.trim() || null })
    .eq("id", targetId);

  revalidatePath("/admin/account");
}

/** 관리자 계정 비밀번호 초기화 (다른 관리자 대상) */
export async function resetAdminPassword(targetId: string, newPassword: string) {
  await requireAdmin();

  if (newPassword.length < 8) throw new Error("비밀번호는 8자 이상이어야 합니다.");

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.updateUserById(targetId, {
    password: newPassword,
  });

  if (error) throw new Error(error.message);
}

/** 관리자 계정 삭제 (자기 자신 삭제 불가) */
export async function deleteAdminAccount(targetId: string) {
  const { user } = await requireAdmin();

  if (user.id === targetId) throw new Error("자기 자신은 삭제할 수 없습니다.");

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.deleteUser(targetId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/account");
}

/** 관리자 세션 시작 — 로그인 로그 생성 */
export async function startAdminSession(): Promise<string | null> {
  const { user, supabase } = await requireAdmin();

  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0].trim() ??
    headersList.get("x-real-ip") ??
    null;

  const now = new Date().toISOString();

  await supabase
    .from("profiles")
    .update({ last_seen_at: now })
    .eq("id", user.id);

  const { data } = await supabase
    .from("admin_login_logs")
    .insert({ user_id: user.id, ip_address: ip, logged_in_at: now, last_seen_at: now })
    .select("id")
    .single();

  return data?.id ?? null;
}

/** 관리자 세션 하트비트 — 접속 유지 */
export async function pingAdminPresence(logId: string): Promise<void> {
  const { user, supabase } = await requireAdmin();

  const now = new Date().toISOString();

  await Promise.all([
    supabase
      .from("admin_login_logs")
      .update({ last_seen_at: now })
      .eq("id", logId),
    supabase
      .from("profiles")
      .update({ last_seen_at: now })
      .eq("id", user.id),
  ]);
}

/** 관리자 세션 종료 — 로그아웃 시간 기록 */
export async function endAdminSession(logId: string): Promise<void> {
  const { supabase } = await requireAdmin();

  await supabase
    .from("admin_login_logs")
    .update({ logged_out_at: new Date().toISOString() })
    .eq("id", logId);
}
