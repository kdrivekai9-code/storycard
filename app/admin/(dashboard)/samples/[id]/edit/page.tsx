import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CARD_TYPE_LABELS, TIER_LABELS } from "@/components/admin/AdminBadge";
import { updateSample } from "../../actions";

export default async function AdminSampleEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("samples")
    .select("id, title, card_type, tier, thumbnail_url, description, sort_order, is_published")
    .eq("id", id)
    .single();

  if (!item) notFound();

  return (
    <>
      <AdminPageHeader title="샘플 수정" />

      <form action={updateSample} className="admin-form">
        <input type="hidden" name="id" value={item.id} />
        <div>
          <label htmlFor="title">제목</label>
          <input id="title" name="title" type="text" defaultValue={item.title} required />
        </div>
        <div>
          <label htmlFor="card_type">종류</label>
          <select id="card_type" name="card_type" defaultValue={item.card_type}>
            {Object.entries(CARD_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="tier">등급</label>
          <select id="tier" name="tier" defaultValue={item.tier}>
            {Object.entries(TIER_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="thumbnail_url">썸네일 URL</label>
          <input id="thumbnail_url" name="thumbnail_url" type="text" defaultValue={item.thumbnail_url ?? ""} />
        </div>
        <div>
          <label htmlFor="description">설명</label>
          <textarea id="description" name="description" defaultValue={item.description ?? ""} />
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
