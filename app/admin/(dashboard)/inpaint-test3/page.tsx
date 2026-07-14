import { requireAdmin } from "@/lib/admin/requireAdmin";
import { Test3Client } from "./Test3Client";

export const dynamic = "force-dynamic";

export default async function InpaintTest3Page() {
  await requireAdmin();
  return (
    <div className="admin-page-header" style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="admin-page-title">인페인팅 테스트3 — 직접 텍스처 전사</h1>
        <p className="admin-page-desc" style={{ marginTop: 6 }}>
          원본 사진의 보조개·주름·모공을 페이스스왑 완료 이미지에 직접 전사합니다.
          BiRefNet 얼굴 정렬 + Sharp soft-light 블렌드를 사용하며 AI 인페인팅 없이 100% 이미지 처리입니다.
        </p>
      </div>
      <div style={{ background: "var(--bg-soft)", borderRadius: 10, padding: "28px 24px", border: "1px solid var(--line)" }}>
        <Test3Client />
      </div>
    </div>
  );
}
