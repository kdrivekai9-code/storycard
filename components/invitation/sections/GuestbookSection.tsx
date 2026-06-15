const SAMPLE_ENTRIES = [
  { name: "윤성호", when: "2D AGO", message: "두 분 결혼 진심으로 축하드립니다. 늘 행복하세요." },
  { name: "정해린", when: "3D AGO", message: "청첩장 너무 예뻐요! 그날 꼭 갈게요 :)" },
  { name: "이도윤", when: "5D AGO", message: "잘 어울리는 두 분 ❤️ 결혼 축하해!" },
];

export function GuestbookSection() {
  return (
    <section className="inv-section inv-book" data-section="guestbook">
      <div className="eyebrow">Guestbook</div>
      <h2 className="heading">방명록</h2>
      {SAMPLE_ENTRIES.map((entry) => (
        <div className="book-row" key={entry.name}>
          <div className="who2">
            {entry.name} <span className="when">{entry.when}</span>
          </div>
          <div className="msg2">{entry.message}</div>
        </div>
      ))}
      <button className="write" type="button">
        + 축하 메시지 남기기
      </button>
    </section>
  );
}
