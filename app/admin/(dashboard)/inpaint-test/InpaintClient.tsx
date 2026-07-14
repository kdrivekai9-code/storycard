"use client";

import { useState, useRef, useEffect } from "react";
import { generateMask, submitInpaintFull, pollInpaint } from "./actions";

const POLL_INTERVAL_MS = 4000;
const ESTIMATE_SEC = 40;

function formatMmSs(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function bgRemovedToMask(imageUrl: string): Promise<{ blob: Blob; previewUrl: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        const alpha = d[i + 3];
        if (alpha < 128) {
          // 배경 → 흰색 (교체 대상)
          d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = 255;
        } else {
          // 인물 → 검정 (유지)
          d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 255;
        }
      }
      ctx.putImageData(imageData, 0, 0);

      const previewUrl = canvas.toDataURL("image/png");
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error("Canvas toBlob 실패")); return; }
        resolve({ blob, previewUrl });
      }, "image/png");
    };
    img.onerror = () => reject(new Error("이미지 로드 실패"));
    img.src = imageUrl;
  });
}

export function InpaintClient() {
  const [step, setStep]               = useState<1 | 2>(1);
  const [initPreview, setInitPreview] = useState<string | null>(null);
  const [maskPreview, setMaskPreview] = useState<string | null>(null);
  const [maskBlob,    setMaskBlob]    = useState<Blob | null>(null);
  const [initUrl,     setInitUrl]     = useState<string>("");
  const [result,      setResult]      = useState<string | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [statusMsg,   setStatusMsg]   = useState<string>("");
  const [phase, setPhase] = useState<"idle" | "generating" | "uploading" | "processing">("idle");
  const [elapsed, setElapsed] = useState(0);

  const fileRef     = useRef<File | null>(null);
  const formRef     = useRef<HTMLFormElement>(null);
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchUrlRef = useRef<string>("");

  useEffect(() => {
    if (phase === "uploading" || phase === "processing") {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  function stopPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }

  function startPolling(fetchUrl: string) {
    fetchUrlRef.current = fetchUrl;
    stopPolling();
    pollRef.current = setInterval(async () => {
      const res = await pollInpaint(fetchUrlRef.current);
      if (res.status === "success") {
        stopPolling();
        setPhase("idle");
        setResult(res.outputUrl);
      } else if (res.status === "error") {
        stopPolling();
        setPhase("idle");
        setError(res.error);
      }
    }, POLL_INTERVAL_MS);
  }

  async function handleGenerateMask() {
    if (!fileRef.current) return;
    setError(null);
    setPhase("generating");
    setStatusMsg("원본 업로드 중…");

    const formData = new FormData();
    formData.append("init_image", fileRef.current);

    setStatusMsg("배경 제거 중… (최대 30초)");
    const res = await generateMask(formData);

    if (!res.ok) {
      setPhase("idle");
      setError(res.error);
      return;
    }

    setInitUrl(res.initUrl);
    setStatusMsg("마스크 변환 중…");

    try {
      const { blob, previewUrl } = await bgRemovedToMask(res.bgRemovedUrl);
      setMaskBlob(blob);
      setMaskPreview(previewUrl);
      setPhase("idle");
      setStep(2);
    } catch (err) {
      setPhase("idle");
      setError("마스크 변환 실패: " + String(err));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formRef.current || !maskBlob || !initUrl) return;

    stopPolling();
    setResult(null);
    setError(null);
    setPhase("uploading");
    setStatusMsg("마스크 업로드 중…");

    const formData = new FormData(formRef.current);
    formData.append("init_url", initUrl);
    formData.append("mask_image", new File([maskBlob], "mask.png", { type: "image/png" }));

    const res = await submitInpaintFull(formData);

    if (!res.ok) {
      setPhase("idle");
      setError(res.error);
      return;
    }

    if (res.status === "success") {
      setPhase("idle");
      setResult(res.outputUrl);
      return;
    }

    setPhase("processing");
    setStatusMsg("배경 생성 중…");
    startPolling(res.fetchUrl);
  }

  function reset() {
    stopPolling();
    setStep(1);
    setInitPreview(null);
    setMaskPreview(null);
    setMaskBlob(null);
    setInitUrl("");
    setResult(null);
    setError(null);
    setPhase("idle");
    fileRef.current = null;
    if (formRef.current) formRef.current.reset();
  }

  const loading  = phase !== "idle";
  const progress = Math.min(100, Math.round((elapsed / ESTIMATE_SEC) * 100));

  return (
    <div>
      {/* ── STEP 1: 원본 이미지 업로드 & 마스크 자동 생성 ── */}
      {step === 1 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", marginBottom: 12 }}>
            STEP 1 — 원본 이미지 업로드
          </div>

          <label
            htmlFor="init_image_picker"
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              width: "100%", maxWidth: 360, aspectRatio: "3/4",
              border: "2px dashed var(--line)", borderRadius: 8,
              overflow: "hidden", cursor: loading ? "default" : "pointer",
              background: "var(--bg-soft)", position: "relative", marginBottom: 16,
            }}
          >
            {initPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={initPreview} alt="원본" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: "var(--ink-faint)", fontSize: 13 }}>
                <span style={{ fontSize: 36 }}>+</span>
                <span>신랑/신부 사진 선택</span>
              </div>
            )}
          </label>
          <input
            id="init_image_picker" type="file" accept="image/*"
            disabled={loading} style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              fileRef.current = f;
              setInitPreview(URL.createObjectURL(f));
              setError(null);
            }}
          />

          {initPreview && !loading && (
            <button type="button" className="admin-btn admin-btn--ghost" style={{ fontSize: 11, marginBottom: 16 }}
              onClick={() => { setInitPreview(null); fileRef.current = null; }}>
              초기화
            </button>
          )}

          <div>
            <button
              type="button"
              className="admin-btn"
              disabled={loading || !initPreview}
              style={{ minWidth: 200 }}
              onClick={handleGenerateMask}
            >
              {loading ? statusMsg || "처리 중…" : "마스크 자동 생성"}
            </button>
          </div>

          {loading && (
            <div style={{ marginTop: 16, fontSize: 13, color: "var(--ink-soft)" }}>
              {statusMsg}
            </div>
          )}
        </div>
      )}

      {/* ── STEP 2: 마스크 확인 + 프롬프트 입력 + 실행 ── */}
      {step === 2 && (
        <form ref={formRef} onSubmit={handleSubmit}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", marginBottom: 12 }}>
            STEP 2 — 마스크 확인 후 배경 프롬프트 입력
          </div>

          {/* 원본 + 마스크 미리보기 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>원본 이미지</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={initPreview!} alt="원본" style={{ width: "100%", borderRadius: 8, border: "1px solid var(--line)", display: "block" }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
                자동 생성 마스크
                <span style={{ marginLeft: 8, fontSize: 11, padding: "1px 6px", borderRadius: 4, background: "var(--line)" }}>
                  검정=유지 / 흰색=교체
                </span>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={maskPreview!} alt="마스크" style={{ width: "100%", borderRadius: 8, border: "1px solid var(--line)", display: "block" }} />
            </div>
          </div>

          {/* 프롬프트 */}
          <div className="admin-form-group" style={{ marginBottom: 16 }}>
            <label className="admin-label">
              배경 프롬프트 <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <textarea
              name="prompt" rows={3} disabled={loading} required
              placeholder="beautiful european garden, lush greenery, flowers, soft sunlight, bokeh background, photorealistic"
              style={{ width: "100%", boxSizing: "border-box", resize: "vertical" }}
            />
          </div>

          <div className="admin-form-group" style={{ marginBottom: 20 }}>
            <label className="admin-label">네거티브 프롬프트</label>
            <textarea
              name="negative_prompt" rows={2} disabled={loading}
              defaultValue="lowres, watermark, text, blur, overexposed, artifacts"
              style={{ width: "100%", boxSizing: "border-box", resize: "vertical" }}
            />
          </div>

          {/* 고급 설정 */}
          <details style={{ marginBottom: 20, border: "1px solid var(--line)", borderRadius: 8, padding: "12px 16px" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>
              모델 설정 (고급)
            </summary>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
              <div className="admin-form-group">
                <label className="admin-label">Model ID</label>
                <input name="model_id" type="text" defaultValue="realistic-vision-v51" disabled={loading}
                  style={{ width: "100%", boxSizing: "border-box" }} />
              </div>
              <div className="admin-form-group">
                <label className="admin-label">Strength (배경 변화)</label>
                <input name="strength" type="number" min="0" max="1" step="0.05" defaultValue="0.8" disabled={loading}
                  style={{ width: "100%", boxSizing: "border-box" }} />
              </div>
              <div className="admin-form-group">
                <label className="admin-label">Width</label>
                <input name="width" type="number" defaultValue="512" disabled={loading}
                  style={{ width: "100%", boxSizing: "border-box" }} />
              </div>
              <div className="admin-form-group">
                <label className="admin-label">Height</label>
                <input name="height" type="number" defaultValue="768" disabled={loading}
                  style={{ width: "100%", boxSizing: "border-box" }} />
              </div>
              <div className="admin-form-group">
                <label className="admin-label">Guidance Scale</label>
                <input name="guidance_scale" type="number" min="1" max="20" step="0.5" defaultValue="7.5" disabled={loading}
                  style={{ width: "100%", boxSizing: "border-box" }} />
              </div>
              <div className="admin-form-group">
                <label className="admin-label">Inference Steps</label>
                <input name="num_inference_steps" type="number" min="10" max="50" defaultValue="31" disabled={loading}
                  style={{ width: "100%", boxSizing: "border-box" }} />
              </div>
            </div>
          </details>

          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 24 }}>
            <button type="submit" className="admin-btn" disabled={loading} style={{ minWidth: 160 }}>
              {loading ? "처리 중…" : "Inpainting 실행"}
            </button>
            <button type="button" className="admin-btn admin-btn--ghost" disabled={loading} onClick={reset}>
              처음부터
            </button>
          </div>

          {/* 진행 상태 */}
          {loading && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 8 }}>
                {phase === "uploading" ? statusMsg : `배경 생성 중… ${formatMmSs(elapsed)}`}
              </div>
              <div style={{ height: 6, background: "var(--line)", borderRadius: 4, overflow: "hidden", maxWidth: 400 }}>
                <div style={{
                  height: "100%",
                  width: `${phase === "uploading" ? 5 : progress}%`,
                  background: "var(--accent)",
                  borderRadius: 4,
                  transition: "width 1s linear",
                }} />
              </div>
            </div>
          )}
        </form>
      )}

      {/* 오류 */}
      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", fontSize: 13, marginTop: 16, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          {error}
        </div>
      )}

      {/* 결과 */}
      {result && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", marginBottom: 10 }}>결과 이미지</div>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={result} alt="Inpainting 결과" style={{ maxWidth: 400, borderRadius: 8, border: "1px solid var(--line)", display: "block" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <a href={result} target="_blank" rel="noreferrer" className="admin-btn" style={{ fontSize: 12 }}>원본 URL 열기</a>
              <button type="button" className="admin-btn admin-btn--ghost" style={{ fontSize: 12 }}
                onClick={() => navigator.clipboard.writeText(result)}>URL 복사</button>
              <button type="button" className="admin-btn admin-btn--ghost" style={{ fontSize: 12 }} onClick={reset}>
                다시 시도
              </button>
            </div>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: "var(--ink-faint)", fontFamily: "monospace", wordBreak: "break-all" }}>{result}</div>
        </div>
      )}
    </div>
  );
}
