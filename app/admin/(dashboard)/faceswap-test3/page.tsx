import { requireAdmin } from "@/lib/admin/requireAdmin";
import { FaceSwapTest3Client } from "./FaceSwapTest3Client";

export const dynamic = "force-dynamic";

export default async function FaceSwapTest3Page() {
  await requireAdmin();
  return (
    <div style={{ width: "100%" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="admin-page-title">Face Swap 테스트3 — Multiple Face Swap</h1>
        <p className="admin-page-desc" style={{ marginTop: 6 }}>
          ModelsLab Multiple Face Swap(deepfake/multiple_face_swap) API 테스트입니다.
          얼굴 소스가 2명이면 좌우로 합성한 이미지 하나를 target_image로 넘겨
          Init Image의 얼굴들과 순서대로 매칭합니다.
        </p>
      </div>
      <div style={{ background: "var(--bg-soft)", borderRadius: 10, padding: "28px 32px", border: "1px solid var(--line)" }}>
        <FaceSwapTest3Client />
      </div>
    </div>
  );
}
