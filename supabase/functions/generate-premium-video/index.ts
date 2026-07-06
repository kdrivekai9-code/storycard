// @ts-nocheck
// 프리미엄 AI 생성 — 전 서비스 fal.ai SSE 구독(subscribe) 방식
//
// 서비스별 모델:
//   서비스1 (video-effect)              — fal-ai/veo3.1/lite/image-to-video  (timeout 150s)
//   서비스2 (watercolor-illustration)  — fal-ai/bytedance/seedream/v5/lite/edit, seed 831391799  (timeout 90s)
//   서비스3 (webtoon)                  — fal-ai/bytedance/seedream/v5/lite/edit, seed 1321871221 (timeout 90s)
//   서비스4 (bg-change)                — fal-ai/bytedance/seedream/v5/lite/edit (timeout 90s)
//
// 흐름: start → DB submitted → fal.ai SSE 구독 → 완료 시 DB done → { status:"done", video_url } 즉시 반환
//       poll  → DB 상태 조회만 (재접속 복구용, 구독 중엔 사용 안 함)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FAL_KEY = Deno.env.get("FAL_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

const VIDEO_MODEL        = "fal-ai/veo3.1/lite/image-to-video";
const SEEDREAM_MODEL     = "fal-ai/bytedance/seedream/v5/lite/edit";
const NANO_BANANA_MODEL  = "fal-ai/nano-banana-2/edit";
const MUX_MODEL          = "fal-ai/ffmpeg-api/merge-audio-video";

const IMAGE_STYLE_PROMPT_IDS = new Set(["watercolor-illustration", "webtoon", "bg-change"]);

function json(body: unknown, status = 200, logs?: string[]) {
  const payload = logs ? { ...(body as object), logs } : body;
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function publicUrl(bucket: string, path: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

class FalRejectionError extends Error {
  constructor(public readonly httpStatus: number, message: string) {
    super(message);
    this.name = "FalRejectionError";
  }
}

async function falUploadImage(supabaseImageUrl: string): Promise<string> {
  const imgRes = await fetch(supabaseImageUrl);
  if (!imgRes.ok) throw new Error(`이미지 다운로드 실패 (${imgRes.status})`);
  const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
  const imgBuffer = await imgRes.arrayBuffer();
  const fileName = supabaseImageUrl.split("/").pop() ?? "image.jpg";

  const initiateRes = await fetch(
    "https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3",
    {
      method: "POST",
      headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ file_name: fileName, content_type: contentType }),
    }
  );
  if (!initiateRes.ok) {
    throw new Error(`fal.ai 업로드 URL 발급 실패 (${initiateRes.status}): ${await initiateRes.text()}`);
  }
  const { file_url, upload_url } = await initiateRes.json() as { file_url: string; upload_url: string };

  const putRes = await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: imgBuffer,
  });
  if (!putRes.ok) throw new Error(`fal.ai 파일 업로드 실패 (${putRes.status}): ${await putRes.text()}`);

  return file_url;
}

