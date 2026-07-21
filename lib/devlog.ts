// 개발용 오류 수집기 — 브라우저/서버 오류를 .devlog/errors.log 한 파일에 모은다.
// 프로덕션에서는 절대 사용하지 않는다 (route/instrumentation에서 dev 가드).
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

const LOG_DIR = path.join(process.cwd(), ".devlog");
const LOG_FILE = path.join(LOG_DIR, "errors.log");

export type DevLogEntry = {
  source: "browser" | "server";
  kind: string; // "error" | "unhandledrejection" | "console.error" | route context 등
  message: string;
  stack?: string;
  url?: string; // 브라우저: 페이지 URL / 서버: 요청 경로
  extra?: unknown;
};

export async function appendDevLog(entry: DevLogEntry): Promise<void> {
  const line =
    JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n";
  try {
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(LOG_FILE, line, "utf8");
  } catch {
    // 로깅 실패가 앱 동작에 영향을 주지 않도록 무시
  }
}
