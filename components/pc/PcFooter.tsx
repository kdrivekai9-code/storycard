import Link from "next/link";

export function PcFooter() {
  return (
    <footer className="pc-footer">
      <div className="top">
        <span className="copy">CARDSTORY</span>
        <div className="links">
          <Link href="/terms">이용약관</Link>
          <Link href="/privacy">개인정보</Link>
          <a>고객센터</a>
          <a>제휴문의</a>
        </div>
      </div>
      <div className="legal">
        © 2026 CardStory · Crafted with care for your special day.
        <br />
        모바일 청첩장 · AI 영상 청첩장 · 부고장 (예정)
        <br />
        (주)씨엠엔피 390-86-01401 / 서울시 서초구 방배천로2길 10, 5층
      </div>
    </footer>
  );
}
