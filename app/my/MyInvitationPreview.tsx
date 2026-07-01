"use client";

import { useRef, useState } from "react";

// 초기화면 미리보기(.pc-emulator .device, .inv-page-wrap)와 동일한 기준 폭
const VIEWPORT_W = 430;
const FALLBACK_H = 680;

export function MyInvitationPreview({ slug, title }: { slug: string; title: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [contentHeight, setContentHeight] = useState(FALLBACK_H);

  const handleLoad = () => {
    const iframe = iframeRef.current;
    const outer = outerRef.current;
    if (!iframe || !outer) return;
    try {
      const doc = iframe.contentDocument;
      const fullHeight = doc?.documentElement.scrollHeight || FALLBACK_H;
      setContentHeight(fullHeight);
      setScale(outer.offsetWidth / VIEWPORT_W);
    } catch {
      // 측정 실패 시 기본 크기 유지
      setScale(outer.offsetWidth / VIEWPORT_W);
    }
  };

  return (
    <div
      ref={outerRef}
      className="my-inv-preview"
      style={{ height: scale ? contentHeight * scale : undefined }}
    >
      <iframe
        ref={iframeRef}
        src={`/i/${slug}`}
        title={title}
        scrolling="no"
        className="my-inv-iframe"
        style={{
          width: VIEWPORT_W,
          height: contentHeight,
          transform: `scale(${scale || 1})`,
        }}
        onLoad={handleLoad}
      />
    </div>
  );
}
