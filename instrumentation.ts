// 서버 오류 자동 수집 (개발 전용). Next 16 onRequestError 훅.
// SSR / Route Handler / Server Action 에서 발생한 오류를 .devlog/errors.log에 기록.
// 주의: instrumentation은 서버 시작 시 1회 등록되므로, 이 파일 추가/변경 후에는
//       dev 서버를 한 번 재시작해야 활성화된다.
import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  if (process.env.NODE_ENV === "production") return;
  // fs는 node 런타임에서만 — edge 런타임 요청은 건너뛴다.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { appendDevLog } = await import("@/lib/devlog");
  const e = err as { message?: string; stack?: string; digest?: string };
  await appendDevLog({
    source: "server",
    kind: `${context.routeType}:${context.routerKind}`,
    message: e.message ?? String(err),
    stack: e.stack,
    url: request.path,
    extra: { method: request.method, routePath: context.routePath, digest: e.digest },
  });
};
