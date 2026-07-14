"use client";

import { useState, useRef, useEffect } from "react";
import { submitInpaint, pollInpaint } from "./actions";

const POLL_INTERVAL_MS = 4000;
const ESTIMATE_SEC = 40;

function formatMmSs(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

type SlotKey = "init_image" | "mask_image";

const SLOTS: { key: SlotKey; label: string; desc: string; badge?: string }[] = [
  {
    key: "init_image",
    label: "원본 이미지",
    desc: "신랑/신부가 있는 원본 사진",
  },
  {
    key: "mask_image",
    label: "마스크 이미지",
    desc: "배경=흰색(교체), 인물=검정(유지)",
    badge: "배경 흰색 / 인물 검정",
  },
];

export function InpaintClient() {
  const [previews, setPreviews] = useState<Partial<Record<SlotKey, string>>>({});
  const [result,   setResult]   = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [phase,    setPhase]    = useState<"idle" | "uploading" | "processing">("idle");
  const [elapsed,  setElapsed]  = useState(0);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formRef.current) return;

    stopPolling();
    setResult(null);
    setError(null);
    setPhase("uploading");

    const formData = new FormData(formRef.current);
    const res = await submitInpaint(formData);

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
  const allReady = Object.keys(previews).length === 2;
  const progress = Math.min(100, Math.round((elapsed / ESTIMATE_SEC) * 100));

  return (
    <form ref={formRef} onSubmit={handleSubmit}>

      {/* 마스크 안내 */}
      <div style={{
        padding: "12px 16px", borderRadius: 8,
        background: "var(--bg-soft)", border: "1px solid var(--line)",
        fontSize: 12, color: "var(--ink-soft)", marginBottom: 20, lineHeight: 1.7,
      }}>
        <strong style={{ color: "var(--ink)" }}>마스크 이미지 만드는 방법</strong><br />
        원본 이미지를 포토샵/Photopea에서 열고 → 인물 영역을 선택 후 검정(#000000)으로 채움 → 나머지 배경은 흰색(#ffffff) → PNG로 저장
      </div>

      {/* 이미지 슬롯 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        {SLOTS.map(({ key, label, desc, badge }) => (
          <div key={key}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", marginBottom: 2 }}>
              {label} <span style={{ color: "#dc2626" }}>*</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: badge ? 4 : 8 }}>{desc}</div>
            {badge && (
              <div style={{ display: "inline-block", fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "var(--line)", color: "var(--ink-soft)", marginBottom: 8 }}>
                {badge}
              </div>
            )}
            <label
              htmlFor={key}
              style={{
                display: "block", width: "100%", aspectRatio: "3/4",
                border: "2px dashed var(--line)", borderRadius: 8,
                overflow: "hidden", cursor: loading ? "default" : "pointer",
                background: key === "mask_image" ? "#111" : "var(--bg-soft)",
                position: "relative",
              }}
            >
              {previews[key] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previews[key]} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: key === "mask_image" ? "#666" : "var(--ink-faint)", fontSize: 12 }}>
                  <span style={{ fontSize: 28 }}>+</span>
                  <span>이미지 선택</span>
                </div>
              )}
            </label>
            <input
              id={key} name={key} type="file" accept="image/*"
              disabled={loading} style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setPreviews((p) => ({ ...p, [key]: URL.createObjectURL(f) }));
              }}
            />
            {previews[key] && !loading && (
              <button type="button" className="admin-btn admin-btn--ghost" style={{ fontSize: 11, marginTop: 8, width: "100%" }}
                onClick={() => {
                  setPreviews((p) => { const n = { ...p }; delete n[key]; return n; });
                  const el = document.getElementById(key) as HTMLInputElement;
                  if (el) el.value = "";
                }}>
                초기화
              </button>
            )}
          </div>
        ))}
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

      <div className="admin-form-group" style={{ marginBottom: 24 }}>
        <label className="admin-label">네거티브 프롬프트</label>
        <textarea
          name="negative_prompt" rows={2} disabled={loading}
          defaultValue="lowres, bad anatomy, watermark, text, blur, overexposed"
          style={{ width: "100%", boxSizing: "border-box", resize: "vertical" }}
        />
      </div>

      {/* 고급 설정 */}
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
            <label className="admin-label">Strength (0–1)</label>
            <input name="strength" type="number" min="0" max="1" step="0.05" defaultValue="0.8" disabled={loading}
              style={{ width: "100%", boxSizing: "border-box" }} />
            <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 4 }}>높을수록 배경 변화 강함</div>
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

      <button
        type="submit"
        className="admin-btn"
        disabled={loading || !allReady}
        style={{ minWidth: 160, marginBottom: 24 }}
      >
        {loading ? "처리 중…" : "Inpainting 실행"}
      </button>

      {/* 진행 상태 */}
      {loading && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 8 }}>
            {phase === "uploading" ? "이미지 업로드 중…" : `배경 생성 중… ${formatMmSs(elapsed)}`}
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
            <img src={result} alt="Inpainting 결과" style={{ maxWidth: 400, borderRadius: 8, border: "1px solid var(--line)", display: "block" }} />
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
