import { createClient } from "@/lib/supabase/admin-server";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminTable } from "@/components/admin/AdminTable";
import { toggleRole, updateMember, deleteMember } from "./actions";
import { MemberRow } from "./MemberRow";

export default async function AdminMembersPage() {
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("profiles")
    .select("id, email, nickname, phone, ci, receiver_name, shipping_address, shipping_detail, provider, role, created_at")
    .eq("role", "user")
    .order("created_at", { ascending: false });

  return (
    <>
      <AdminPageHeader title="회원관리" description="전체 회원 목록과 권한을 관리합니다." />

      <AdminTable>
        <thead>
          <tr>
            <th>이메일</th>
            <th>닉네임</th>
            <th>휴대폰</th>
            <th>CI</th>
            <th>받는분</th>
            <th>주소</th>
            <th>상세주소</th>
            <th>채널</th>
            <th>권한</th>
            <th>가입일</th>
            <th>관리</th>
          </tr>
        </thead>
        <tbody>
          {(members ?? []).map((m) => (
            <MemberRow key={m.id} m={m} />
          ))}
          {(members ?? []).length === 0 && (
            <tr>
              <td colSpan={7}>등록된 회원이 없습니다.</td>
            </tr>
          )}
        </tbody>
      </AdminTable>
    </>
  );
}
