"use client";

import { useEffect, useRef } from "react";
import { startAdminSession, pingAdminPresence, endAdminSession } from "@/app/admin/(dashboard)/account/actions";

const HEARTBEAT_INTERVAL = 60_000; // 60초

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
      if (logIdRef.current) {
        // sendBeacon을 통해 비동기로 종료 기록
        const body = JSON.stringify({ logId: logIdRef.current });
        navigator.sendBeacon("/api/admin/session-end", body);
      }
    }

    window.addEventListener("beforeunload", handleUnload);

    return () => {
      if (intervalId) clearInterval(intervalId);
      window.removeEventListener("beforeunload", handleUnload);
      if (logIdRef.current) endAdminSession(logIdRef.current);
    };
  }, []);

  return null;
}
