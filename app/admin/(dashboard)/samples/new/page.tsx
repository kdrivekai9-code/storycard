import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CARD_TYPE_LABELS, TIER_LABELS } from "@/components/admin/AdminBadge";
import { createSample } from "../actions";

export default function AdminSampleNewPage() {
  return (
    <>
      <AdminPageHeader title="샘플 추가" />

      <form action={createSample} className="admin-form">
        <div>
          <label htmlFor="title">제목</label>
          <input id="title" name="title" type="text" required />
        </div>
        <div>
          <label htmlFor="card_type">종류</label>
          <select id="card_type" name="card_type" defaultValue="wedding">
            {Object.entries(CARD_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="tier">등급</label>
          <select id="tier" name="tier" defaultValue="standard">
            {Object.entries(TIER_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="thumbnail_url">썸네일 URL</label>
          <input id="thumbnail_url" name="thumbnail_url" type="text" />
        </div>
        <div>
          <label htmlFor="description">설명</label>
          <textarea id="description" name="description" />
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
