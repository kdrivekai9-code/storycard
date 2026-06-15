"use client";

import { useEffect, useState } from "react";
import { AiCameraIcon, GiftIcon, StopwatchIcon } from "./AdIcons";

const AD_SLIDES = [
  {
    color: "#e8208a",
    bg: "#fff5f0",
    icon: GiftIcon,
    kw: "100% 완전 무료!",
    kwColor: undefined,
    sub: (
      <>
        &quot;무료라고 하고 돈을 받는데
        <br />
        저희는 진짜 무료입니다.&quot;
      </>
    ),
  },
  {
    color: "#20c08a",
    bg: "#f0fff8",
    icon: StopwatchIcon,
    kw: "딱 1분만 투자하세요",
    kwColor: "#1a8a60",
    sub: (
      <>
        &quot;불필요한 옵션 NO — 7개 질문으로
        <br />
        알아서 척척 만들어 드립니다.&quot;
      </>
    ),
  },
  {
    color: "#9b59b6",
    bg: "#f5f0ff",
    icon: AiCameraIcon,
    kw: "스틸사진 방식은 이젠 안녕!",
    kwColor: "#7b2da8",
    sub: (
      <>
        &quot;프리미엄 AI 생성형 모바일 카드로
        <br />더 특별한 청첩장을 경험하세요.&quot;
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
          <p className="eyebrow">FOR YOUR SPECIAL DAY · 모바일 청첩장</p>
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
                <span className="ad-shine" aria-hidden="true" />
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
