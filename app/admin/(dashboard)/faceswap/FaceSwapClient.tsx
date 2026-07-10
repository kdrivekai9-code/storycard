"use client";

import { useState, useRef, useEffect } from "react";
import { submitFaceSwap, pollFaceSwap } from "./actions";

const POLL_INTERVAL_MS = 4000;
const ESTIMATE_SEC = 30;

type SlotKey = "init_image" | "target_image" | "reference_image";

const SLOTS: { key: SlotKey; label: string; desc: string }[] = [
  { key: "init_image",      label: "Init Image",      desc: "얼굴이 교체될 원본 이미지" },
  { key: "target_image",    label: "Target Image",    desc: "새로 합성할 얼굴이 담긴 이미지" },
  { key: "reference_image", label: "Reference Image", desc: "Init Image에서 교체할 특정 얼굴 기준 이미지" },
];

function formatMmSs(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function FaceSwapClient() {
  const [previews, setPreviews] = useState<Partial<Record<SlotKey, string>>>({});
  const [result, setResult]     = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [phase, setPhase]       = useState<"idle" | "uploading" | "processing">("idle");
  const [elapsed, setElapsed]   = useState(0);

  const formRef    = useRef<HTMLFormElement>(null);
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchUrlRef = useRef<string>("");

  // 경과 시간 타이머
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
      const res = await pollFaceSwap(fetchUrlRef.current);
      if (res.status === "success") {
        stopPolling();
        setPhase("idle");
        setResult(res.outputUrl);
      } else if (res.status === "error") {
        stopPolling();
        setPhase("idle");
        setError(res.error);
      }
      // processing → 계속 폴링
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
    const res = await submitFaceSwap(formData);

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

    // processing — 폴링 시작
    setPhase("processing");
    startPolling(res.fetchUrl);
  }

  const loading = phase !== "idle";
  const progress = Math.min(100, Math.round((elapsed / ESTIMATE_SEC) * 100));

  return (
    <form ref={formRef} onSubmit={handleSubmit}>
      {/* 이미지 슬롯 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBottom: 24 }}>
        {SLOTS.map(({ key, label, desc }) => (
          <div key={key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{label}</div>
            <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 4 }}>{desc}</div>

            <label
              htmlFor={key}
              style={{
                display: "block",
                width: "100%",
                aspectRatio: "3/4",
                border: "2px dashed var(--line)",
                borderRadius: 8,
                overflow: "hidden",
                cursor: loading ? "default" : "pointer",
                background: "var(--bg-soft)",
                position: "relative",
              }}
            >
              {previews[key] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previews[key]} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "var(--ink-faint)", fontSize: 12 }}>
                  <span style={{ fontSize: 28 }}>+</span>
                  <span>이미지 선택</span>
                </div>
              )}
            </label>

            <input
              id={key}
              name={key}
              type="file"
              accept="image/*"
              disabled={loading}
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setPreviews((p) => ({ ...p, [key]: URL.createObjectURL(file) }));
              }}
            />

            {previews[key] && !loading && (
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                style={{ fontSize: 11 }}
                onClick={() => {
                  setPreviews((p) => { const n = { ...p }; delete n[key]; return n; });
                  const input = document.getElementById(key) as HTMLInputElement;
                  if (input) input.value = "";
                }}
              >
                초기화
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        type="submit"
        className="admin-btn"
        disabled={loading || Object.keys(previews).length < 3}
        style={{ minWidth: 160, marginBottom: 24 }}
      >
        {loading ? "처리 중…" : "Face Swap 실행"}
      </button>

      {/* 진행 상태 */}
      {loading && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 8 }}>
            {phase === "uploading" ? "이미지 업로드 중…" : `처리 중… ${formatMmSs(elapsed)}`}
          </div>
          <div style={{ height: 6, background: "var(--line)", borderRadius: 4, overflow: "hidden", maxWidth: 400 }}>
            <div
              style={{
                height: "100%",
                width: `${phase === "uploading" ? 10 : progress}%`,
                background: "var(--accent)",
                borderRadius: 4,
                transition: "width 1s linear",
              }}
            />
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
            <img src={result} alt="Face Swap 결과" style={{ maxWidth: 360, borderRadius: 8, border: "1px solid var(--line)", display: "block" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <a href={result} target="_blank" rel="noreferrer" className="admin-btn" style={{ fontSize: 12 }}>원본 URL 열기</a>
              <button type="button" className="admin-btn admin-btn--ghost" style={{ fontSize: 12 }} onClick={() => navigator.clipboard.writeText(result)}>URL 복사</button>
            </div>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: "var(--ink-faint)", fontFamily: "monospace", wordBreak: "break-all" }}>{result}</div>
        </div>
      )}
    </form>
  );
}
