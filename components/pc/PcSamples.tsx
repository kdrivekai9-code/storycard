"use client";

import { useInvitationStore } from "@/store/invitationStore";
import type { Mood } from "@/lib/invitation/types";

const SAMPLES: {
  id: Mood | "mono";
  visualClass: string;
  visualStyle?: React.CSSProperties;
  name: string;
  sub: string;
}[] = [
  { id: "romantic", visualClass: "vis-romantic", name: "Romantic", sub: "플로럴 · 따뜻한 톤" },
  { id: "modern", visualClass: "vis-modern", name: "Modern Minimal", sub: "화이트 · 세리프" },
  { id: "classic", visualClass: "vis-classic", name: "Classic Elegant", sub: "골드 프레임" },
  { id: "vintage", visualClass: "vis-vintage", name: "Vintage", sub: "세피아 · 잔잔한 무드" },
  { id: "vivid", visualClass: "vis-vivid", name: "Vivid", sub: "생기 있는 컬러" },
  {
    id: "mono",
    visualClass: "",
    visualStyle: { background: "#1a1a1a", color: "#d8b878" },
    name: "Mono Premium",
    sub: "프리미엄 한정",
  },
];

export function PcSamples() {
  const setAnswer = useInvitationStore((s) => s.setAnswer);

  const handleSelect = (id: Mood | "mono") => {
    if (id === "mono") {
      setAnswer("mood", "modern");
      setAnswer("palette", "deep");
    } else {
      setAnswer("mood", id);
    }
  };

  return (
    <section className="pc-live" id="sec-samples">
      <p className="lead">SAMPLES</p>
      <h2 className="title">
        먼저 <em>샘플</em>로 분위기를 정하세요.
      </h2>
      <p className="desc">
        썸네일을 누르면 그 분위기로 오른쪽 청첩장이 즉시 바뀝니다. 마음에 드는 톤을 정한 뒤 아래에서 두 분의 정보를
        입력하세요.
      </p>
      <div className="pc-cards cols-3">
        {SAMPLES.map((sample) => (
          <div key={sample.id} className="pc-card" onClick={() => handleSelect(sample.id)}>
            <div
              className={`visual ${sample.visualClass}`}
              style={{ aspectRatio: "9/12", fontSize: "24px", ...sample.visualStyle }}
            >
              Junho &amp; Seoyeon
            </div>
            <div className="meta">
              <div className="name">{sample.name}</div>
              <div className="sub">{sample.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
