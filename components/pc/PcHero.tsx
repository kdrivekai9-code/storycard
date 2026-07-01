"use client";

import { useEffect, useState } from "react";
import { AiCameraIcon, GiftIcon, StopwatchIcon } from "./AdIcons";

const AD_SLIDES = [
  {
    color: "#f4a8c6",
    bg: "#fff5f8",
    icon: GiftIcon,
    kw: "100% 완전 무료!",
    kwColor: "#e0699f",
    sub: (
      <>
        “무료라고 하고 돈을 받는데 저희는 <strong style={{ color: "#e0699f" }}>진짜 무료</strong>입니다.”
      </>
    ),
  },
  {
    color: "#8fe0bc",
    bg: "#f0fff8",
    icon: StopwatchIcon,
    kw: "딱 1분만 투자하세요",
    kwColor: "#4fb98a",
    sub: (
      <>
        “불필요한 옵션 NO — 7개 질문으로 <strong style={{ color: "#4fb98a" }}>알아서 척척</strong> 만들어 드립니다.”
      </>
    ),
  },
  {
    color: "#c5a8ec",
    bg: "#f8f4ff",
    icon: AiCameraIcon,
    kw: "스틸사진 방식은 이젠 안녕!",
    kwColor: "#9b7cc9",
    sub: (
      <>
        “프리미엄 <strong style={{ color: "#9b7cc9" }}>AI 생성형 모바일 카드</strong>로 더 특별한 청첩장을 경험하세요.”
      </>
    ),
  },
];

export function PcHero() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setActive((prev) => (prev + 1) % AD_SLIDES.length);
    }, 3800);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="pc-hero-full" id="sec-hero">
      <div className="pc-hero-inner">
        <div className="pc-hero-left">
          <h1>
            가장 닮은 <em style={{ display: "inline", fontStyle: "italic" }}>청첩장을 짓다.</em>
          </h1>
        </div>

        <div className="pc-ad-carousel">
          {AD_SLIDES.map((slide, i) => {
            const Icon = slide.icon;
            return (
              <div
                key={i}
                className={`pc-ad-slide${i === active ? " active" : ""}`}
                style={{ "--ad-color": slide.color } as React.CSSProperties}
              >
                <div className="ad-icon">
                  <Icon color={slide.color} bg={slide.bg} />
                </div>
                <div className="ad-body">
                  <div className="ad-text-kw" style={slide.kwColor ? { color: slide.kwColor } : undefined}>
                    {slide.kw}
                  </div>
                  <div className="ad-text-sub">{slide.sub}</div>
                </div>
              </div>
            );
          })}

          <div className="ad-dots">
            {AD_SLIDES.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`ad-dot${i === active ? " active" : ""}`}
                onClick={() => setActive(i)}
                aria-label={`광고 ${i + 1}번`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
