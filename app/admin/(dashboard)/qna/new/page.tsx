import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { createQna } from "../actions";

export default function AdminQnaNewPage() {
  return (
    <>
      <AdminPageHeader title="Q&A 추가" />

      <form action={createQna} className="admin-form">
        <div>
          <label htmlFor="category">분류</label>
          <input id="category" name="category" type="text" />
        </div>
        <div>
          <label htmlFor="question">질문</label>
          <input id="question" name="question" type="text" required />
        </div>
        <div>
          <label htmlFor="answer">답변</label>
          <textarea id="answer" name="answer" required />
        </div>
        <div>
          <label htmlFor="sort_order">순서</label>
          <input id="sort_order" name="sort_order" type="number" defaultValue={0} />
        </div>
        <div>
          <label>
            <input name="is_published" type="checkbox" defaultChecked /> 게시
          </label>
        </div>
        <button type="submit" className="admin-btn">
          저장
        </button>
      </form>
    </>
  );
}
