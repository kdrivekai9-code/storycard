import { FalInpaintClient } from "./FalInpaintClient";

export const metadata = { title: "Inpainting 테스트2 (Flux) | 어드민" };

export default function InpaintTest2Page() {
  return (
    <div className="admin-main-inner">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Inpainting 테스트2 — Juggernaut Flux</h1>
        <p className="admin-page-desc">
          fal.ai · rundiffusion-fal/juggernaut-flux-lora/inpainting · 배경 교체, 인물 100% 원본 유지
        </p>
      </div>

      <div className="admin-form admin-form--wide" style={{ maxWidth: 720 }}>
        <FalInpaintClient />
      </div>
    </div>
  );
}
