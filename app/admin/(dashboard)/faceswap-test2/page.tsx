import { requireAdmin } from "@/lib/admin/requireAdmin";
import { FaceSwapTest2Client } from "./FaceSwapTest2Client";

export const dynamic = "force-dynamic";

export default async function FaceSwapTest2Page() {
  await requireAdmin();
  return (
    <div style={{ width: "100%" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="admin-page-title">Face Swap 테스트2 — Multiple Face Swap</h1>
        <p className="admin-page-desc" style={{ marginTop: 6 }}>
          ModelsLab API를 사용한 다중 얼굴 교체 테스트입니다.
          Init Image의 얼굴을 Target Image의 얼굴로 교체합니다.
        </p>
      </div>
      <div style={{ background: "var(--bg-soft)", borderRadius: 10, padding: "28px 32px", border: "1px solid var(--line)" }}>
        <FaceSwapTest2Client />
      </div>
    </div>
  );
}
