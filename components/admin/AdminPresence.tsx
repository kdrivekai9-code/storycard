"use client";

import { useEffect, useRef } from "react";
import { startAdminSession, pingAdminPresence, endAdminSession } from "@/app/admin/(dashboard)/account/actions";

const HEARTBEAT_INTERVAL = 60_000;

export function AdminPresence() {
  const logIdRef = useRef<string | null>(null);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    startAdminSession().then((id) => {
      if (!id) return;
      logIdRef.current = id;

      intervalId = setInterval(() => {
        if (logIdRef.current) pingAdminPresence(logIdRef.current);
      }, HEARTBEAT_INTERVAL);
    });

    // pagehide: 탭/브라우저 닫기 + 일반 navigation 모두 발생
    // persisted=false 이면 페이지가 캐시되지 않음(탭 닫기/새 URL 이동)
    // SPA 내부 이동(router.push)은 pagehide 를 발생시키지 않으므로 안전
    function handlePageHide(e: PageTransitionEvent) {
      if (!logIdRef.current) return;

      // persisted=true 면 bfcache에 보존되는 일반 이동 — 로그 종료 불필요
      if (e.persisted) return;

      navigator.sendBeacon(
        "/api/admin/session-end",
        JSON.stringify({ logId: logIdRef.current }),
      );
    }

    window.addEventListener("pagehide", handlePageHide);

    return () => {
      if (intervalId) clearInterval(intervalId);
      window.removeEventListener("pagehide", handlePageHide);
      // 컴포넌트 언마운트(SPA 내부 이동)에서는 로그만 종료, 세션은 유지
      if (logIdRef.current) endAdminSession(logIdRef.current);
    };
  }, []);

  return null;
}
