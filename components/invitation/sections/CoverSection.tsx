"use client";

import { useEffect, useRef, useState } from "react";
import type { BoundInvitationData, CoverType } from "@/lib/invitation/types";
import { useInvitationStore } from "@/store/invitationStore";

type SlideState = { active: number; display: number; fading: boolean };
const INITIAL: SlideState = { active: 0, display: 0, fading: false };

export function CoverSection({
  bound,
  cover,
  coverTextColor,
}: {
  bound: BoundInvitationData;
  cover: CoverType;
  coverTextColor?: string;
}) {
  const photos = useInvitationStore((s) => s.photos);
  const [slide, setSlide] = useState<SlideState>(INITIAL);
  const [prevCover, setPrevCover] = useState<CoverType>(cover);
  const [prevLen, setPrevLen] = useState(photos.length);
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derived-state reset: when cover or photo count changes, reset slide
  // (during-render setState is the React-recommended pattern for derived resets)
  if (prevCover !== cover || prevLen !== photos.length) {
    setPrevCover(cover);
    setPrevLen(photos.length);
    setSlide(INITIAL);
  }

  // Auto-advance slideshow
  useEffect(() => {
    if (photos.length <= 1) return;

    const isFade = cover === "frame" || cover === "split" || cover === "mosaic";
    const step = cover === "mosaic" ? 3 : 1;
    const delay = cover === "mosaic" ? 4000 : isFade ? 3500 : 3000;

    const timer = setInterval(() => {
      if (!isFade) {
        setSlide((s) => ({ ...s, active: (s.active + 1) % photos.length }));
      } else {
        setSlide((s) => ({ ...s, fading: true }));
        fadeRef.current = setTimeout(() => {
          setSlide((s) => ({
            active: (s.active + step) % photos.length,
            display: (s.display + step) % photos.length,
            fading: false,
          }));
        }, 500);
      }
    }, delay);

    return () => {
      clearInterval(timer);
      if (fadeRef.current) clearTimeout(fadeRef.current);
    };
  }, [photos, cover, photos.length]);

  const url = (idx: number) => (photos[idx] ? `url('${photos[idx]}')` : undefined);
  const bg = (u?: string): React.CSSProperties => (u ? { backgroundImage: u } : {});

  // frame / split: single photo with opacity fade
  const fadeBg: React.CSSProperties = {
    ...bg(url(slide.display) ?? url(0)),
    opacity: slide.fading ? 0 : 1,
    transition: "opacity 0.5s ease",
  };

  // mosaic: 3 slots from display index
  const mosaicBg = (offset: number): React.CSSProperties => {
    if (photos.length === 0) return {};
    return {
      backgroundImage: `url('${photos[(slide.display + offset) % photos.length]}')`,
      opacity: slide.fading ? 0 : 1,
      transition: "opacity 0.6s ease",
    };
  };

  return (
    <div
      className={`inv-cover cover-${cover}`}
      style={coverTextColor ? ({ "--ctc": coverTextColor } as React.CSSProperties) : undefined}
    >
      {/* ① 풀블리드 / ⑤ 중앙오버레이 — 슬라이드 레이어 */}
      {(cover === "full" || cover === "overlay") && (
        photos.length > 0
          ? photos.map((photo, i) => (
              <div
                key={photo}
                className={`cover-slide${i === slide.active ? " visible" : ""}`}
                style={{ backgroundImage: `url('${photo}')` }}
              />
            ))
          : <div className="cover-photo-img" />
      )}

      {/* ② 액자형 */}
      <div className="cover-frame-box">
        <div
          className="cover-frame-inner"
          style={cover === "frame" ? fadeBg : bg(url(0))}
        />
      </div>

      {/* ③ 상하분할 */}
      <div className="cover-split-strip">
        <div
          className="cover-split-img"
          style={cover === "split" ? fadeBg : bg(url(0))}
        />
      </div>

      {/* ④ 모자이크 */}
      <div className="cover-mosaic-wrap">
        <div className="mosaic-main" style={cover === "mosaic" ? mosaicBg(0) : bg(url(0))} />
        <div className="mosaic-row">
          <div className="mosaic-sm" style={cover === "mosaic" ? mosaicBg(1) : bg(url(1) ?? url(0))} />
          <div className="mosaic-sm" style={cover === "mosaic" ? mosaicBg(2) : bg(url(2) ?? url(1) ?? url(0))} />
        </div>
      </div>

      {/* 닷 인디케이터 (full / overlay, 2장 이상) */}
      {(cover === "full" || cover === "overlay") && photos.length > 1 && (
        <div className="slideshow-dots">
          {photos.map((_, i) => (
            <div
              key={i}
              className={`dot${i === slide.active ? " active" : ""}`}
              onClick={() => setSlide((s) => ({ ...s, active: i }))}
            />
          ))}
        </div>
      )}

      <div className="cover-inner">
        <div className="ornament" />
        <div className="micro">THE WEDDING OF</div>
        <div className="names">
          <span>{bound.groomEn}</span>
          <span className="amp">&amp;</span>
          <span>{bound.brideEn}</span>
        </div>
        <div className="ko">{bound.namesKo}</div>
        <div className="date">{bound.dateLong}</div>
        <div className="venue">{bound.venueShort}</div>
        <div className="scroll-hint">SCROLL</div>
        <div className="scroll-arrow" />
      </div>
    </div>
  );
}
