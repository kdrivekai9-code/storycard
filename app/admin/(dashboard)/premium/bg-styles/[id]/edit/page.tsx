import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/admin-server";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { updateBgStyle } from "../../../actions";
import { UrlInputWithCopy } from "./UrlInputWithCopy";

export default async function EditBgStylePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: style } = await supabase
    .from("premium_bg_styles")
    .select("*")
    .eq("id", id)
    .single();

  if (!style) notFound();

  return (
    <>
      <AdminPageHeader
        title={`배경 스타일 수정 — ${style.label}`}
        description="서비스4(배경이미지 변경) 배경 스타일의 내용을 수정합니다."
      />

      <section className="admin-section">
        <form action={updateBgStyle} className="admin-form admin-form--wide">
          <input type="hidden" name="id" value={style.id} />

          <div>
            <label>ID</label>
            <input
              type="text"
              value={style.id}
              disabled
              style={{ fontFamily: "monospace", opacity: 0.6 }}
            />
          </div>

          <div>
            <label>레이블 (한국어 이름)</label>
            <input name="label" type="text" required defaultValue={style.label} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <label>
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={style.is_active}
                style={{ marginRight: 6 }}
              />
              활성화
            </label>
          </div>

          <div>
            <label>Seed (선택)</label>
            <input
              name="seed"
              type="number"
              defaultValue={style.seed ?? ""}
              style={{ width: 160 }}
            />
          </div>

          <div>
            <label>미리보기 이미지 URL (UI용)</label>
            <UrlInputWithCopy name="image_url" defaultValue={style.image_url} />
          </div>

          <div>
            <label>모델 전송 이미지 URL (배경만)</label>
            <UrlInputWithCopy name="model_image_url" defaultValue={style.model_image_url} />
          </div>

          <div>
            <label>순서</label>
            <input
              name="sort_order"
              type="number"
              defaultValue={style.sort_order}
              style={{ width: 100 }}
            />
          </div>

          <div>
            <label>프롬프트</label>
            <textarea name="prompt" rows={14} defaultValue={style.prompt} />
          </div>

          {/* 이미지 미리보기 */}
          {style.image_url && (
            <div>
              <label>현재 미리보기 이미지</label>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={style.image_url}
                alt={style.label}
                style={{ width: 100, height: 150, objectFit: "cover", borderRadius: 6, display: "block", marginTop: 6 }}
              />
            </div>
          )}

          <div style={{ display: "flex", gap: 12 }}>
            <button type="submit" className="admin-btn">저장</button>
            <Link href="/admin/premium?service=bg-change" className="admin-btn admin-btn--ghost">
              취소
            </Link>
          </div>
        </form>
      </section>
    </>
  );
}
