import { createClient } from "@/lib/supabase/admin-server";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminTable } from "@/components/admin/AdminTable";
import { AdminBadge, CardTypeBadge } from "@/components/admin/AdminBadge";
import { toggleReviewPublish, deleteReview } from "./actions";

export default async function AdminReviewsPage() {
  const supabase = await createClient();

  const { data: reviews } = await supabase
    .from("reviews")
    .select(
      "id, rating, content, is_published, created_at, invitations(groom_name, bride_name, card_type), profiles:author_id(email, nickname)",
    )
    .order("created_at", { ascending: false });

  return (
    <>
      <AdminPageHeader title="리뷰관리" description="신청자가 작성한 리뷰를 게시/숨김 처리합니다." />

      <AdminTable>
        <thead>
          <tr>
            <th>신청</th>
            <th>작성자</th>
            <th>평점</th>
            <th>내용</th>
            <th>게시여부</th>
            <th>작성일</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {(reviews ?? []).map((r) => {
            const invitation = Array.isArray(r.invitations) ? r.invitations[0] : r.invitations;
            const author = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
            return (
              <tr key={r.id}>
                <td>
                  {invitation ? (
                    <>
                      {invitation.groom_name} / {invitation.bride_name}{" "}
                      <CardTypeBadge value={invitation.card_type} />
                    </>
                  ) : (
                    "-"
                  )}
                </td>
                <td>{author?.nickname ?? author?.email ?? "-"}</td>
                <td>{"★".repeat(r.rating)}</td>
                <td style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.content}
                </td>
                <td>
                  <AdminBadge variant={r.is_published ? "ok" : "muted"}>
                    {r.is_published ? "게시중" : "숨김"}
                  </AdminBadge>
                </td>
                <td>{new Date(r.created_at).toLocaleDateString("ko-KR")}</td>
                <td>
                  <div style={{ display: "flex", gap: 8 }}>
                    <form action={toggleReviewPublish}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="next" value={(!r.is_published).toString()} />
                      <button type="submit" className="admin-btn admin-btn--ghost">
                        {r.is_published ? "숨기기" : "게시"}
                      </button>
                    </form>
                    <form action={deleteReview}>
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" className="admin-btn admin-btn--danger">
                        삭제
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            );
          })}
          {(reviews ?? []).length === 0 && (
            <tr>
              <td colSpan={7}>등록된 리뷰가 없습니다.</td>
            </tr>
          )}
        </tbody>
      </AdminTable>
    </>
  );
}
