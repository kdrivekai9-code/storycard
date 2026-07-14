import { requireAdmin } from "@/lib/admin/requireAdmin";
import { Test3Client } from "./Test3Client";

export const dynamic = "force-dynamic";

export default async function InpaintTest3Page() {
  await requireAdmin();
  return (
    <div className="admin-page-header" style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="admin-page-title">인페인팅 테스트3 — 질감 복원 파이프라인</h1>
        <p className="admin-page-desc" style={{ marginTop: 6 }}>
          페이스스왑 완료 이미지에서 피부 질감(이마·볼·팔자주름)을 복원하고,
          Sharp 합성으로 이목구비(눈·코·입)를 원본 그대로 유지하는 4단계 파이프라인입니다.
        </p>
      </div>
      <div style={{ background: "var(--bg-soft)", borderRadius: 10, padding: "28px 24px", border: "1px solid var(--line)" }}>
        <Test3Client />
      </div>
    </div>
  );
}
