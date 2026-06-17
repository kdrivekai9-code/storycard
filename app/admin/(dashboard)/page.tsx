import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CARD_TYPE_LABELS, TIER_LABELS } from "@/components/admin/AdminBadge";

async function count(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter?: (q: any) => any,
) {
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) query = filter(query);
  const { count: n } = await query;
  return n ?? 0;
}

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const [
    memberCount,
    applicationCount,
    qnaCount,
    sampleCount,
    pendingReviewCount,
    ...cardTypeAndTierCounts
  ] = await Promise.all([
    count(supabase, "profiles"),
    count(supabase, "invitations"),
    count(supabase, "qna"),
    count(supabase, "samples"),
    count(supabase, "reviews", (q) => q.eq("is_published", false)),
    ...Object.keys(CARD_TYPE_LABELS).map((type) =>
      count(supabase, "invitations", (q) => q.eq("card_type", type)),
    ),
    ...Object.keys(TIER_LABELS).map((tier) =>
      count(supabase, "invitations", (q) => q.eq("tier", tier)),
    ),
  ]);

  const cardTypeKeys = Object.keys(CARD_TYPE_LABELS);
  const tierKeys = Object.keys(TIER_LABELS);
  const cardTypeCounts = cardTypeKeys.map((key, i) => ({ key, count: cardTypeAndTierCounts[i] }));
  const tierCounts = tierKeys.map((key, i) => ({
    key,
    count: cardTypeAndTierCounts[cardTypeKeys.length + i],
  }));

  return (
    <>
      <AdminPageHeader title="대시보드" description="전체 현황을 한눈에 확인하세요." />

      <div className="admin-stat-grid">
        <Link href="/admin/members" className="admin-stat-card">
          <p className="label">전체 회원</p>
          <p className="value">{memberCount}</p>
        </Link>
        <Link href="/admin/applications" className="admin-stat-card">
          <p className="label">전체 신청</p>
          <p className="value">{applicationCount}</p>
        </Link>
        <Link href="/admin/qna" className="admin-stat-card">
          <p className="label">Q&amp;A 항목</p>
          <p className="value">{qnaCount}</p>
        </Link>
        <Link href="/admin/samples" className="admin-stat-card">
          <p className="label">샘플 항목</p>
          <p className="value">{sampleCount}</p>
        </Link>
        <Link href="/admin/reviews" className="admin-stat-card">
          <p className="label">미게시 리뷰</p>
          <p className="value">{pendingReviewCount}</p>
        </Link>
      </div>

      <AdminPageHeader title="신청 — 종류별" />
      <div className="admin-stat-grid">
        {cardTypeCounts.map(({ key, count: n }) => (
          <Link key={key} href={`/admin/applications?card_type=${key}`} className="admin-stat-card">
            <p className="label">{CARD_TYPE_LABELS[key]}</p>
            <p className="value">{n}</p>
          </Link>
        ))}
      </div>

      <AdminPageHeader title="신청 — 등급별" />
      <div className="admin-stat-grid">
        {tierCounts.map(({ key, count: n }) => (
          <Link key={key} href={`/admin/applications?tier=${key}`} className="admin-stat-card">
            <p className="label">{TIER_LABELS[key]}</p>
            <p className="value">{n}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
