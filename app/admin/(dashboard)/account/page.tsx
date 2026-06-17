import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPasswordForm } from "@/components/admin/AdminPasswordForm";
import { AdminTable } from "@/components/admin/AdminTable";
import { AdminAccountList } from "./AdminAccountList";
import { PasswordInput } from "@/components/admin/PasswordInput";
import { createAdminAccount } from "./actions";

export default async function AdminAccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: admins } = await supabase
    .from("profiles")
    .select("id, email, nickname, created_at, last_seen_at")
    .eq("role", "admin")
    .order("created_at", { ascending: true });

  // 각 관리자의 로그인 이력 조회 (최근 20건)
  const { data: loginLogs } = await supabase
    .from("admin_login_logs")
    .select("id, user_id, ip_address, logged_in_at, last_seen_at, logged_out_at")
    .order("logged_in_at", { ascending: false })
    .limit(100);

  return (
    <>
      <AdminPageHeader title="계정설정" description="내 계정 정보 확인 및 관리자 계정을 관리합니다." />

      {/* ─── 내 계정 ─── */}
      <section className="admin-section">
        <h2 className="admin-section-title">내 계정</h2>

        <div className="admin-form" style={{ marginBottom: 24 }}>
          <div>
            <label>로그인 이메일</label>
            <input type="text" value={user?.email ?? ""} disabled />
          </div>
        </div>

        <h3 className="admin-section-sub">비밀번호 변경</h3>
        <AdminPasswordForm />
      </section>

      {/* ─── 관리자 계정 목록 (테이블) ─── */}
      <section className="admin-section">
        <h2 className="admin-section-title">관리자 계정 목록</h2>
        <p className="admin-section-desc">자기 자신은 삭제할 수 없습니다.</p>

        <AdminTable>
          <thead>
            <tr>
              <th>이메일</th>
              <th>닉네임</th>
              <th>상태</th>
              <th>가입일</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            <AdminAccountList
              admins={admins ?? []}
              loginLogs={loginLogs ?? []}
              currentUserId={user?.id ?? ""}
            />
          </tbody>
        </AdminTable>
      </section>

      {/* ─── 신규 관리자 추가 ─── */}
      <section className="admin-section">
        <h2 className="admin-section-title">관리자 계정 추가</h2>

        <form action={createAdminAccount} className="admin-form">
          <div>
            <label htmlFor="new-admin-email">이메일</label>
            <input id="new-admin-email" name="email" type="email" required />
          </div>
          <div>
            <label htmlFor="new-admin-nickname">닉네임</label>
            <input id="new-admin-nickname" name="nickname" type="text" />
          </div>
          <div>
            <label htmlFor="new-admin-password">초기 비밀번호</label>
            <PasswordInput
              id="new-admin-password"
              name="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="8자 이상"
            />
          </div>
          <button type="submit" className="admin-btn">
            관리자 계정 추가
          </button>
        </form>
      </section>
    </>
  );
}
