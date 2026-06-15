export function RsvpSection() {
  return (
    <section className="inv-section inv-rsvp" data-section="rsvp">
      <div className="eyebrow">RSVP</div>
      <h2 className="heading">참석 의사</h2>
      <div className="rsvp-card">
        <p>
          식사 준비를 위해
          <br />
          참석 여부를 알려주시면 감사하겠습니다.
        </p>
        <button type="button" className="rsvp-btn">
          참석 의사 전하기
        </button>
      </div>
    </section>
  );
}
