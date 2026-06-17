import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminTable } from "@/components/admin/AdminTable";
import { AdminBadge } from "@/components/admin/AdminBadge";
import { deleteQna, toggleQnaPublish } from "./actions";

export default async function AdminQnaPage() {
  const supabase = await createClient();

  const { data: items } = await supabase
    .from("qna")
    .select("id, question, answer, category, is_published, sort_order")
    .order("sort_order", { ascending: true });

  return (
    <>
      <AdminPageHeader
        title="Q&A 관리"
        description="자주 묻는 질문과 답변을 관리합니다."
        action={
          <Link href="/admin/qna/new" className="admin-btn">
            추가
          </Link>
        }
      />

      <AdminTable>
        <thead>
          <tr>
            <th>분류</th>
            <th>질문</th>
            <th>게시여부</th>
            <th>순서</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {(items ?? []).map((item) => (
            <tr key={item.id}>
              <td>{item.category ?? "-"}</td>
              <td>{item.question}</td>
              <td>
                <AdminBadge variant={item.is_published ? "ok" : "muted"}>
                  {item.is_published ? "게시중" : "숨김"}
                </AdminBadge>
              </td>
              <td>{item.sort_order}</td>
              <td>
                <div style={{ display: "flex", gap: 8 }}>
                  <Link href={`/admin/qna/${item.id}/edit`} className="admin-btn admin-btn--ghost">
                    수정
                  </Link>
                  <form action={toggleQnaPublish}>
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="next" value={(!item.is_published).toString()} />
                    <button type="submit" className="admin-btn admin-btn--ghost">
                      {item.is_published ? "숨기기" : "게시"}
                    </button>
                  </form>
                  <form action={deleteQna}>
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
              <td colSpan={5}>등록된 Q&amp;A가 없습니다.</td>
            </tr>
          )}
        </tbody>
      </AdminTable>
    </>
  );
}
