import { createClient } from "jsr:@supabase/supabase-js@2";

const MODELSLAB_API_URL        = "https://modelslab.com/api/v6/faceswap/single_face_swap";
const MODELSLAB_CONTROLNET_URL = "https://modelslab.com/api/v5/controlnet";
const MODELSLAB_INPAINT_URL    = "https://modelslab.com/api/v6/image_editing/inpaint";
const FAL_BIREFNET_URL         = "https://fal.run/fal-ai/birefnet";

const MODELSLAB_KEY    = Deno.env.get("MODELSLAB_API_KEY") ?? "";
const FAL_KEY          = Deno.env.get("FAL_KEY") ?? "";
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

  // ── 워크플로우 제출 ────────────────────────────────────────────────────────
  if (action === "workflow-submit") {
    const { workflow_id, inputs } = body;
    if (!workflow_id) return J({ error: "workflow_id가 필요합니다." }, 400);

    const url = `https://modelslab.com/api/v1/workflows/${workflow_id}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: MODELSLAB_KEY, ...(inputs ?? {}) }),
    });

    if (!res.ok) {
      const text = await res.text();
      return J({ error: `Workflow API 오류 (${res.status}): ${text}` }, 502);
    }

    const json = await res.json();
    if (json.error) return J({ error: String(json.error) }, 502);

    // 즉시 완료
    if (json.status === "success") {
      const out = json.output?.output ?? json.output?.proxy_links;
      return J({ status: "success", outputUrl: Array.isArray(out) ? out[0] : out });
    }

    // 비동기 처리 중 — execution_id + status_url 반환
    return J({
      status: "processing",
      executionId: json.execution_id,
      workflowId: json.workflow_id ?? workflow_id,
      statusUrl: json.status_url,
    });
  }

  // ── 워크플로우 상태 폴링 ───────────────────────────────────────────────────
  if (action === "workflow-poll") {
    const { workflow_id, execution_id } = body;
    if (!workflow_id || !execution_id) return J({ error: "workflow_id, execution_id가 필요합니다." }, 400);

    const url = `https://modelslab.com/api/v1/workflows/${workflow_id}/executions/${execution_id}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${MODELSLAB_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) return J({ status: "processing" });

    const json = await res.json();
    if (json.error) return J({ error: String(json.error) }, 502);

    const execStatus = json.execution?.status ?? json.status;

    if (execStatus === "completed" || execStatus === "success") {
      const out = json.output?.output ?? json.output?.proxy_links;
      const outputUrl = Array.isArray(out) ? out[0] : out;
      return J({ status: "success", outputUrl });
    }

    if (execStatus === "failed" || execStatus === "error") {
      return J({ error: json.error ?? json.execution?.error ?? "워크플로우 처리 실패" }, 502);
    }

    return J({ status: "processing" });
  }

  // ── ControlNet XL 제출 ─────────────────────────────────────────────────────
  if (action === "cnxl-submit") {
    const {
      controlnet_image,
      ip_adapter_image,
      prompt,
      negative_prompt,
      model_id,
      controlnet_model,
      ip_adapter_id,
      ip_adapter_scale,
      width,
      height,
      guidance_scale,
      num_inference_steps,
    } = body;

    if (!controlnet_image) return J({ error: "controlnet_image가 필요합니다." }, 400);
    if (!prompt) return J({ error: "prompt가 필요합니다." }, 400);

    const payload: Record<string, unknown> = {
      key: MODELSLAB_KEY,
      model_id: model_id || "realistic-vision-v51",
      controlnet_model: controlnet_model || "face_detector",
      controlnet_type: "face",
      control_image: controlnet_image,
      ip_adapter_id: ip_adapter_id || "ip-adapter-plus-face_sd15",
      ip_adapter_image: ip_adapter_image || controlnet_image,
      ip_adapter_scale: ip_adapter_scale ?? 0.6,
      prompt,
      negative_prompt: negative_prompt || "lowres, bad anatomy, bad hands, disfigured, ugly",
      width: width || 512,
      height: height || 768,
      guidance_scale: guidance_scale ?? 7.5,
      num_inference_steps: num_inference_steps || 21,
      scheduler: "DPMSolverMultistepScheduler",
      watermark: false,
      base64: false,
    };

    const res = await fetch(MODELSLAB_CONTROLNET_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      return J({ error: `ModelsLab ControlNet API 오류 (${res.status}): ${text}` }, 502);
    }

    const json = await res.json();
    if (json.status === "error") return J({ error: json.message ?? "API 오류" }, 502);

    if (json.status === "success") {
      return J({ status: "success", outputUrl: json.output?.[0] ?? json.proxy_links?.[0] });
    }

    return J({
      status: "processing",
      fetchUrl: json.fetch_result,
      eta: json.eta ?? 30,
    });
  }

  // ── ControlNet XL 폴링 ─────────────────────────────────────────────────────
  if (action === "cnxl-poll") {
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

    return J({ status: "processing", eta: json.eta ?? 5 });
  }

  // ── 배경 제거 (fal.ai BiRefNet) ───────────────────────────────────────────
  if (action === "bg-remove") {
    if (!FAL_KEY) return J({ error: "FAL_KEY 시크릿이 설정되지 않았습니다." }, 500);

    const { image_url } = body;
    if (!image_url) return J({ error: "image_url이 필요합니다." }, 400);

    const res = await fetch(FAL_BIREFNET_URL, {
      method: "POST",
      headers: {
        "Authorization": `Key ${FAL_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ image_url }),
    });

    if (!res.ok) {
      const text = await res.text();
      return J({ error: `fal.ai 배경제거 API 오류 (${res.status}): ${text}` }, 502);
    }

    const json = await res.json();
    // fal.ai 동기 응답: { image: { url, width, height } }
    const outputUrl = json.image?.url;
    if (!outputUrl) return J({ error: "배경제거 결과 URL 없음. 응답: " + JSON.stringify(json) }, 502);

    return J({ status: "success", outputUrl });
  }

  // bg-remove-poll은 fal.ai 동기 방식이므로 사용되지 않지만 하위 호환용으로 유지
  if (action === "bg-remove-poll") {
    return J({ status: "processing" });
  }

  // ── Inpainting 제출 ────────────────────────────────────────────────────────
  if (action === "inpaint-submit") {
    const {
      init_image,
      mask_image,
      prompt,
      negative_prompt,
      model_id,
      width,
      height,
      guidance_scale,
      num_inference_steps,
      strength,
    } = body;

    if (!init_image) return J({ error: "init_image가 필요합니다." }, 400);
    if (!mask_image) return J({ error: "mask_image가 필요합니다." }, 400);
    if (!prompt)     return J({ error: "prompt가 필요합니다." }, 400);

    const payload: Record<string, unknown> = {
      key: MODELSLAB_KEY,
      model_id: model_id || "realistic-vision-v51",
      init_image,
      mask_image,
      prompt,
      negative_prompt: negative_prompt || "lowres, bad anatomy, bad hands, disfigured, ugly",
      width:                width || 512,
      height:               height || 768,
      guidance_scale:       guidance_scale ?? 7.5,
      num_inference_steps:  num_inference_steps || 31,
      strength:             strength ?? 0.8,
      scheduler: "UniPCMultistepScheduler",
      watermark: false,
      base64: false,
    };

    const res = await fetch(MODELSLAB_INPAINT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      return J({ error: `ModelsLab Inpaint API 오류 (${res.status}): ${text}` }, 502);
    }

    const json = await res.json();
    if (json.status === "error") return J({ error: json.message ?? "API 오류" }, 502);

    if (json.status === "success") {
      return J({ status: "success", outputUrl: json.output?.[0] ?? json.proxy_links?.[0] });
    }

    return J({
      status: "processing",
      fetchUrl: json.fetch_result,
      eta: json.eta ?? 20,
    });
  }

  // ── Inpainting 폴링 ────────────────────────────────────────────────────────
  if (action === "inpaint-poll") {
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

    return J({ status: "processing", eta: json.eta ?? 5 });
  }

  // ── fal.ai Juggernaut Flux Inpainting 제출 ────────────────────────────────
  if (action === "fal-inpaint-submit") {
    if (!FAL_KEY) return J({ error: "FAL_KEY 시크릿이 설정되지 않았습니다." }, 500);

    const { image_url, mask_url, prompt, negative_prompt, num_inference_steps, guidance_scale, strength, seed } = body;

    if (!image_url) return J({ error: "image_url이 필요합니다." }, 400);
    if (!mask_url)  return J({ error: "mask_url이 필요합니다." }, 400);
    if (!prompt)    return J({ error: "prompt가 필요합니다." }, 400);

    const payload: Record<string, unknown> = {
      image_url,
      mask_url,
      prompt,
      negative_prompt: negative_prompt || "",
      num_inference_steps: num_inference_steps ?? 28,
      guidance_scale: guidance_scale ?? 3.5,
      strength: strength ?? 0.85,
    };
    if (seed) payload.seed = seed;

    const res = await fetch("https://queue.fal.run/rundiffusion-fal/juggernaut-flux-lora/inpainting", {
      method: "POST",
      headers: {
        "Authorization": `Key ${FAL_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      return J({ error: `fal.ai API 오류 (${res.status}): ${text}` }, 502);
    }

    const json = await res.json();
    // fal.ai queue: { request_id, response_url, status_url, cancel_url }
    return J({
      status: "processing",
      requestId: json.request_id,
      statusUrl: json.status_url,
      responseUrl: json.response_url,
    });
  }

  // ── fal.ai 폴링 ────────────────────────────────────────────────────────────
  if (action === "fal-inpaint-poll") {
    if (!FAL_KEY) return J({ error: "FAL_KEY 시크릿이 설정되지 않았습니다." }, 500);

    const { statusUrl, responseUrl } = body;
    if (!statusUrl) return J({ error: "statusUrl이 필요합니다." }, 400);

    const res = await fetch(String(statusUrl), {
      headers: { "Authorization": `Key ${FAL_KEY}` },
    });

    if (!res.ok) return J({ status: "processing" });

    const json = await res.json();

    if (json.status === "FAILED") {
      return J({ error: json.error ?? "fal.ai 처리 실패" }, 502);
    }

    if (json.status === "COMPLETED") {
      const rUrl = responseUrl ?? json.response_url;
      const rRes = await fetch(String(rUrl), {
        headers: { "Authorization": `Key ${FAL_KEY}` },
      });
      if (!rRes.ok) return J({ error: "결과 조회 실패" }, 502);

      const result = await rRes.json();
      const outputUrl = result.images?.[0]?.url ?? result.image?.url;
      if (!outputUrl) return J({ error: "출력 URL을 찾을 수 없습니다. 응답: " + JSON.stringify(result) }, 502);

      return J({ status: "success", outputUrl });
    }

    // IN_QUEUE / IN_PROGRESS
    return J({ status: "processing" });
  }

  return J({ error: "알 수 없는 action입니다." }, 400);
});
