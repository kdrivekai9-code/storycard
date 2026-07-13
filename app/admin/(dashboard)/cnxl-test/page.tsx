import { CnxlClient } from "./CnxlClient";

export const metadata = { title: "CNXL 테스트 | 어드민" };

export default function CnxlTestPage() {
  return (
    <div className="admin-main-inner">
      <div className="admin-page-header">
        <h1 className="admin-page-title">ControlNetXL 테스트</h1>
        <p className="admin-page-desc">
          ModelsLab ControlNet v5 API — H94 IP-Adapter Plus Face 모델 연동 테스트
        </p>
      </div>

      <div className="admin-form admin-form--wide" style={{ maxWidth: 720 }}>
        <CnxlClient />
      </div>
    </div>
  );
}