async function falSubmit(model: string, input: Record<string, unknown>) {
  const res = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: { Authorization: `Key ${FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status >= 400 && res.status < 500) {
      throw new FalRejectionError(res.status, `fal.ai 거부 (${res.status}): ${body}`);
    }
    throw new Error(`fal submit failed (${res.status}): ${body}`);
  }
  return (await res.json()) as { request_id: string; status_url: string; response_url: string };
}

async function falResult(responseUrl: string) {
  const res = await fetch(responseUrl, { headers: { Authorization: `Key ${FAL_KEY}` } });
  if (!res.ok) throw new Error(`fal result fetch failed (${res.status}): ${await res.text()}`);
  return await res.json();
}

async function falCancel(statusUrl: string): Promise<void> {
  try {
    await fetch(statusUrl.replace("/status", "/cancel"), {
      method: "PUT",
      headers: { Authorization: `Key ${FAL_KEY}` },
    });
  } catch { /* 취소 실패 무시 */ }
}

/**
 * fal.ai SSE 구독 — 큐 제출 후 status/stream SSE를 구독하며 완료까지 대기합니다.
 */
async function falSubscribeAndWait(
  model: string,
  input: Record<string, unknown>,
  log: (...args: unknown[]) => void,
  timeoutMs: number,
): Promise<string> {
  const submitted = await falSubmit(model, input);
  log("[subscribe] request_id:", submitted.request_id, "model:", model);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const sseRes = await fetch(`${submitted.status_url}/stream`, {
      headers: { Authorization: `Key ${FAL_KEY}`, Accept: "text/event-stream" },
      signal: controller.signal,
    });
    if (!sseRes.ok) {
      throw new Error(`SSE 스트림 연결 실패 (${sseRes.status}): ${await sseRes.text()}`);
    }

    const reader = sseRes.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === "[DONE]") continue;

        let event: { status?: string; error?: string };
        try { event = JSON.parse(raw); } catch { continue; }

        log("[subscribe] status:", event.status);

        if (event.status === "COMPLETED") {
          reader.cancel();
          const result = await falResult(submitted.response_url);
          const outputUrl = extractOutputUrl(result);
          if (!outputUrl) throw new Error(`결과 URL을 찾을 수 없습니다. (keys: ${Object.keys(result ?? {}).join(", ")})`);
          return outputUrl;
        }
        if (event.status === "FAILED") {
          throw new Error(`fal.ai 생성 실패: ${event.error ?? "unknown"}`);
        }
      }
    }

    throw new Error("SSE 스트림이 완료 이벤트 없이 종료됐습니다.");
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error(`구독 타임아웃 (${timeoutMs / 1000}초 초과)`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractOutputUrl(result: Record<string, unknown>): string | null {
  const r = result as {
    video?: { url?: string };
    image?: { url?: string };
    images?: Array<{ url?: string }>;
    data?: {
      video?: { url?: string };
      image?: { url?: string };
      images?: Array<{ url?: string }>;
    };
  };
  return (
    r?.video?.url ??
    r?.image?.url ??
    r?.images?.[0]?.url ??
    r?.data?.video?.url ??
    r?.data?.image?.url ??
    r?.data?.images?.[0]?.url ??
    null
  );
}

function getGenerationMode(promptId: string) {
  return IMAGE_STYLE_PROMPT_IDS.has(promptId) ? "base" : "video-effect";
}

// 서비스2: 수채화풍 일러스트
function buildWatercolorInput(imageUrl: string, prompt: string): Record<string, unknown> {
  return { prompt, image_urls: [imageUrl], seed: 831391799 };
}

// 서비스3: 웹툰풍 (동일 모델, 다른 seed)
function buildWebtoonInput(imageUrl: string, prompt: string): Record<string, unknown> {
  return { prompt, image_urls: [imageUrl], seed: 1321871221 };
}

// 서비스4: 배경이미지 변경
function buildBgChangeInput(imageUrl: string, bgImageUrl: string | null, prompt: string): Record<string, unknown> {
  return {
    prompt,
    image_urls: bgImageUrl ? [imageUrl, bgImageUrl] : [imageUrl],
    resolution: "2K",
    seed: 6222409,
    output_format: "png",
    aspect_ratio: "9:16",
  };
}

// 서비스1: 영상효과
function buildVideoInput(imageUrl: string, prompt: string): Record<string, unknown> {
  return { prompt, image_url: imageUrl, generate_audio: false, resolution: "720p", aspect_ratio: "9:16" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const logs: string[] = [];
  const log = (...args: unknown[]) => { const m = args.map(String).join(" "); logs.push(m); console.log(m); };
  const logErr = (...args: unknown[]) => { const m = args.map(String).join(" "); logs.push("[ERR] " + m); console.error(m); };
  const J = (body: unknown, status = 200) => json(body, status, logs);

  try {
    if (!FAL_KEY) return J({ error: "FAL_KEY가 설정되지 않았습니다." }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return J({ error: "인증이 필요합니다." }, 401);

    const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return J({ error: "인증이 필요합니다." }, 401);

    const { action, premiumVideoId, bgImageUrl } = await req.json();
    if (!premiumVideoId) return J({ error: "premiumVideoId가 필요합니다." }, 400);

    const { data: job, error: jobError } = await supabase
      .from("premium_videos")
      .select("*, invitations!inner(owner_id)")
      .eq("id", premiumVideoId)
      .single();

    if (jobError || !job) return J({ error: "작업을 찾을 수 없습니다." }, 404);
    if (job.invitations.owner_id !== user.id) return J({ error: "권한이 없습니다." }, 403);

    // ── 시작: 전 서비스 SSE 구독 방식 ──
    if (action === "start") {
      if (job.status !== "pending") return J({ status: job.status });

      const supabaseImageUrl = publicUrl("invitation-photos", job.photo_path);
      log("[start] job:", premiumVideoId, "prompt_id:", job.prompt_id);

      await supabase.from("premium_videos").update({
        status: "submitted",
        generation_mode: getGenerationMode(job.prompt_id),
        updated_at: new Date().toISOString(),
      }).eq("id", premiumVideoId);

      try {
        log("[start] uploading image...");
        const imageUrl = await falUploadImage(supabaseImageUrl);
        log("[start] fal CDN url:", imageUrl);

        let model: string;
        let input: Record<string, unknown>;
        let timeoutMs: number;

        if (job.prompt_id === "watercolor-illustration") {
          model = SEEDREAM_MODEL;
          input = buildWatercolorInput(imageUrl, job.prompt_text);
          timeoutMs = 90_000;
        } else if (job.prompt_id === "webtoon") {
          model = SEEDREAM_MODEL;
          input = buildWebtoonInput(imageUrl, job.prompt_text);
          timeoutMs = 90_000;
        } else if (job.prompt_id === "bg-change") {
          model = NANO_BANANA_MODEL;
          const uploadedBgUrl = bgImageUrl ? await falUploadImage(bgImageUrl) : null;
          if (uploadedBgUrl) log("[start] bg sample image uploaded:", uploadedBgUrl);
          input = buildBgChangeInput(imageUrl, uploadedBgUrl, job.prompt_text);
          timeoutMs = 90_000;
        } else {
          // video-effect
          model = VIDEO_MODEL;
          input = buildVideoInput(imageUrl, job.prompt_text);
          timeoutMs = 150_000;
        }

        let outputUrl = await falSubscribeAndWait(model, input, log, timeoutMs);
        log("[start] generation done:", outputUrl);

        // 영상효과 + 배경음악: mux 구독
        if (!IMAGE_STYLE_PROMPT_IDS.has(job.prompt_id) && job.bgm_track_id) {
          try {
            const { data: bgm } = await supabase
              .from("bgm_tracks").select("storage_path").eq("id", job.bgm_track_id).single();
            const audioUrl = publicUrl("bgm-tracks", bgm.storage_path);
            log("[start] muxing BGM...");
            const muxedUrl = await falSubscribeAndWait(
              MUX_MODEL,
              { video_url: outputUrl, audio_url: audioUrl },
              log,
              30_000,
            );
            outputUrl = muxedUrl;
            log("[start] mux done:", muxedUrl);
          } catch (muxErr) {
            log("[start] mux failed (BGM 없이 완료):", String(muxErr));
          }
        }

        await supabase.from("premium_videos").update({
          status: "done",
          video_url: outputUrl,
          bgm_applied: !!(job.bgm_track_id),
          updated_at: new Date().toISOString(),
        }).eq("id", premiumVideoId);

        return J({ status: "done", video_url: outputUrl });
      } catch (err) {
        const isRejection = err instanceof FalRejectionError;
        logErr("[start] failed:", String(err));
        await supabase.from("premium_videos").update({
          status: "failed",
          error: String(err),
          updated_at: new Date().toISOString(),
        }).eq("id", premiumVideoId);
        return J({ status: "failed", error: String(err), rejected: isRejection });
      }
    }

    // ── 취소 ──
    if (action === "cancel") {
      if (["done", "failed"].includes(job.status)) return J({ status: job.status });
      log("[cancel] job:", premiumVideoId);
      if (job.video_status_url) await falCancel(job.video_status_url);
      await supabase.from("premium_videos").update({
        status: "failed",
        error: "사용자가 작업을 중지했습니다.",
        updated_at: new Date().toISOString(),
      }).eq("id", premiumVideoId);
      return J({ status: "failed" });
    }

    // ── 폴링 (페이지 재접속 복구용) ──
    if (action === "poll") {
      log("[poll] job:", premiumVideoId, "status:", job.status);
      return J({ status: job.status, video_url: job.video_url, bgm_applied: job.bgm_applied });
    }

    return J({ error: "알 수 없는 action입니다." }, 400);
  } catch (err) {
    console.error(err);
    return J({ error: String(err) }, 500);
  }
});
