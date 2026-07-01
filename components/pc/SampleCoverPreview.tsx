"use client";

import { useEffect, useRef, useState } from "react";
import { mergeConfig } from "@/lib/invitation/mergeConfig";
import { deriveInvitationData } from "@/lib/invitation/derive";
import { DEFAULT_USER_DATA } from "@/store/invitationStore";
import { CoverSection } from "@/components/invitation/sections/CoverSection";
import { MotionController } from "@/components/invitation/MotionController";
import type { StyleAnswers } from "@/lib/invitation/types";

// 실제 청첩장 표지(.inv-cover)의 원본 크기 — .pc-emulator .device 기준
const NATIVE_W = 430;
const NATIVE_H = 720;

/** 샘플 카드 안에 실제 청첩장 표지를 독립적으로(전역 스토어와 무관하게) 동적 렌더링 */
export function SampleCoverPreview({
  answers,
  photos,
}: {
  answers: StyleAnswers;
  photos: string[];
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const update = () => {
      // 가로폭을 카드 배경 섹션에 맞게 가득 채움 (상단 기준, 하단은 카드 높이만큼 크롭)
      setScale(el.offsetWidth / NATIVE_W);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const config = mergeConfig(answers);
  const bound = deriveInvitationData(DEFAULT_USER_DATA, config.tone);

  return (
    <div ref={outerRef} className="sample-cover-outer">
      <div
        className="sample-cover-inner"
        data-motion={config.motion}
        style={
          {
            width: NATIVE_W,
            height: NATIVE_H,
            transform: `scale(${scale})`,
            "--bg": config.theme.bg,
            "--ink": config.theme.ink,
            "--ink-soft": config.theme.inkSoft,
            "--ink-faint": config.theme.inkFaint,
            "--accent": config.theme.accent,
            "--accent-deep": config.theme.accentDeep,
            "--line": config.theme.line,
            "--line-soft": config.theme.lineSoft,
            "--cover-bg": config.theme.coverBg,
            background: "var(--bg)",
          } as React.CSSProperties
        }
      >
        <MotionController motion={config.motion} letteringText={config.letteringText} />
        <CoverSection
          bound={bound}
          cover={config.cover}
          coverTextColor={config.coverTextColor}
          photos={photos}
        />
      </div>
    </div>
  );
}
