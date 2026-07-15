"use client";

import { useState, useRef, useEffect } from "react";
import { submitMultiFaceSwap, pollMultiFaceSwap } from "./actions";

const POLL_INTERVAL_MS = 4000;
const ESTIMATE_SEC = 40;

function formatMmSs(sec: number) {
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

type SlotKey = "init_image" | "target_image" | "target_image_2";
const SLOTS: { key: SlotKey; label: string; desc: string; required: boolean }[] = [
  {
    key: "init_image",
    label: "Init Image",
    desc: "얼굴이 교체될 기본 이미지 (여러 명이 있어도 됩니다)",
    required: true,
  },
  {
    key: "target_image",
    label: "얼굴 소스 1",
    desc: "교체할 얼굴 이미지 (필수)",
    required: true,
  },
  {
    key: "target_image_2",
    label: "얼굴 소스 2",
    desc: "2번째 얼굴 소스 — 선택사항 (2인→2인 스왑 시)",
    required: false,
  },
];

export function FaceSwapTest2Client() {
  const [previews, setPreviews] = useState<Partial<Record<SlotKey, string>>>({});
  const [enhance,  setEnhance]  = useState(true);
  const [result,   setResult]   = useState<string | null>(null);
  const [history,  setHistory]  = useState<string[]>([]);
  const [error,    setError]    = useState<string | null>(null);
  const [phase,    setPhase]    = useState<"idle" | "uploading" | "processing">("idle");
  const [elapsed,  setElapsed]  = useState(0);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const formRef    = useRef<HTMLFormElement>(null);
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchUrlRef = useRef("");

  // 경과 타이머
  useEffect(() => {
    if (phase !== "idle") {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  // ESC 라이트박스 닫기
  useEffect(() => {
    if (!lightbox) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setLightbox(null); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [lightbox]);

  function stopPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }

  function startPolling(fetchUrl: string) {
    fetchUrlRef.current = fetchUrl;
    stopPolling();
    pollRef.current = setInterval(async () => {
      const res = await pollMultiFaceSwap(fetchUrlRef.current);
      if (res.status === "success") {
        stopPolling(); setPhase("idle");
        setResult(res.outputUrl);
        setHistory(h => [res.outputUrl, ...h].slice(0, 20));
      } else if (res.status === "error") {
        stopPolling(); setPhase("idle");
        setError(res.error);
      }
    }, POLL_INTERVAL_MS);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formRef.current) return;
    stopPolling();
    setResult(null); setError(null); setPhase("uploading");

    const fd = new FormData(formRef.current);
    fd.set("enhance", enhance ? "1" : "0");

    const res = await submitMultiFaceSwap(fd);
    if (!res.ok) { setPhase("idle"); setError(res.error); return; }
    if (res.status === "success") {
      setPhase("idle"); setResult(res.outputUrl);
      setHistory(h => [res.outputUrl, ...h].slice(0, 20));
      return;
    }
    setPhase("processing");
    startPolling(res.fetchUrl);
  }

  const loading  = phase !== "idle";
  const progress = Math.min(100, Math.round((elapsed / ESTIMATE_SEC) * 100));
  const ready    = !!previews.init_image && !!previews.target_image;
  const isTwoToTwo = !!previews.target_image_2;

  return (
    <>
      {/* 라이트박스 */}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.9)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "zoom-out", padding: 24 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 12 }}>ESC 또는 클릭으로 닫기</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="확대" onClick={e => e.stopPropagation()}
            style={{ maxWidth: "min(92vw,1400px)", maxHeight: "85vh", objectFit: "contain", borderRadius: 8, boxShadow: "0 8px 60px rgba(0,0,0,0.6)", cursor: "default" }} />
        </div>
      )}

      <form ref={formRef} onSubmit={handleSubmit}>
        {/* 이미지 슬롯 3개 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, marginBottom: 24 }}>
          {SLOTS.map(({ key, label, desc, required }) => (
            <div key={key}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{label}</span>
                {!required && (
                  <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "var(--line)", color: "var(--ink-faint)" }}>선택</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 10 }}>{desc}</div>
              <label htmlFor={key} style={{ display: "block", width: "100%", aspectRatio: "3/4", border: "2px dashed var(--line)", borderRadius: 10, overflow: "hidden", cursor: loading ? "default" : "pointer", background: "var(--bg-soft)", position: "relative" }}>
                {previews[key] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previews[key]} alt={label}
                    style={{ width: "100%", height: "100%", objectFit: "contain", background: "var(--bg-soft)" }} />
                ) : (
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--ink-faint)" }}>
                    <span style={{ fontSize: 36 }}>+</span>
                    <span style={{ fontSize: 13 }}>이미지 선택</span>
                  </div>
                )}
              </label>
              <input id={key} name={key} type="file" accept="image/*" disabled={loading} style={{ display: "none" }}
                onChange={e => {
                  const f = e.target.files?.[0]; if (!f) return;
                  setPreviews(p => ({ ...p, [key]: URL.createObjectURL(f) }));
                }} />
              {previews[key] && !loading && (
                <button type="button" className="admin-btn admin-btn--ghost" style={{ fontSize: 11, marginTop: 8 }}
                  onClick={() => {
                    setPreviews(p => { const n = { ...p }; delete n[key]; return n; });
                    const inp = document.getElementById(key) as HTMLInputElement;
                    if (inp) inp.value = "";
                  }}>초기화</button>
              )}
            </div>
          ))}
        </div>

        {/* 옵션 */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, padding: "12px 16px", background: "var(--bg-soft)", borderRadius: 8, border: "1px solid var(--line)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, userSelect: "none" }}>
            <input type="checkbox" checked={enhance} onChange={e => setEnhance(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: "var(--accent)", cursor: "pointer" }} />
            <span style={{ fontWeight: 600 }}>Enhance Face Swap</span>
          </label>
          <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>얼굴 품질 향상 (처리 시간 약간 증가)</span>
        </div>

        {/* 실행 버튼 */}
        <button type="submit" className="admin-btn" disabled={loading || !ready}
          style={{ minWidth: 180, fontSize: 14, padding: "10px 28px", marginBottom: 24 }}>
          {loading ? "처리 중…" : isTwoToTwo ? "✦ 2인→2인 Face Swap 실행" : "✦ Multiple Face Swap 실행"}
        </button>

        {/* 진행 상태 */}
        {loading && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 8 }}>
              {phase === "uploading" ? "이미지 업로드 중…" : `처리 중… ${formatMmSs(elapsed)}`}
            </div>
            <div style={{ height: 6, background: "var(--line)", borderRadius: 4, overflow: "hidden", maxWidth: 480 }}>
              <div style={{ height: "100%", width: `${phase === "uploading" ? 8 : progress}%`, background: "var(--accent)", borderRadius: 4, transition: "width 1s linear" }} />
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
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginBottom: 12 }}>결과 이미지</div>
            <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result} alt="결과" onClick={() => setLightbox(result)}
                style={{ maxWidth: 480, width: "100%", borderRadius: 10, border: "1px solid var(--line)", display: "block", cursor: "zoom-in" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <a href={result} target="_blank" rel="noreferrer" className="admin-btn" style={{ fontSize: 12 }}>원본 URL 열기</a>
                <button type="button" className="admin-btn admin-btn--ghost" style={{ fontSize: 12 }} onClick={() => navigator.clipboard.writeText(result)}>URL 복사</button>
                <button type="button" className="admin-btn admin-btn--ghost" style={{ fontSize: 12 }} onClick={() => { setResult(null); setError(null); }}>다시 시도</button>
              </div>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: "var(--ink-faint)", fontFamily: "monospace", wordBreak: "break-all" }}>{result}</div>
          </div>
        )}
      </form>

      {/* 히스토리 */}
      {history.length > 0 && (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 28, marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>이번 세션 결과 ({history.length})</div>
            <button type="button" className="admin-btn admin-btn--ghost" style={{ fontSize: 11 }} onClick={() => setHistory([])}>전체 삭제</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {history.map((url, i) => (
              <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", background: "var(--bg)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`결과 ${i + 1}`} onClick={() => setLightbox(url)}
                  style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", display: "block", cursor: "zoom-in" }} />
                <div style={{ padding: "8px 10px", display: "flex", gap: 6 }}>
                  <a href={url} target="_blank" rel="noreferrer" className="admin-btn admin-btn--ghost" style={{ fontSize: 10, padding: "3px 8px" }}>열기</a>
                  <button type="button" className="admin-btn admin-btn--ghost" style={{ fontSize: 10, padding: "3px 8px" }} onClick={() => navigator.clipboard.writeText(url)}>복사</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
