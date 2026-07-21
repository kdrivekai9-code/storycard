import { requireAdmin } from "@/lib/admin/requireAdmin";
import { AkoolFaceSwapClient } from "./AkoolFaceSwapClient";

export const dynamic = "force-dynamic";

export default async function AkoolFaceSwapPage() {
  await requireAdmin();
  return (
    <div style={{ width: "100%" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="admin-page-title">Akool Face Swap Plus (v4)</h1>
        <p className="admin-page-desc" style={{ marginTop: 6 }}>
          Akool Face Swap Plus API를 사용해 소스 얼굴을 타겟 이미지에 합성합니다.
        </p>
      </div>
      <div style={{ background: "var(--bg-soft)", borderRadius: 10, padding: "28px 32px", border: "1px solid var(--line)" }}>
        <AkoolFaceSwapClient />
      </div>
    </div>
  );
}
