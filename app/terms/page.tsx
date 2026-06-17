import Link from "next/link";
import { PcHeader } from "@/components/pc/PcHeader";
import { PcFooter } from "@/components/pc/PcFooter";

export const metadata = {
  title: "이용약관 | STORYCARD",
};

export default function TermsPage() {
  return (
    <>
      <PcHeader />
      <main className="legal-page">
        <div className="legal-container">
          <h1 className="legal-title">이용약관</h1>
          <p className="legal-updated">최종 개정일: 2026년 6월 16일</p>

          <section className="legal-section">
            <h2>제1조 (목적)</h2>
            <p>
              본 약관은 (주)씨엠엔피(이하 &ldquo;회사&rdquo;)가 운영하는 STORYCARD(스토리카드, 이하 &ldquo;서비스&rdquo;)의 이용 조건 및 절차,
              회사와 이용자 간의 권리·의무 및 책임 사항을 규정함을 목적으로 합니다.
            </p>
          </section>

          <section className="legal-section">
            <h2>제2조 (정의)</h2>
            <ol>
              <li>&ldquo;서비스&rdquo;란 회사가 제공하는 모바일 청첩장·초대장 제작 및 공유 플랫폼을 의미합니다.</li>
              <li>&ldquo;이용자&rdquo;란 본 약관에 동의하고 서비스를 이용하는 회원 및 비회원을 말합니다.</li>
              <li>&ldquo;회원&rdquo;이란 서비스에 가입하여 계정을 보유한 이용자를 말합니다.</li>
              <li>&ldquo;콘텐츠&rdquo;란 이용자가 서비스를 통해 제작·업로드하는 청첩장, 사진, 텍스트 등 일체의 정보를 말합니다.</li>
            </ol>
          </section>

          <section className="legal-section">
            <h2>제3조 (약관의 효력 및 변경)</h2>
            <ol>
              <li>본 약관은 서비스 화면에 게시하거나 기타 방법으로 이용자에게 공지함으로써 효력을 발생합니다.</li>
              <li>
                회사는 관련 법령을 위반하지 않는 범위에서 약관을 변경할 수 있으며, 변경 시 적용일 7일 전부터
                서비스 내 공지합니다. 이용자가 변경 후에도 서비스를 계속 이용하면 변경 약관에 동의한 것으로 간주합니다.
              </li>
            </ol>
          </section>

          <section className="legal-section">
            <h2>제4조 (서비스 이용)</h2>
            <ol>
              <li>서비스는 소셜 로그인(카카오·네이버)을 통해 가입 후 이용할 수 있습니다.</li>
              <li>무료 플랜에서는 청첩장 1건을 제작·공유할 수 있으며, 프리미엄 플랜에서는 추가 기능을 이용할 수 있습니다.</li>
              <li>
                회사는 서비스 품질 유지를 위해 사전 공지 후 서비스의 전부 또는 일부를 변경·중단할 수 있습니다.
                단, 긴급한 시스템 점검 등 불가피한 경우 사전 공지 없이 일시 중단할 수 있습니다.
              </li>
            </ol>
          </section>

          <section className="legal-section">
            <h2>제5조 (이용자의 의무)</h2>
            <p>이용자는 다음 행위를 하여서는 안 됩니다.</p>
            <ol>
              <li>타인의 정보 도용 또는 허위 정보 등록</li>
              <li>회사의 지적재산권 또는 제3자의 권리 침해</li>
              <li>서비스 운영을 방해하거나 시스템에 부하를 주는 행위</li>
              <li>음란물, 혐오 표현 등 불법·부적절한 콘텐츠 게시</li>
              <li>영리 목적의 무단 광고·홍보 행위</li>
              <li>관련 법령 또는 공서양속에 반하는 행위</li>
            </ol>
          </section>

          <section className="legal-section">
            <h2>제6조 (콘텐츠 및 지식재산권)</h2>
            <ol>
              <li>이용자가 제작한 콘텐츠의 저작권은 해당 이용자에게 귀속됩니다.</li>
              <li>
                이용자는 서비스 이용 과정에서 콘텐츠를 게시·공유함으로써 회사가 서비스 운영·개선·홍보 목적으로
                해당 콘텐츠를 이용할 수 있는 비독점적·무상 라이선스를 회사에 부여합니다.
              </li>
              <li>서비스의 디자인, UI, 소프트웨어 등 회사 소유 콘텐츠는 회사의 지식재산권으로 보호됩니다.</li>
            </ol>
          </section>

          <section className="legal-section">
            <h2>제7조 (책임 제한)</h2>
            <ol>
              <li>회사는 천재지변, 전쟁, 해킹 등 불가항력적 사유로 인한 서비스 장애에 대해 책임을 지지 않습니다.</li>
              <li>회사는 이용자가 서비스를 통해 얻은 정보로 인해 발생한 손해에 대해 책임을 지지 않습니다.</li>
              <li>회사는 이용자 간의 분쟁에 개입하지 않으며, 이로 인한 손해에 대해 책임을 지지 않습니다.</li>
            </ol>
          </section>

          <section className="legal-section">
            <h2>제8조 (계정 해지)</h2>
            <ol>
              <li>이용자는 언제든지 서비스 내 설정을 통해 계정을 해지할 수 있습니다.</li>
              <li>
                회사는 이용자가 본 약관을 위반한 경우 사전 통보 없이 계정을 정지하거나 해지할 수 있습니다.
              </li>
              <li>계정 해지 시 이용자의 콘텐츠는 즉시 삭제되며, 복구되지 않습니다.</li>
            </ol>
          </section>

          <section className="legal-section">
            <h2>제9조 (준거법 및 관할)</h2>
            <p>
              본 약관은 대한민국 법률에 따라 해석·적용되며, 서비스와 관련한 분쟁은 서울중앙지방법원을 제1심
              전속 관할 법원으로 합니다.
            </p>
          </section>

          <div className="legal-footer-nav">
            <Link href="/privacy">개인정보 처리방침 보기 →</Link>
            <Link href="/">← 홈으로</Link>
          </div>
        </div>
      </main>
      <div className="pc-main" style={{ paddingTop: 0 }}>
        <PcFooter />
      </div>
    </>
  );
}
