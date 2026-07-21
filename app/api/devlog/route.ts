// 브라우저 오류 수집 엔드포인트 (개발 전용). 경로: /api/devlog
// 클라이언트 리포터가 이곳으로 POST → .devlog/errors.log에 기록.
import { appendDevLog, type DevLogEntry } from "@/lib/devlog";

export async function POST(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return new Response(null, { status: 404 });
  }
  try {
    const body = (await request.json()) as Partial<DevLogEntry>;
    await appendDevLog({
      source: "browser",
      kind: body.kind ?? "error",
      message: body.message ?? "(no message)",
      stack: body.stack,
      url: body.url,
      extra: body.extra,
    });
  } catch {
    // 잘못된 페이로드는 조용히 무시
  }
  return new Response(null, { status: 204 });
}
