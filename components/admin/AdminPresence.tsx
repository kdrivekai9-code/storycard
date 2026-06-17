"use client";

import { useEffect, useRef } from "react";
import { createAdminBrowserClient } from "@/lib/supabase/admin-client";
import { startAdminSession, pingAdminPresence } from "@/app/admin/(dashboard)/account/actions";

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

    function handleUnload() {
      const body = JSON.stringify({ logId: logIdRef.current });

      // 1) sendBeacon으로 서버 세션 만료 (가장 신뢰도 높음)
      navigator.sendBeacon("/api/admin/session-end", body);

      // 2) 클라이언트 sessionStorage 토큰도 즉시 제거
      try {
        const supabase = createAdminBrowserClient();
        supabase.auth.signOut();
      } catch {
        // beforeunload 중 실패 무시
      }
    }

    window.addEventListener("beforeunload", handleUnload);

    return () => {
      if (intervalId) clearInterval(intervalId);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, []);

  return null;
}
