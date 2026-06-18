import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/admin-server";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminTable } from "@/components/admin/AdminTable";
import { CardTypeBadge, TierBadge, StatusBadge } from "@/components/admin/AdminBadge";
import { MemberDetailForm } from "./MemberDetailForm";

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: member } = await supabase
    .from("profiles")
    .select("id, email, nickname, phone, ci, receiver_name, shipping_address, shipping_detail, provider, role, created_at")
    .eq("id", id)
    .single();

  if (!member) notFound();

  const { data: invitations } = await supabase
    .from("invitations")
    .select("id, slug, groom_name, bride_name, card_type, tier, status, created_at")
    .eq("owner_id", id)
    .order("created_at", { ascending: false });

  return (
    <>
      <AdminPageHeader title="회원 상세정보" description={member.email ?? member.id} />

      <Link
        href="/admin/members"
        className="admin-nav-link"
        style={{ display: "inline-block", marginBottom: 16 }}
      >
        ← 회원목록으로
      </Link>

      <section className="admin-section">
        <h2 className="admin-section-title">기본 정보</h2>
        <MemberDetailForm member={member} />
      </section>

      <section className="admin-section">
        <h2 className="admin-section-title">신청한 모바일 청첩장</h2>
        <AdminTable>
          <thead>
            <tr>
              <th>신랑 / 신부</th>
              <th>종류</th>
              <th>등급</th>
              <th>상태</th>
              <th>신청일시</th>
            </tr>
          </thead>
          <tbody>
            {(invitations ?? []).map((i) => (
              <tr key={i.id}>
                <td>{i.groom_name} / {i.bride_name}</td>
                <td><CardTypeBadge value={i.card_type} /></td>
                <td><TierBadge value={i.tier} /></td>
                <td><StatusBadge value={i.status} /></td>
                <td>{new Date(i.created_at).toLocaleString("ko-KR")}</td>
              </tr>
            ))}
            {(invitations ?? []).length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: "var(--ink-soft)" }}>등록된 청첩장이 없습니다.</td>
              </tr>
            )}
          </tbody>
        </AdminTable>
      </section>
    </>
  );
}
