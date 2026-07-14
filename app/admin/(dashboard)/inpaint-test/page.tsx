import { InpaintClient } from "./InpaintClient";

export const metadata = { title: "Inpainting 테스트 | 어드민" };

export default function InpaintTestPage() {
  return (
    <div className="admin-main-inner">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Inpainting 테스트</h1>
        <p className="admin-page-desc">
          배경만 교체 — 인물 얼굴 100% 원본 유지 · ModelsLab /api/v6/image_editing/inpaint
        </p>
      </div>

      <div className="admin-form admin-form--wide" style={{ maxWidth: 720 }}>
        <InpaintClient />
      </div>
    </div>
  );
}
