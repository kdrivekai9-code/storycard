import Link from "next/link";
import { PcHeader } from "@/components/pc/PcHeader";
import { PcFooter } from "@/components/pc/PcFooter";

export const metadata = {
  title: "개인정보 처리방침 | STORYCARD",
};

export default function PrivacyPage() {
  return (
    <>
      <PcHeader />
      <main className="legal-page">
        <div className="legal-container">
          <h1 className="legal-title">개인정보 처리방침</h1>
          <p className="legal-updated">최종 개정일: 2026년 6월 16일 · 시행일: 2026년 6월 16일</p>

          <p className="legal-intro">
            (주)씨엠엔피(이하 &ldquo;회사&rdquo;)는 개인정보 보호법 등 관련 법령을 준수하며, 이용자의 개인정보를 안전하게
            처리하기 위해 다음과 같이 개인정보 처리방침을 수립·공개합니다.
          </p>

          <section className="legal-section">
            <h2>제1조 (수집하는 개인정보의 항목 및 수집 방법)</h2>
            <h3>수집 항목</h3>
            <table className="legal-table">
              <thead>
                <tr>
                  <th>구분</th>
                  <th>수집 항목</th>
                  <th>수집 목적</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>필수 입력</td>
                  <td>이름, 이메일, 휴대폰번호</td>
                  <td>회원 가입 및 로그인, 서비스 이용 식별</td>
                </tr>
                <tr>
                  <td>선택 입력</td>
                  <td>배송지</td>
                  <td>상품 배송 서비스 제공</td>
                </tr>
                <tr>
                  <td>청첩장 제작</td>
                  <td>신랑·신부 성명, 예식 일시·장소, 가족 정보, 업로드 사진</td>
                  <td>청첩장 생성 및 공유</td>
                </tr>
                <tr>
                  <td>서비스 이용 기록</td>
                  <td>서비스 이용 기록</td>
                  <td>서비스 품질 개선, 보안</td>
                </tr>
              </tbody>
            </table>
            <h3>수집 방법</h3>
            <p>소셜 로그인 연동, 이용자 직접 입력, 서비스 이용 과정에서의 자동 수집</p>
          </section>

          <section className="legal-section">
            <h2>제2조 (개인정보의 처리 목적)</h2>
            <ol>
              <li>회원 가입 및 관리 (본인 확인, 서비스 이용 자격 관리, 고지 사항 전달)</li>
              <li>서비스 제공 (청첩장·초대장 제작, 저장, 공유 URL 발급)</li>
              <li>서비스 개선 및 신규 기능 개발</li>
              <li>법령·약관 위반 방지 및 서비스 보안 유지</li>
              <li>이벤트·혜택 안내 (수신 동의한 경우에 한함)</li>
            </ol>
          </section>

          <section className="legal-section">
            <h2>제3조 (개인정보의 보유 및 이용 기간)</h2>
            <p>
              회사는 개인정보 수집 및 이용 목적이 달성된 후에는 해당 정보를 지체 없이 파기합니다.
              단, 관련 법령에 의해 보존이 필요한 경우에는 아래와 같이 일정 기간 보존합니다.
            </p>
            <table className="legal-table">
              <thead>
                <tr>
                  <th>보존 항목</th>
                  <th>보존 기간</th>
                  <th>근거 법령</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>계약·청약철회에 관한 기록</td>
                  <td>5년</td>
                  <td>전자상거래법</td>
                </tr>
                <tr>
                  <td>대금 결제 및 재화 공급에 관한 기록</td>
                  <td>5년</td>
                  <td>전자상거래법</td>
                </tr>
                <tr>
                  <td>소비자 불만·분쟁 처리에 관한 기록</td>
                  <td>3년</td>
                  <td>전자상거래법</td>
                </tr>
                <tr>
                  <td>접속 로그 기록</td>
                  <td>3개월</td>
                  <td>통신비밀보호법</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="legal-section">
            <h2>제4조 (개인정보의 제3자 제공)</h2>
            <p>
              회사는 이용자의 개인정보를 원칙적으로 제3자에게 제공하지 않습니다.
              다만, 다음의 경우에는 예외로 합니다.
            </p>
            <ol>
              <li>이용자가 사전에 동의한 경우</li>
              <li>법령의 규정에 의거하거나 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관이 요구하는 경우</li>
            </ol>
          </section>

          <section className="legal-section">
            <h2>제5조 (개인정보 처리의 위탁)</h2>
            <table className="legal-table">
              <thead>
                <tr>
                  <th>수탁업체</th>
                  <th>위탁 업무</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Supabase, Inc.</td>
                  <td>회원 인증 및 데이터베이스 운영</td>
                </tr>
                <tr>
                  <td>Kakao Corp.</td>
                  <td>소셜 로그인 인증</td>
                </tr>
                <tr>
                  <td>NAVER Corp.</td>
                  <td>소셜 로그인 인증</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="legal-section">
            <h2>제6조 (이용자의 권리 및 행사 방법)</h2>
            <p>이용자는 언제든지 다음 권리를 행사할 수 있습니다.</p>
            <ol>
              <li>개인정보 열람 요청</li>
              <li>오류 등이 있을 경우 정정 요청</li>
              <li>삭제 요청</li>
              <li>처리 정지 요청</li>
            </ol>
            <p>
              위 권리 행사는 서비스 내 계정 설정 또는 아래 개인정보 보호책임자 연락처를 통해 하실 수 있으며,
              회사는 지체 없이 조치하겠습니다.
            </p>
          </section>

          <section className="legal-section">
            <h2>제7조 (쿠키의 사용)</h2>
            <p>
              회사는 이용자에게 개인화된 서비스를 제공하기 위해 쿠키(Cookie)를 사용합니다.
              쿠키는 웹사이트를 운영하는 데 이용되는 서버가 이용자의 브라우저에 보내는 소량의 정보이며,
              이용자의 컴퓨터 하드디스크에 저장됩니다. 이용자는 브라우저 설정을 통해 쿠키 저장을 거부할 수 있으나,
              이 경우 서비스 이용에 어려움이 있을 수 있습니다.
            </p>
          </section>

          <section className="legal-section">
            <h2>제8조 (개인정보의 안전성 확보 조치)</h2>
            <p>회사는 개인정보의 안전성 확보를 위해 다음 조치를 취하고 있습니다.</p>
            <ol>
              <li>개인정보 암호화: 비밀번호 및 민감 정보는 암호화하여 저장·전송합니다.</li>
              <li>접근 통제: 개인정보처리시스템에 대한 접근 권한을 최소화합니다.</li>
              <li>보안 프로그램 설치 및 갱신</li>
              <li>HTTPS 통신 프로토콜 적용</li>
            </ol>
          </section>

          <section className="legal-section">
            <h2>제9조 (개인정보 보호책임자)</h2>
            <p>
              회사는 개인정보 처리에 관한 업무를 총괄하는 개인정보 보호책임자를 지정하고 있습니다.
            </p>
            <table className="legal-table">
              <tbody>
                <tr>
                  <td>책임자</td>
                  <td>(주)씨엠엔피 대표</td>
                </tr>
                <tr>
                  <td>이메일</td>
                  <td>kai.9@cmnp.co.kr</td>
                </tr>
                <tr>
                  <td>주소</td>
                  <td>서울시 서초구 방배천로2길 10, 5층</td>
                </tr>
              </tbody>
            </table>
            <p style={{ marginTop: 12 }}>
              기타 개인정보 침해에 대한 신고·상담은 개인정보보호위원회(privacy.go.kr, 국번없이 182),
              한국인터넷진흥원 개인정보침해신고센터(118)에 문의하실 수 있습니다.
            </p>
          </section>

          <div className="legal-footer-nav">
            <Link href="/terms">이용약관 보기 →</Link>
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
