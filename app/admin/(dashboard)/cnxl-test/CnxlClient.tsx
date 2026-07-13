"use client";

import { useState, useRef, useEffect } from "react";
import { submitCnxl, pollCnxl } from "./actions";

const POLL_INTERVAL_MS = 4000;
const ESTIMATE_SEC = 60;

function formatMmSs(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const IP_ADAPTER_OPTIONS = [
  { value: "ip-adapter-plus-face_sd15", label: "IP-Adapter Plus Face (SD1.5)" },
  { value: "ip-adapter_sd15",           label: "IP-Adapter (SD1.5)" },
  { value: "ip-adapter_sdxl",           label: "IP-Adapter (SDXL)" },
  { value: "ip-adapter-plus-face_sdxl", label: "IP-Adapter Plus Face (SDXL)" },
];

export function CnxlClient() {
  const [controlnetPreview, setControlnetPreview] = useState<string | null>(null);
  const [ipAdapterPreview,  setIpAdapterPreview]  = useState<string | null>(null);
  const [result,  setResult]  = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [phase,   setPhase]   = useState<"idle" | "uploading" | "processing">("idle");
  const [elapsed, setElapsed] = useState(0);

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
      const res = await pollCnxl(fetchUrlRef.current);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formRef.current) return;

    stopPolling();
    setResult(null);
    setError(null);
    setPhase("uploading");

    const formData = new FormData(formRef.current);
    const res = await submitCnxl(formData);

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
    startPolling(res.fetchUrl);
  }

  const loading  = phase !== "idle";
  const progress = Math.min(100, Math.round((elapsed / ESTIMATE_SEC) * 100));

  return (
    <form ref={formRef} onSubmit={handleSubmit}>

      {/* 이미지 업로드 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        {/* ControlNet 이미지 */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>
            ControlNet 이미지 <span style={{ color: "#dc2626" }}>*</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 8 }}>얼굴 포즈/구조 가이드 이미지</div>
          <label
            htmlFor="controlnet_image"
            style={{
              display: "block", width: "100%", aspectRatio: "3/4",
              border: "2px dashed var(--line)", borderRadius: 8,
              overflow: "hidden", cursor: loading ? "default" : "pointer",
              background: "var(--bg-soft)", position: "relative",
            }}
          >
            {controlnetPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={controlnetPreview} alt="controlnet" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "var(--ink-faint)", fontSize: 12 }}>
                <span style={{ fontSize: 28 }}>+</span>
                <span>이미지 선택</span>
              </div>
            )}
          </label>
          <input
            id="controlnet_image" name="controlnet_image" type="file" accept="image/*"
            disabled={loading} style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setControlnetPreview(URL.createObjectURL(f));
            }}
          />
          {controlnetPreview && !loading && (
            <button type="button" className="admin-btn admin-btn--ghost" style={{ fontSize: 11, marginTop: 8, width: "100%" }}
              onClick={() => { setControlnetPreview(null); const el = document.getElementById("controlnet_image") as HTMLInputElement; if (el) el.value = ""; }}>
              초기화
            </button>
          )}
        </div>

        {/* IP-Adapter 이미지 (선택) */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>
            IP-Adapter 이미지 <span style={{ color: "var(--ink-soft)", fontWeight: 400 }}>(선택)</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 8 }}>비워두면 ControlNet 이미지로 대체</div>
          <label
            htmlFor="ip_adapter_image"
            style={{
              display: "block", width: "100%", aspectRatio: "3/4",
              border: "2px dashed var(--line)", borderRadius: 8,
              overflow: "hidden", cursor: loading ? "default" : "pointer",
              background: "var(--bg-soft)", position: "relative",
            }}
          >
            {ipAdapterPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ipAdapterPreview} alt="ip-adapter" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "var(--ink-faint)", fontSize: 12 }}>
                <span style={{ fontSize: 28 }}>+</span>
                <span>이미지 선택</span>
              </div>
            )}
          </label>
          <input
            id="ip_adapter_image" name="ip_adapter_image" type="file" accept="image/*"
            disabled={loading} style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setIpAdapterPreview(URL.createObjectURL(f));
            }}
          />
          {ipAdapterPreview && !loading && (
            <button type="button" className="admin-btn admin-btn--ghost" style={{ fontSize: 11, marginTop: 8, width: "100%" }}
              onClick={() => { setIpAdapterPreview(null); const el = document.getElementById("ip_adapter_image") as HTMLInputElement; if (el) el.value = ""; }}>
              초기화
            </button>
          )}
        </div>
      </div>

      {/* 프롬프트 */}
      <div className="admin-form-group" style={{ marginBottom: 16 }}>
        <label className="admin-label">
          프롬프트 <span style={{ color: "#dc2626" }}>*</span>
        </label>
        <textarea
          name="prompt" rows={3} disabled={loading} required
          placeholder="a beautiful woman, photorealistic, high quality, detailed face..."
          style={{ width: "100%", boxSizing: "border-box", resize: "vertical" }}
        />
      </div>

      <div className="admin-form-group" style={{ marginBottom: 24 }}>
        <label className="admin-label">네거티브 프롬프트</label>
        <textarea
          name="negative_prompt" rows={2} disabled={loading}
          defaultValue="lowres, bad anatomy, bad hands, disfigured, ugly, blurry"
          style={{ width: "100%", boxSizing: "border-box", resize: "vertical" }}
        />
      </div>

      {/* 모델 설정 */}
      <details style={{ marginBottom: 24, border: "1px solid var(--line)", borderRadius: 8, padding: "12px 16px" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>
          모델 설정 (고급)
        </summary>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
          <div className="admin-form-group">
            <label className="admin-label">Model ID</label>
            <input name="model_id" type="text" defaultValue="realistic-vision-v51" disabled={loading}
              style={{ width: "100%", boxSizing: "border-box" }} />
          </div>
          <div className="admin-form-group">
            <label className="admin-label">ControlNet Model</label>
            <input name="controlnet_model" type="text" defaultValue="face_detector" disabled={loading}
              style={{ width: "100%", boxSizing: "border-box" }} />
          </div>
          <div className="admin-form-group">
            <label className="admin-label">IP-Adapter ID</label>
            <select name="ip_adapter_id" disabled={loading} style={{ width: "100%", boxSizing: "border-box" }}>
              {IP_ADAPTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="admin-form-group">
            <label className="admin-label">IP-Adapter Scale (0–1)</label>
            <input name="ip_adapter_scale" type="number" min="0" max="1" step="0.05" defaultValue="0.6" disabled={loading}
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
            <input name="num_inference_steps" type="number" min="10" max="50" defaultValue="21" disabled={loading}
              style={{ width: "100%", boxSizing: "border-box" }} />
          </div>
        </div>
      </details>

      <button
        type="submit"
        className="admin-btn"
        disabled={loading || !controlnetPreview}
        style={{ minWidth: 160, marginBottom: 24 }}
      >
        {loading ? "처리 중…" : "CNXL 생성 실행"}
      </button>

      {/* 진행 상태 */}
      {loading && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 8 }}>
            {phase === "uploading" ? "이미지 업로드 중…" : `생성 중… ${formatMmSs(elapsed)}`}
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

      {/* 오류 */}
      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", fontSize: 13, marginBottom: 24, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          {error}
        </div>
      )}

      {/* 결과 */}
      {result && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", marginBottom: 10 }}>결과 이미지</div>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={result} alt="CNXL 결과" style={{ maxWidth: 400, borderRadius: 8, border: "1px solid var(--line)", display: "block" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <a href={result} target="_blank" rel="noreferrer" className="admin-btn" style={{ fontSize: 12 }}>원본 URL 열기</a>
              <button type="button" className="admin-btn admin-btn--ghost" style={{ fontSize: 12 }}
                onClick={() => navigator.clipboard.writeText(result)}>URL 복사</button>
            </div>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: "var(--ink-faint)", fontFamily: "monospace", wordBreak: "break-all" }}>{result}</div>
        </div>
      )}
    </form>
  );
}
