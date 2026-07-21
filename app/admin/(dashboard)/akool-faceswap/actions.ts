"use server";

import { requireAdmin } from "@/lib/admin/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "invitation-photos";
const PREFIX  = "akool-faceswap";

const AKOOL_SUBMIT_URL = "https://openapi.akool.com/api/open/v4/faceswap/faceswapPlusByImage";
const AKOOL_POLL_URL   = "https://openapi.akool.com/api/open/v3/faceswap/result/listbyids";

// ── Storage ──────────────────────────────────────────────────────────────────

async function uploadToStorage(file: File, name: string): Promise<string> {
  const admin = createAdminClient();
  const ext  = file.name.split(".").pop() || "jpg";
  const path = `${PREFIX}/${Date.now()}-${name}.${ext}`;
  const { error } = await admin.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: true,
  });
  if (error) throw new Error(`스토리지 업로드 실패(${name}): ${error.message}`);
  return admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// ── Akool API ─────────────────────────────────────────────────────────────────

function akoolHeaders(): HeadersInit {
  const key = process.env.AKOOL_API_KEY;
  if (!key) throw new Error("AKOOL_API_KEY 환경변수가 설정되지 않았습니다.");
  return { "Content-Type": "application/json", "x-api-key": key };
}

export type ModelStyle = "realistic" | "beautify" | "lossless";

export async function submitAkoolFaceSwap(formData: FormData): Promise<
  | { ok: true; jobId: string }
  | { ok: false; error: string }
> {
  await requireAdmin();

  const sourceFile = formData.get("source_image") as File | null;
  const targetFile = formData.get("target_image") as File | null;
  const modelStyle = (formData.get("model_style") as ModelStyle | null) ?? "realistic";
  const faceEnhance = formData.get("face_enhance") === "1";

  if (!sourceFile || sourceFile.size === 0) return { ok: false, error: "소스 이미지를 선택해주세요." };
  if (!targetFile || targetFile.size === 0) return { ok: false, error: "타겟 이미지를 선택해주세요." };

  try {
    const [sourceUrl, targetUrl] = await Promise.all([
      uploadToStorage(sourceFile, "source"),
      uploadToStorage(targetFile, "target"),
    ]);

    const body = {
      source_url: sourceUrl,
      target_url: targetUrl,
      single_face_mode: true,
      face_enhance: faceEnhance,
      model_style: modelStyle,
    };

    let res: Response;
    try {
      res = await fetch(AKOOL_SUBMIT_URL, {
        method: "POST",
        headers: akoolHeaders(),
        body: JSON.stringify(body),
      });
    } catch (e) {
      return { ok: false, error: `Akool 네트워크 오류: ${e instanceof Error ? e.message : String(e)}` };
    }

    const json = await res.json().catch(() => ({})) as Record<string, unknown>;

    if (json.code !== 1000) {
      return { ok: false, error: `Akool 오류(${json.code}): ${json.msg ?? JSON.stringify(json)}` };
    }

    const jobId = (json.data as Record<string, unknown>)?._id as string | undefined;
    if (!jobId) return { ok: false, error: `_id 누락 — 응답: ${JSON.stringify(json)}` };

    return { ok: true, jobId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Long-poll ────────────────────────────────────────────────────────────────
// 서버가 최대 BUDGET_MS 동안 내부적으로 반복 확인하다 완료되면 즉시 반환한다.

const BUDGET_MS   = 50_000; // Vercel Pro 타임아웃 60s 기준, 여유 10s 확보
const INTERVAL_MS = 4_000;

export async function pollAkoolFaceSwap(jobId: string): Promise<
  | { status: "success"; resultUrl: string }
  | { status: "processing" }
  | { status: "error"; error: string }
> {
  await requireAdmin();

  const deadline = Date.now() + BUDGET_MS;

  while (true) {
    let res: Response;
    try {
      res = await fetch(`${AKOOL_POLL_URL}?_ids=${encodeURIComponent(jobId)}`, {
        headers: akoolHeaders(),
        cache: "no-store",
      });
    } catch (e) {
      return { status: "error", error: `폴링 네트워크 오류: ${e instanceof Error ? e.message : String(e)}` };
    }

    const json = await res.json().catch(() => ({})) as Record<string, unknown>;

    if (json.code !== 1000) {
      return { status: "error", error: `Akool 폴링 오류(${json.code}): ${json.msg ?? JSON.stringify(json)}` };
    }

    const results = ((json.data as Record<string, unknown>)?.result as unknown[]) ?? [];
    const item = results[0] as Record<string, unknown> | undefined;

    if (!item) return { status: "processing" };

    const faceswapStatus = item.faceswap_status as number;

    if (faceswapStatus === 3) {
      const url = item.url as string | undefined;
      if (!url) return { status: "error", error: "결과 URL이 없습니다." };
      return { status: "success", resultUrl: url };
    }

    if (faceswapStatus === 4) {
      return { status: "error", error: "Akool 처리 실패 (status=4)" };
    }

    // status 1(대기) or 2(처리 중)
    if (Date.now() + INTERVAL_MS >= deadline) {
      return { status: "processing" };
    }

    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}
