"use server";

import { requireAdmin } from "@/lib/admin/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/admin-server";

const BUCKET = "invitation-photos";
const PREFIX = "faceswap-test3";

async function uploadToStorage(file: File, name: string): Promise<string> {
  const admin = createAdminClient();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${PREFIX}/${Date.now()}-${name}.${ext}`;
  const { error } = await admin.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: true,
  });
  if (error) throw new Error(`스토리지 업로드 실패(${name}): ${error.message}`);
  return admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function invokeEdgeFunction(body: Record<string, unknown>) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (process.env.NODE_ENV !== "production") {
    console.log("[face-swap] invoke →", JSON.stringify({ action: body.action, hasSession: !!session }));
  }

  const { data, error } = await supabase.functions.invoke("face-swap", {
    body,
    headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
  });
  if (error) {
    let detail = error.message;
    try {
      const ctx = (error as unknown as { context?: Response }).context;
      if (ctx) {
        const b = await ctx.json().catch(() => ctx.text());
        // edge function은 실패 시 { error: "..." } 형태로 응답한다. 그 error 필드 값을
        // 그대로 꺼내 써야지, 객체 전체를 다시 JSON.stringify 하면 우리가 이미 보기 좋게
        // 만들어둔 문자열(예: "Try Again — 원본 응답: {...}")이 한 번 더 감싸져서
        // 클라이언트에서 파싱이 안 되는 이중 인코딩 버그가 생긴다.
        if (typeof b === "string") detail = b;
        else if (b && typeof b === "object" && "error" in b) detail = String((b as Record<string, unknown>).error);
        else detail = JSON.stringify(b);
      }
    } catch { /* ignore */ }
    console.error("[face-swap] invoke error →", detail);
    return { ok: false as const, error: detail };
  }

  if (process.env.NODE_ENV !== "production") {
    console.log("[face-swap] invoke ←", JSON.stringify(data));
  }

  return { ok: true as const, data: data as Record<string, unknown> };
}

// 폴링 중 실패가 나왔을 때 자동 재제출에 필요한 원본 요청 정보.
// Multiple Face Swap(deepfake/multiple_face_swap)은 target_image가 문자열
// 하나만 지원한다(ModelsLab 문서 기준 — 배열 불가). 얼굴 소스가 2명이면
// 클라이언트가 좌우로 합성한 이미지 하나를 만들어 이 targetUrl로 올린다.
export type RetryCtx = {
  initUrl: string;
  targetUrl: string;
  enhance: boolean;
};

async function submitToModelsLab(ctx: RetryCtx) {
  return invokeEdgeFunction({
    action: "multi-swap",
    init_image: ctx.initUrl,
    target_image: ctx.targetUrl,
    enhance: ctx.enhance,
  });
}

// ModelsLab이 공유 큐 혼잡 등으로 "다시 시도하라"는 뜻의 실패를 낼 때가 있다.
// 이 경우 사용자에게 바로 에러를 보여주는 대신 동일한 요청을 한 번 자동으로
// 재제출한다(완전히 새 작업으로 다시 큐에 넣음 — 실패한 작업을 다시 조회해봐야
// 소용없으므로).
function isRetryableFailure(message: string): boolean {
  return message.includes("Try Again");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function submitMultiFaceSwap(formData: FormData): Promise<
  | { ok: true; status: "success"; outputUrl: string }
  | { ok: true; status: "processing"; fetchUrl: string; eta: number; retryCtx: RetryCtx; rawStatus?: string }
  | { ok: false; error: string; retried?: boolean }
> {
  await requireAdmin();

  const initFile   = formData.get("init_image")   as File | null;
  const targetFile = formData.get("target_image") as File | null;
  const enhance    = formData.get("enhance") === "1";

  if (!initFile   || initFile.size === 0)   return { ok: false, error: "Init Image를 선택해주세요." };
  if (!targetFile || targetFile.size === 0) return { ok: false, error: "얼굴 소스를 선택해주세요." };

  try {
    const [initUrl, targetUrl] = await Promise.all([
      uploadToStorage(initFile,   "init"),
      uploadToStorage(targetFile, "target"),
    ]);

    if (process.env.NODE_ENV !== "production") {
      console.log("[face-swap] 업로드 완료 →", { initUrl, targetUrl, enhance });
    }

    const retryCtx: RetryCtx = { initUrl, targetUrl, enhance };
    let result = await submitToModelsLab(retryCtx);
    let didRetry = false;

    // 최초 제출 자체가 ModelsLab의 "다시 시도하세요"류 실패로 즉시 거절되는 경우도
    // 있다(폴링까지 가지도 못함). edge function은 이 실패를 HTTP 502(→ invoke 레벨
    // error, result.ok===false)로 내려준다. result.data.error만 확인하면 이 경로를
    // 절대 못 만나 재시도가 전혀 동작하지 않는다 — 두 경로를 모두 봐야 한다.
    const initialErrorMessage = !result.ok ? result.error : (result.data.error ? String(result.data.error) : null);
    if (initialErrorMessage && isRetryableFailure(initialErrorMessage)) {
      console.log("[face-swap] 최초 제출 실패(재시도 가능) → 자동 재제출:", initialErrorMessage);
      result = await submitToModelsLab(retryCtx);
      didRetry = true;
    }

    if (!result.ok) return { ok: false, error: result.error, retried: didRetry };
    const d = result.data;
    // 재시도했는데도 또 실패하면 이 사실이 화면에서 묻히지 않도록 retried를 함께 넘긴다.
    if (d.error) return { ok: false, error: String(d.error), retried: didRetry };

    if (d.status === "success") return { ok: true, status: "success", outputUrl: String(d.outputUrl) };

    return {
      ok: true,
      status: "processing",
      fetchUrl: String(d.fetchUrl),
      eta: Number(d.eta ?? 10),
      retryCtx,
      rawStatus: typeof d.rawStatus === "string" ? d.rawStatus : undefined,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// 클라이언트가 4초마다 짧게 계속 호출하는 폴링 대신, 서버가 내부적으로 최대
// LONG_POLL_BUDGET_MS 동안 반복 확인하다가 완료되면 그 즉시 결과를 반환한다.
// 클라이언트는 이 호출이 끝날 때만(=완료되었거나 예산 소진) 다시 부르면 되므로
// 요청 수가 크게 줄고, 응답이 나오는 즉시 알 수 있다(짧은 간격 setInterval 불필요).
const LONG_POLL_BUDGET_MS = 90_000;
const LONG_POLL_INTERVAL_MS = 4_000;
const MAX_AUTO_RETRIES = 1;

export async function pollMultiFaceSwap(fetchUrl: string, retryCtx?: RetryCtx): Promise<
  | { status: "success"; outputUrl: string }
  | { status: "processing"; eta?: number; fetchUrl?: string; retried?: boolean; rawStatus?: string }
  | { status: "error"; error: string; retried?: boolean }
> {
  await requireAdmin();

  const deadline = Date.now() + LONG_POLL_BUDGET_MS;
  let lastEta = 3;
  let lastRawStatus: string | undefined;
  let currentFetchUrl = fetchUrl;
  let retriesLeft = MAX_AUTO_RETRIES;
  let didRetry = false;

  while (true) {
    const result = await invokeEdgeFunction({ action: "poll", fetchUrl: currentFetchUrl });

    // edge function은 ModelsLab 실패를 HTTP 502(→ invoke 레벨 error, result.ok===false)로
    // 내려준다. !result.ok를 바로 반환해버리면 실제 ModelsLab 실패(대부분 502로 옴)에는
    // 재시도 로직이 전혀 도달하지 못한다 — 두 에러 경로(!result.ok / result.data.error)를
    // 하나로 합쳐서 동일하게 재시도 판단을 거친다.
    const message = !result.ok ? result.error : (result.data.error ? String(result.data.error) : null);

    if (message === null && result.ok && result.data.status === "success") {
      return { status: "success", outputUrl: String(result.data.outputUrl) };
    }

    if (message !== null) {
      if (retriesLeft > 0 && retryCtx && isRetryableFailure(message)) {
        console.log("[face-swap] ModelsLab 재시도 가능한 실패 감지 → 자동 재제출:", message);
        const resub = await submitToModelsLab(retryCtx);
        // 재제출 시도 자체는 여기서 이미 일어났으므로, 그 결과(성공/실패)와 무관하게
        // "재시도를 했다"는 사실을 기록해둔다 — 안 그러면 재제출까지 실패했을 때
        // 클라이언트에는 마치 재시도를 아예 안 한 것처럼 보인다.
        retriesLeft -= 1;
        didRetry = true;
        if (resub.ok && !resub.data.error && resub.data.status === "processing" && resub.data.fetchUrl) {
          currentFetchUrl = String(resub.data.fetchUrl);
          lastEta = Number(resub.data.eta ?? lastEta);
          lastRawStatus = typeof resub.data.rawStatus === "string" ? resub.data.rawStatus : lastRawStatus;
          if (Date.now() + LONG_POLL_INTERVAL_MS >= deadline) {
            return { status: "processing", eta: lastEta, fetchUrl: currentFetchUrl, retried: true, rawStatus: lastRawStatus };
          }
          await sleep(LONG_POLL_INTERVAL_MS);
          continue;
        }
        // 재제출 자체가 실패하면 원래 에러를 그대로 노출
      }
      // didRetry가 true인 경우: 자동 재시도까지 했지만 재제출된 작업도 다시
      // 실패했다는 뜻 — 클라이언트에 그대로 알려서 "재시도도 이미 했다"는
      // 사실이 묻히지 않게 한다.
      return { status: "error", error: message, retried: didRetry };
    }

    // message===null이면 항상 result.ok===true (result.error 케이스는 위에서
    // 이미 message를 채웠으므로 여기 도달 못 함) — 단언으로 타입만 좁힌다.
    const d = (result as { ok: true; data: Record<string, unknown> }).data;
    lastEta = Number(d.eta ?? lastEta);
    lastRawStatus = typeof d.rawStatus === "string" ? d.rawStatus : lastRawStatus;
    if (Date.now() + LONG_POLL_INTERVAL_MS >= deadline) {
      // 예산 소진 — 클라이언트가 다시 호출하도록 processing 상태로 반환
      return { status: "processing", eta: lastEta, fetchUrl: currentFetchUrl, retried: didRetry, rawStatus: lastRawStatus };
    }
    await sleep(LONG_POLL_INTERVAL_MS);
  }
}
