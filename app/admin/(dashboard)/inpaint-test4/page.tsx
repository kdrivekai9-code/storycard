import { requireAdmin } from "@/lib/admin/requireAdmin";
import { MediaPipeTest4Client } from "./MediaPipeTest4Client";

export const dynamic = "force-dynamic";

export default async function InpaintTest4Page() {
  await requireAdmin();
  return (
    <div style={{ width: "100%" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="admin-page-title">인페인팅 테스트4 — MediaPipe 얼굴 질감 전사</h1>
        <p className="admin-page-desc" style={{ marginTop: 6 }}>
          Google MediaPipe Face Mesh (468 랜드마크)로 얼굴을 자동 감지하여
          원본 사진의 피부 질감을 스왑 완료 이미지에 전사합니다.
        </p>
      </div>
      <div style={{ background: "var(--bg-soft)", borderRadius: 10, padding: "28px 32px", border: "1px solid var(--line)" }}>
        <MediaPipeTest4Client />
      </div>
    </div>
  );
}
