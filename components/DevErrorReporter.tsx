"use client";
// 브라우저 오류 자동 수집 (개발 전용). layout에서 dev일 때만 마운트.
// window error / unhandledrejection / console.error 를 잡아 /api/_devlog 로 전송.
import { useEffect } from "react";

function send(payload: {
  kind: string;
  message: string;
  stack?: string;
  extra?: unknown;
}) {
  try {
    const body = JSON.stringify({ ...payload, url: window.location.href });
    // 페이지 이탈 중에도 안전하게 전송
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/devlog", body);
    } else {
      void fetch("/api/devlog", { method: "POST", body, keepalive: true });
    }
  } catch {
    /* noop */
  }
}

function serializeArg(a: unknown): string {
  if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack ?? ""}`;
  if (typeof a === "string") return a;
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}

export default function DevErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      send({
        kind: "error",
        message: e.message,
        stack: e.error?.stack,
        extra: { filename: e.filename, line: e.lineno, col: e.colno },
      });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      send({
        kind: "unhandledrejection",
        message: r instanceof Error ? r.message : serializeArg(r),
        stack: r instanceof Error ? r.stack : undefined,
      });
    };

    // console.error 래핑 (원본 동작은 유지)
    const orig = console.error;
    console.error = (...args: unknown[]) => {
      orig.apply(console, args as []);
      // Next dev 오버레이 내부 로그 등 노이즈를 줄이려면 여기서 필터 가능
      send({ kind: "console.error", message: args.map(serializeArg).join(" ") });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      console.error = orig;
    };
  }, []);

  return null;
}
