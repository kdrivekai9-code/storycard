import { createClient } from "@/lib/supabase/admin-server";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminTable } from "@/components/admin/AdminTable";
import { AdminInlineSelect } from "@/components/admin/AdminInlineSelect";
import { CARD_TYPE_LABELS, TIER_LABELS, STATUS_LABELS } from "@/components/admin/AdminBadge";
import { updateApplication } from "./actions";

const CARD_TYPE_OPTIONS = Object.entries(CARD_TYPE_LABELS).map(([value, label]) => ({ value, label }));
const TIER_OPTIONS = Object.entries(TIER_LABELS).map(([value, label]) => ({ value, label }));
const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }));

export default async function AdminApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ card_type?: string; tier?: string; status?: string }>;
}) {
  const { card_type, tier, status } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("invitations")
    .select("id, slug, groom_name, bride_name, status, card_type, tier, owner_id, created_at")
    .order("created_at", { ascending: false });

  if (card_type) query = query.eq("card_type", card_type);
  if (tier) query = query.eq("tier", tier);
  if (status) query = query.eq("status", status);

  const { data: invitations } = await query;

  const ownerIds = Array.from(new Set((invitations ?? []).map((i) => i.owner_id).filter(Boolean)));
  let ownerEmails = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: owners } = await supabase.from("profiles").select("id, email").in("id", ownerIds);
    ownerEmails = new Map((owners ?? []).map((o) => [o.id, o.email ?? "-"]));
  }

  return (
    <>
      <AdminPageHeader title="신청관리" description="신청(청첩장/부고장/돌잔치초대장/일반초대장)의 종류·등급·상태를 관리합니다." />

      <form method="get" className="admin-filters">
        <select name="card_type" defaultValue={card_type ?? ""}>
          <option value="">종류 전체</option>
          {CARD_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select name="tier" defaultValue={tier ?? ""}>
          <option value="">등급 전체</option>
          {TIER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={status ?? ""}>
          <option value="">상태 전체</option>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button type="submit" className="admin-btn admin-btn--ghost">
          필터 적용
        </button>
      </form>

      <AdminTable>
        <thead>
          <tr>
            <th>신랑 / 신부</th>
            <th>종류</th>
            <th>등급</th>
            <th>상태</th>
            <th>신청자</th>
            <th>생성일</th>
          </tr>
        </thead>
        <tbody>
          {(invitations ?? []).map((i) => (
            <tr key={i.id}>
              <td>
                {i.groom_name} / {i.bride_name}
              </td>
              <td>
                <AdminInlineSelect
                  id={i.id}
                  field="card_type"
                  value={i.card_type}
                  options={CARD_TYPE_OPTIONS}
                  action={updateApplication}
                />
              </td>
              <td>
                <AdminInlineSelect
                  id={i.id}
                  field="tier"
                  value={i.tier}
                  options={TIER_OPTIONS}
                  action={updateApplication}
                />
              </td>
              <td>
                <AdminInlineSelect
                  id={i.id}
                  field="status"
                  value={i.status}
                  options={STATUS_OPTIONS}
                  action={updateApplication}
                />
              </td>
              <td>{ownerEmails.get(i.owner_id ?? "") ?? "-"}</td>
              <td>{new Date(i.created_at).toLocaleDateString("ko-KR")}</td>
            </tr>
          ))}
          {(invitations ?? []).length === 0 && (
            <tr>
              <td colSpan={6}>조건에 맞는 신청이 없습니다.</td>
            </tr>
          )}
        </tbody>
      </AdminTable>
    </>
  );
}
