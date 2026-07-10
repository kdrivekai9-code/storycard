import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { FaceSwapClient } from "./FaceSwapClient";

export default function AdminFaceSwapPage() {
  const hasKey = true; // 키는 Supabase 시크릿(face-swap Edge Function)에서 관리

  return (
    <>
      <AdminPageHeader
        title="Face Swap 테스트"
        description="ModelsLab Specific Face Swap API 테스트 — 이미지 3장을 업로드하고 결과를 확인합니다."
      />

      {!hasKey && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 8,
            background: "#fffbeb",
            border: "1px solid #fcd34d",
            color: "#92400e",
            fontSize: 13,
            marginBottom: 24,
          }}
        >
          ⚠️ <strong>MODELSLAB_API_KEY</strong> 환경변수가 설정되지 않았습니다.{" "}
          <code>.env.local</code>에 추가해주세요.
        </div>
      )}

      <section className="admin-section" style={{ maxWidth: 800 }}>
        <div style={{ marginBottom: 20, padding: "12px 16px", borderRadius: 8, background: "var(--bg-soft)", fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.7 }}>
          <strong>사용 방법</strong><br />
          • <strong>Init Image</strong> — 얼굴이 교체될 원본 사진 (ex. 배경+인물 합성 사진)<br />
          • <strong>Target Image</strong> — 새로 붙여 넣을 얼굴이 담긴 사진 (실제 신랑/신부 사진)<br />
          • <strong>Reference Image</strong> — Init Image에서 바꿀 특정 얼굴을 지정하는 기준 사진
        </div>

        <FaceSwapClient />
      </section>
    </>
  );
}
