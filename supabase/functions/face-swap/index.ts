import { createClient } from "jsr:@supabase/supabase-js@2";

const MODELSLAB_API_URL = "https://modelslab.com/api/v6/faceswap/single_face_swap";

const MODELSLAB_KEY    = Deno.env.get("MODELSLAB_API_KEY") ?? "";
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function J(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  if (!MODELSLAB_KEY) return J({ error: "MODELSLAB_API_KEY 시크릿이 설정되지 않았습니다." }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return J({ error: "인증이 필요합니다." }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) return J({ error: "인증이 필요합니다." }, 401);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return J({ error: "어드민 권한이 필요합니다." }, 403);

  const body = await req.json();
  const { action } = body;

  // ── 제출 ──────────────────────────────────────────────────────────────────
  if (action === "submit") {
    const { init_image, target_image, reference_image } = body;

    if (!init_image || !target_image || !reference_image) {
      return J({ error: "이미지 3장이 모두 필요합니다." }, 400);
    }

    const res = await fetch(MODELSLAB_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: MODELSLAB_KEY,
        init_image,
        target_image,
        reference_image,
        watermark: false,
        base64: false,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return J({ error: `ModelsLab API 오류 (${res.status}): ${text}` }, 502);
    }

    const json = await res.json();

    if (json.status === "error") return J({ error: json.message ?? "API 오류" }, 502);

    // 즉시 완료
    if (json.status === "success") {
      return J({ status: "success", outputUrl: json.output?.[0] ?? json.proxy_links?.[0] });
    }

    // 큐 대기 중 — fetch_result URL 반환
    return J({
      status: "processing",
      fetchUrl: json.fetch_result,
      eta: json.eta ?? 5,
    });
  }

  // ── 폴링 ──────────────────────────────────────────────────────────────────
  if (action === "poll") {
    const { fetchUrl } = body;
    if (!fetchUrl) return J({ error: "fetchUrl이 필요합니다." }, 400);

    const res = await fetch(fetchUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: MODELSLAB_KEY }),
    });

    if (!res.ok) return J({ status: "processing" });

    const json = await res.json();

    if (json.status === "error") return J({ error: json.message ?? "처리 실패" }, 502);

    if (json.status === "success") {
      return J({ status: "success", outputUrl: json.output?.[0] ?? json.proxy_links?.[0] });
    }

    return J({ status: "processing", eta: json.eta ?? 3 });
  }

  return J({ error: "알 수 없는 action입니다." }, 400);
});
