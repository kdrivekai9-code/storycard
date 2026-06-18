import Link from "next/link";
import { createClient } from "@/lib/supabase/admin-server";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminTable } from "@/components/admin/AdminTable";
import { AdminBadge, CardTypeBadge, TierBadge } from "@/components/admin/AdminBadge";
import { deleteSample, toggleSamplePublish } from "./actions";

export default async function AdminSamplesPage() {
  const supabase = await createClient();

  const { data: items } = await supabase
    .from("samples")
    .select("id, title, card_type, tier, thumbnail_url, is_published, sort_order")
    .order("sort_order", { ascending: true });

  return (
    <>
      <AdminPageHeader
        title="샘플등록관리"
        description="홈/샘플 영역에 노출할 샘플 카드를 관리합니다."
        action={
          <Link href="/admin/samples/new" className="admin-btn">
            추가
          </Link>
        }
      />

      <AdminTable>
        <thead>
          <tr>
            <th>썸네일</th>
            <th>제목</th>
            <th>종류</th>
            <th>등급</th>
            <th>게시여부</th>
            <th>순서</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {(items ?? []).map((item) => (
            <tr key={item.id}>
              <td>
                {item.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.thumbnail_url} alt={item.title} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8 }} />
                ) : (
                  <AdminBadge variant="muted">없음</AdminBadge>
                )}
              </td>
              <td>{item.title}</td>
              <td>
                <CardTypeBadge value={item.card_type} />
              </td>
              <td>
                <TierBadge value={item.tier} />
              </td>
              <td>
                <AdminBadge variant={item.is_published ? "ok" : "muted"}>
                  {item.is_published ? "게시중" : "숨김"}
                </AdminBadge>
              </td>
              <td>{item.sort_order}</td>
              <td>
                <div style={{ display: "flex", gap: 8 }}>
                  <Link href={`/admin/samples/${item.id}/edit`} className="admin-btn admin-btn--ghost">
                    수정
                  </Link>
                  <form action={toggleSamplePublish}>
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="next" value={(!item.is_published).toString()} />
                    <button type="submit" className="admin-btn admin-btn--ghost">
                      {item.is_published ? "숨기기" : "게시"}
                    </button>
                  </form>
                  <form action={deleteSample}>
                    <input type="hidden" name="id" value={item.id} />
                    <button type="submit" className="admin-btn admin-btn--danger">
                      삭제
                    </button>
                  </form>
                </div>
              </td>
            </tr>
          ))}
          {(items ?? []).length === 0 && (
            <tr>
              <td colSpan={7}>등록된 샘플이 없습니다.</td>
            </tr>
          )}
        </tbody>
      </AdminTable>
    </>
  );
}
