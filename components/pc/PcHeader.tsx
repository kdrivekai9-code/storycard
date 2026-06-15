import Link from "next/link";

const STORY = "STORY".split("");
const CARD = "CARD".split("");

export function PcHeader() {
  return (
    <header className="pc-header">
      <div className="pc-brand">
        <span className="pc-logo">
          {STORY.map((ch, i) => (
            <span key={`s-${i}`} className="pc-logo-char" style={{ animationDelay: `${i * 0.16}s` }}>
              {ch}
            </span>
          ))}
          <em>
            {CARD.map((ch, i) => (
              <span
                key={`c-${i}`}
                className="pc-logo-char"
                style={{ animationDelay: `${(STORY.length + i) * 0.16}s` }}
              >
                {ch}
              </span>
            ))}
          </em>
        </span>
        <span className="pc-tagline">FOR YOUR SPECIAL DAY · 모바일 청첩장</span>
      </div>
      <nav className="pc-nav">
        <a href="#sec-hero">INTRODUCE</a>
        <a href="#sec-edit">MAKE</a>
        <a href="#sec-samples">SAMPLE</a>
        <a href="#sec-premium">Q&amp;A</a>
        <Link href="/login">LOGIN</Link>
      </nav>
    </header>
  );
}
