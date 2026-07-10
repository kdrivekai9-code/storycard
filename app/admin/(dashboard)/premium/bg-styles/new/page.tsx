import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { createBgStyle } from "../../actions";

export default function NewBgStylePage() {
  return (
    <>
      <AdminPageHeader
        title="배경 스타일 추가"
        description="서비스4(배경이미지 변경)에서 사용할 새 배경 스타일을 등록합니다."
      />

      <section className="admin-section">
        <form action={createBgStyle} className="admin-form">
          <div>
            <label>ID (영문 소문자, 하이픈)</label>
            <input
              name="id"
              type="text"
              required
              placeholder="california-coast"
              pattern="[a-z0-9-]+"
              style={{ fontFamily: "monospace" }}
            />
          </div>

          <div>
            <label>레이블 (한국어 이름)</label>
            <input name="label" type="text" required placeholder="가. 해안선도로" />
          </div>

          <div>
            <label>Seed (선택)</label>
            <input name="seed" type="number" placeholder="6222409" style={{ width: 160 }} />
          </div>

          <div>
            <label>미리보기 이미지 URL (UI용)</label>
            <input name="image_url" type="text" placeholder="/samples/bg-california-coast.jpg" />
          </div>

          <div>
            <label>모델 전송 이미지 URL (배경만)</label>
            <input name="model_image_url" type="text" placeholder="/samples/bg-california-coast-bg.jpg" />
          </div>

          <div>
            <label>순서</label>
            <input name="sort_order" type="number" defaultValue={0} style={{ width: 100 }} />
          </div>

          <div>
            <label>프롬프트</label>
            <textarea name="prompt" rows={12} placeholder="fal.ai에 전달할 전체 프롬프트" />
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <button type="submit" className="admin-btn">등록</button>
            <Link href="/admin/premium?service=bg-change" className="admin-btn admin-btn--ghost">
              취소
            </Link>
          </div>
        </form>
      </section>
    </>
  );
}
