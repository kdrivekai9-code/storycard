import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { updateQna } from "../../actions";

export default async function AdminQnaEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("qna")
    .select("id, question, answer, category, sort_order, is_published")
    .eq("id", id)
    .single();

  if (!item) notFound();

  return (
    <>
      <AdminPageHeader title="Q&A 수정" />

      <form action={updateQna} className="admin-form">
        <input type="hidden" name="id" value={item.id} />
        <div>
          <label htmlFor="category">분류</label>
          <input id="category" name="category" type="text" defaultValue={item.category ?? ""} />
        </div>
        <div>
          <label htmlFor="question">질문</label>
          <input id="question" name="question" type="text" defaultValue={item.question} required />
        </div>
        <div>
          <label htmlFor="answer">답변</label>
          <textarea id="answer" name="answer" defaultValue={item.answer} required />
        </div>
        <div>
          <label htmlFor="sort_order">순서</label>
          <input id="sort_order" name="sort_order" type="number" defaultValue={item.sort_order} />
        </div>
        <div>
          <label>
            <input name="is_published" type="checkbox" defaultChecked={item.is_published} /> 게시
          </label>
        </div>
        <button type="submit" className="admin-btn">
          저장
        </button>
      </form>
    </>
  );
}
