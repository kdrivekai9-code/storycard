"use client";

import { useEffect, useRef, useState } from "react";
import type { BoundInvitationData, CoverType } from "@/lib/invitation/types";
import { isVideoUrl } from "@/lib/invitation/photoUpload";
import { useInvitationStore } from "@/store/invitationStore";

type SlideState = { active: number; display: number; fading: boolean };
const INITIAL: SlideState = { active: 0, display: 0, fading: false };

/** 영상으로 제작한 원본 사진 자리는 사진 대신 영상으로 표시 */
function Media({
  className,
  videoUrl,
  fallbackStyle,
  objectPosition,
  fadeStyleOverride,
}: {
  className: string;
  videoUrl?: string;
  fallbackStyle: React.CSSProperties;
  objectPosition: string;
  fadeStyleOverride?: React.CSSProperties;
}) {
  if (videoUrl) {
    return (
      <video
        className={className}
        src={videoUrl}
        style={{ objectFit: "cover", objectPosition, ...fadeStyleOverride }}
        autoPlay
        muted
        loop
        playsInline
      />
    );
  }
  return <div className={className} style={fallbackStyle} />;
}

export function CoverSection({
  bound,
  cover,
  coverTextColor,
  photos: photosProp,
}: {
  bound: BoundInvitationData;
  cover: CoverType;
  coverTextColor?: string;
  /** 지정 시 전역 스토어 대신 이 사진 목록을 사용 (독립 렌더링용 — 샘플 미리보기 등) */
  photos?: string[];
}) {
  const storePhotos = useInvitationStore((s) => s.photos);
  const photos = photosProp ?? storePhotos;
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

  const videoFor = (u?: string) => (u && isVideoUrl(u) ? u : undefined);

  const url = (idx: number) => (photos[idx] ? `url('${photos[idx]}')` : undefined);
  const bg = (u?: string): React.CSSProperties => (u ? { backgroundImage: u } : {});

  // frame / split: single photo with opacity fade
  const displayUrl = photos[slide.display] ?? photos[0];
  const fadeStyle: React.CSSProperties = { opacity: slide.fading ? 0 : 1, transition: "opacity 0.5s ease" };
  const fadeBg: React.CSSProperties = { ...bg(displayUrl ? `url('${displayUrl}')` : undefined), ...fadeStyle };

  // mosaic: 3 슬롯 — URL + fade 스타일
  const mosaicStyle: React.CSSProperties = { opacity: slide.fading ? 0 : 1, transition: "opacity 0.6s ease" };
  const mosaicSrc = (offset: number): string | undefined =>
    photos.length === 0 ? undefined : photos[(slide.display + offset) % photos.length];

  return (
    <div
      className={`inv-cover cover-${cover}`}
      style={coverTextColor ? ({ "--ctc": coverTextColor } as React.CSSProperties) : undefined}
    >
      {/* ① 풀블리드 / ⑤ 중앙오버레이 — 슬라이드 레이어 */}
      {(cover === "full" || cover === "overlay") && (
        photos.length > 0
          ? photos.map((photo, i) => (
              <Media
                key={photo}
                className={`cover-slide${i === slide.active ? " visible" : ""}`}
                videoUrl={videoFor(photo)}
                fallbackStyle={{ backgroundImage: `url('${photo}')` }}
                objectPosition="center 20%"
              />
            ))
          : <div className="cover-photo-img" />
      )}

      {/* ② 액자형 */}
      <div className="cover-frame-box">
        <Media
          className="cover-frame-inner"
          videoUrl={cover === "frame" ? videoFor(displayUrl) : undefined}
          fallbackStyle={cover === "frame" ? fadeBg : bg(url(0))}
          objectPosition="center top"
          fadeStyleOverride={cover === "frame" ? fadeStyle : undefined}
        />
      </div>

      {/* ③ 상하분할 */}
      <div className="cover-split-strip">
        <Media
          className="cover-split-img"
          videoUrl={cover === "split" ? videoFor(displayUrl) : undefined}
          fallbackStyle={cover === "split" ? fadeBg : bg(url(0))}
          objectPosition="center top"
          fadeStyleOverride={cover === "split" ? fadeStyle : undefined}
        />
      </div>

      {/* ④ 모자이크 */}
      <div className="cover-mosaic-wrap">
        <Media
          className="mosaic-main"
          videoUrl={cover === "mosaic" ? videoFor(mosaicSrc(0)) : undefined}
          fallbackStyle={
            cover === "mosaic"
              ? { backgroundImage: mosaicSrc(0) ? `url('${mosaicSrc(0)}')` : undefined, ...mosaicStyle }
              : bg(url(0))
          }
          objectPosition="center"
          fadeStyleOverride={cover === "mosaic" ? mosaicStyle : undefined}
        />
        <div className="mosaic-row">
          <Media
            className="mosaic-sm"
            videoUrl={cover === "mosaic" ? videoFor(mosaicSrc(1)) : undefined}
            fallbackStyle={
              cover === "mosaic"
                ? { backgroundImage: mosaicSrc(1) ? `url('${mosaicSrc(1)}')` : undefined, ...mosaicStyle }
                : bg(url(1) ?? url(0))
            }
            objectPosition="center"
            fadeStyleOverride={cover === "mosaic" ? mosaicStyle : undefined}
          />
          <Media
            className="mosaic-sm"
            videoUrl={cover === "mosaic" ? videoFor(mosaicSrc(2)) : undefined}
            fallbackStyle={
              cover === "mosaic"
                ? { backgroundImage: mosaicSrc(2) ? `url('${mosaicSrc(2)}')` : undefined, ...mosaicStyle }
                : bg(url(2) ?? url(1) ?? url(0))
            }
            objectPosition="center"
            fadeStyleOverride={cover === "mosaic" ? mosaicStyle : undefined}
          />
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
        {cover === "mosaic" ? (
          <div className="ko ko-split">
            <span>{bound.groom}</span>
            <span className="ko-dot">·</span>
            <span>{bound.bride}</span>
          </div>
        ) : (
          <div className="ko">{bound.namesKo}</div>
        )}
        {cover === "full" && (
          <div className="date-time-group">
            <div className="date">{bound.dateDot}</div>
            <div className="time">{bound.timeDot}</div>
          </div>
        )}
        {cover === "mosaic" && (
          <div className="date-time-group">
            <div className="date">{bound.datePeriod}</div>
            <div className="time">{bound.dayTime}</div>
          </div>
        )}
        {cover !== "full" && cover !== "mosaic" && <div className="date">{bound.dateLong}</div>}
        <div className="venue">{bound.venueShort}</div>
        <div className="scroll-hint">SCROLL</div>
        <div className="scroll-arrow" />
      </div>
    </div>
  );
}
