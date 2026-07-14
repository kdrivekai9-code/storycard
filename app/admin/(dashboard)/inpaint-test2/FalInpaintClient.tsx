"use client";

import { useState, useRef, useEffect } from "react";
import {
  uploadInitImage,
  runBiRefNetMask,
  runSam2Mask,
  submitFalInpaint,
  pollFalInpaint,
} from "./actions";

const POLL_INTERVAL_MS = 4000;
const ESTIMATE_SEC = 45;
const MAX_DIM = 1024;

type MaskModel = "birefnet" | "sam2";
type Point = { x: number; y: number; label: 1 | 0 };

function formatMmSs(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function resizeFile(file: File, maxDim = MAX_DIM): Promise<{ blob: Blob; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (b) => b ? resolve({ blob: b, w, h }) : reject(new Error("resize 실패")),
        "image/jpeg", 0.92,
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}

/** BiRefNet 결과(투명PNG) → 인페인팅 마스크(검정=유지, 흰색=교체) */
function bgRemovedToMask(imageUrl: string): Promise<{ blob: Blob; previewUrl: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      const id = ctx.getImageData(0, 0, w, h);
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = d[i + 3] < 128 ? 255 : 0; // 투명=흰색(교체), 불투명=검정(유지)
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
      }
      ctx.putImageData(id, 0, 0);
      const previewUrl = canvas.toDataURL("image/png");
      canvas.toBlob((b) => b ? resolve({ blob: b, previewUrl }) : reject(new Error("toBlob 실패")), "image/png");
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
}

/** SAM 2 마스크(흰=선택된 인물) → 인페인팅 마스크(반전: 검정=유지, 흰색=교체) */
function sam2ToInpaintMask(imageUrl: string): Promise<{ blob: Blob; previewUrl: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      const id = ctx.getImageData(0, 0, w, h);
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const bright = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        const v = bright > 128 ? 0 : 255; // 밝음=인물 → 검정(유지), 어두움=배경 → 흰색(교체)
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
      }
      ctx.putImageData(id, 0, 0);
      const previewUrl = canvas.toDataURL("image/png");
      canvas.toBlob((b) => b ? resolve({ blob: b, previewUrl }) : reject(new Error("toBlob 실패")), "image/png");
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
}

export function FalInpaintClient() {
  const [maskModel,    setMaskModel]    = useState<MaskModel>("birefnet");
  const [step,         setStep]         = useState<1 | 2>(1);
  const [initPreview,  setInitPreview]  = useState<string | null>(null);
  const [initUrl,      setInitUrl]      = useState<string>("");
  const [initDims,     setInitDims]     = useState<{ w: number; h: number } | null>(null);
  const [points,       setPoints]       = useState<Point[]>([]);
  const [maskPreview,  setMaskPreview]  = useState<string | null>(null);
  const [maskBlob,     setMaskBlob]     = useState<Blob | null>(null);
  const [result,       setResult]       = useState<string | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [statusMsg,    setStatusMsg]    = useState<string>("");
  const [phase, setPhase] = useState<"idle" | "uploading" | "masking" | "processing">("idle");
  const [elapsed, setElapsed] = useState(0);

  const fileRef       = useRef<File | null>(null);
  const formRef       = useRef<HTMLFormElement>(null);
  const pollRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusUrlRef  = useRef<string>("");
  const responseUrlRef = useRef<string>("");
  const imgRef        = useRef<HTMLImageElement | null>(null);

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

  function startPolling(sUrl: string, rUrl: string) {
    statusUrlRef.current  = sUrl;
    responseUrlRef.current = rUrl;
    stopPolling();
    pollRef.current = setInterval(async () => {
      const res = await pollFalInpaint(statusUrlRef.current, responseUrlRef.current);
      if (res.status === "success") {
        stopPolling(); setPhase("idle"); setResult(res.outputUrl);
      } else if (res.status === "error") {
        stopPolling(); setPhase("idle"); setError(res.error);
      }
    }, POLL_INTERVAL_MS);
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    fileRef.current = f;
    setError(null);
    setPoints([]);
    setMaskPreview(null);
    setMaskBlob(null);
    setInitUrl("");

    setPhase("uploading");
    setStatusMsg("이미지 업로드 중…");

    try {
      const { blob, w, h } = await resizeFile(f);
      setInitPreview(URL.createObjectURL(blob));
      setInitDims({ w, h });

      const fd = new FormData();
      fd.append("init_image", new File([blob], "init.jpg", { type: "image/jpeg" }));
      const res = await uploadInitImage(fd);
      if (!res.ok) { setPhase("idle"); setError(res.error); return; }
      setInitUrl(res.initUrl);
      setPhase("idle");
      setStatusMsg("");
    } catch (err) {
      setPhase("idle");
      setError("업로드 실패: " + String(err));
    }
  }

  async function handleGenerateBiRefNet() {
    if (!initUrl) return;
    setError(null);
    setPhase("masking");
    setStatusMsg("BiRefNet 배경 제거 중…");
    try {
      const res = await runBiRefNetMask(initUrl);
      if (!res.ok) { setPhase("idle"); setError(res.error); return; }
      setStatusMsg("마스크 변환 중…");
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

  async function handleGenerateSam2() {
    if (!initUrl || points.length === 0) return;
    setError(null);
    setPhase("masking");
    setStatusMsg("SAM 2 마스크 생성 중…");
    try {
      const res = await runSam2Mask(initUrl, points);
      if (!res.ok) { setPhase("idle"); setError(res.error); return; }
      setStatusMsg("마스크 변환 중…");
      const { blob, previewUrl } = await sam2ToInpaintMask(res.sam2MaskUrl);
      setMaskBlob(blob);
      setMaskPreview(previewUrl);
      setPhase("idle");
      setStep(2);
    } catch (err) {
      setPhase("idle");
      setError("SAM 2 마스크 변환 실패: " + String(err));
    }
  }

  function handleImageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!initDims || phase !== "idle" || !initUrl) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top)  / rect.height;
    const px = Math.round(nx * initDims.w);
    const py = Math.round(ny * initDims.h);
    // 우클릭=배경 포인트는 onContextMenu에서 별도 처리
    setPoints((prev) => [...prev, { x: px, y: py, label: 1 }]);
  }

  function handleImageRightClick(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!initDims || phase !== "idle" || !initUrl) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top)  / rect.height;
    const px = Math.round(nx * initDims.w);
    const py = Math.round(ny * initDims.h);
    setPoints((prev) => [...prev, { x: px, y: py, label: 0 }]);
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

    const res = await submitFalInpaint(formData);
    if (!res.ok) { setPhase("idle"); setError(res.error); return; }

    setPhase("processing");
    setStatusMsg("fal.ai 생성 중…");
    startPolling(res.statusUrl, res.responseUrl);
  }

  function reset() {
    stopPolling();
    setStep(1); setInitPreview(null); setInitUrl(""); setInitDims(null);
    setPoints([]); setMaskPreview(null); setMaskBlob(null);
    setResult(null); setError(null); setPhase("idle");
    fileRef.current = null;
    if (formRef.current) formRef.current.reset();
  }

  const loading  = phase !== "idle";
  const progress = Math.min(100, Math.round((elapsed / ESTIMATE_SEC) * 100));

  return (
    <div>
      {/* ── STEP 1: 이미지 업로드 + 마스킹 모델 선택 ── */}
      {step === 1 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", marginBottom: 12 }}>
            STEP 1 — 이미지 업로드 &amp; 마스킹 모델 선택
          </div>

          {/* 마스킹 모델 선택 */}
          <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
            {(["birefnet", "sam2"] as MaskModel[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMaskModel(m); setPoints([]); setMaskPreview(null); setMaskBlob(null); }}
                disabled={loading}
                style={{
                  padding: "8px 18px", borderRadius: 8, border: "2px solid",
                  borderColor: maskModel === m ? "var(--accent)" : "var(--line)",
                  background: maskModel === m ? "var(--accent)" : "transparent",
                  color: maskModel === m ? "#fff" : "var(--ink)",
                  fontWeight: maskModel === m ? 700 : 400,
                  fontSize: 13, cursor: loading ? "default" : "pointer",
                }}
              >
                {m === "birefnet" ? "BiRefNet (자동)" : "SAM 2 (수동 포인트)"}
              </button>
            ))}
          </div>

          {/* 모델 설명 */}
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 16, padding: "8px 12px", background: "var(--bg-soft)", borderRadius: 6, lineHeight: 1.7 }}>
            {maskModel === "birefnet"
              ? "BiRefNet: 인물 전체를 자동으로 배경에서 분리합니다."
              : "SAM 2: 이미지를 업로드한 후 인물 위를 좌클릭(녹색)하여 포인트를 지정하세요. 배경 포인트는 우클릭(빨간색)으로 추가합니다."}
          </div>

          {/* 이미지 업로드 / SAM 2 포인트 선택 */}
          {!initPreview ? (
            <>
              <label
                htmlFor="init_image_picker2"
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  width: "100%", maxWidth: 360, aspectRatio: "3/4",
                  border: "2px dashed var(--line)", borderRadius: 8,
                  overflow: "hidden", cursor: loading ? "default" : "pointer",
                  background: "var(--bg-soft)", position: "relative", marginBottom: 16,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: "var(--ink-faint)", fontSize: 13 }}>
                  <span style={{ fontSize: 36 }}>+</span>
                  <span>신랑/신부 사진 선택</span>
                </div>
              </label>
              <input
                id="init_image_picker2" type="file" accept="image/*"
                disabled={loading} style={{ display: "none" }}
                onChange={handleFileSelect}
              />
            </>
          ) : (
            <>
              {/* 업로드 완료 후 이미지 표시 (SAM2면 클릭 가능) */}
              <div style={{ position: "relative", display: "inline-block", marginBottom: 12, maxWidth: 360, width: "100%" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imgRef}
                  src={initPreview}
                  alt="원본"
                  style={{ width: "100%", display: "block", borderRadius: 8, border: "1px solid var(--line)" }}
                />
                {/* SAM 2 포인트 선택 오버레이 */}
                {maskModel === "sam2" && !loading && initUrl && (
                  <div
                    style={{ position: "absolute", inset: 0, cursor: "crosshair" }}
                    onClick={handleImageClick}
                    onContextMenu={handleImageRightClick}
                  >
                    {points.map((p, i) => {
                      const el = imgRef.current;
                      if (!el || !initDims) return null;
                      const left = `${(p.x / initDims.w) * 100}%`;
                      const top  = `${(p.y / initDims.h) * 100}%`;
                      return (
                        <div key={i} style={{
                          position: "absolute", left, top,
                          width: 14, height: 14, borderRadius: "50%",
                          background: p.label === 1 ? "#22c55e" : "#ef4444",
                          border: "2px solid #fff",
                          transform: "translate(-50%, -50%)",
                          boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                          pointerEvents: "none",
                        }} />
                      );
                    })}
                  </div>
                )}
              </div>

              {/* SAM 2 포인트 안내 + 초기화 */}
              {maskModel === "sam2" && (
                <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 10 }}>
                  <span style={{ color: "#22c55e", fontWeight: 600 }}>● 좌클릭</span> 인물(전경) &nbsp;
                  <span style={{ color: "#ef4444", fontWeight: 600 }}>● 우클릭</span> 배경 &nbsp;
                  {points.length > 0 && (
                    <span> · {points.filter(p => p.label === 1).length}개 전경 / {points.filter(p => p.label === 0).length}개 배경</span>
                  )}
                  {points.length > 0 && (
                    <button type="button" onClick={() => setPoints([])} style={{ marginLeft: 10, fontSize: 11, background: "none", border: "none", color: "var(--accent)", cursor: "pointer", textDecoration: "underline" }}>
                      포인트 초기화
                    </button>
                  )}
                </div>
              )}

              {/* 이미지 재선택 */}
              {!loading && (
                <div style={{ marginBottom: 16 }}>
                  <label htmlFor="init_image_picker2" style={{ fontSize: 12, cursor: "pointer", color: "var(--accent)", textDecoration: "underline" }}>
                    다른 사진 선택
                  </label>
                  <input id="init_image_picker2" type="file" accept="image/*" disabled={loading} style={{ display: "none" }} onChange={handleFileSelect} />
                </div>
              )}
            </>
          )}

          {/* 업로드 진행 중 표시 */}
          {phase === "uploading" && (
            <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12 }}>{statusMsg}</div>
          )}

          {/* 마스크 생성 버튼 */}
          {initUrl && !loading && (
            maskModel === "birefnet" ? (
              <button type="button" className="admin-btn" onClick={handleGenerateBiRefNet} style={{ minWidth: 200 }}>
                BiRefNet 마스크 자동 생성
              </button>
            ) : (
              <button
                type="button"
                className="admin-btn"
                onClick={handleGenerateSam2}
                disabled={points.filter(p => p.label === 1).length === 0}
                style={{ minWidth: 200 }}
              >
                {points.filter(p => p.label === 1).length === 0
                  ? "인물 위를 클릭하여 포인트 추가"
                  : `SAM 2 마스크 생성 (포인트 ${points.length}개)`}
              </button>
            )
          )}

          {phase === "masking" && (
            <div style={{ marginTop: 14, fontSize: 13, color: "var(--ink-soft)" }}>{statusMsg}</div>
          )}
        </div>
      )}

      {/* ── STEP 2: 마스크 확인 + 프롬프트 + 실행 ── */}
      {step === 2 && (
        <form ref={formRef} onSubmit={handleSubmit}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", marginBottom: 12 }}>
            STEP 2 — 마스크 확인 후 배경 프롬프트 입력
            <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 400, padding: "2px 8px", borderRadius: 4, background: maskModel === "birefnet" ? "#dbeafe" : "#dcfce7", color: maskModel === "birefnet" ? "#1d4ed8" : "#15803d" }}>
              {maskModel === "birefnet" ? "BiRefNet" : "SAM 2"}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>원본 이미지</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={initPreview!} alt="원본" style={{ width: "100%", borderRadius: 8, border: "1px solid var(--line)", display: "block" }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
                자동 생성 마스크
                <span style={{ marginLeft: 8, fontSize: 11, padding: "1px 6px", borderRadius: 4, background: "var(--line)" }}>검정=유지 / 흰색=교체</span>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={maskPreview!} alt="마스크" style={{ width: "100%", borderRadius: 8, border: "1px solid var(--line)", display: "block", marginBottom: 8 }} />
              <a
                href={maskPreview!}
                download="mask.png"
                className="admin-btn admin-btn--ghost"
                style={{ fontSize: 12, display: "inline-block", textAlign: "center", width: "100%", boxSizing: "border-box" }}
              >
                마스크 저장
              </a>
            </div>
          </div>

          <div className="admin-form-group" style={{ marginBottom: 16 }}>
            <label className="admin-label">배경 프롬프트 <span style={{ color: "#dc2626" }}>*</span></label>
            <textarea name="prompt" rows={3} disabled={loading} required
              placeholder="beautiful european garden, lush greenery, flowers, soft sunlight, bokeh background, photorealistic, high quality"
              style={{ width: "100%", boxSizing: "border-box", resize: "vertical" }} />
          </div>

          <div className="admin-form-group" style={{ marginBottom: 20 }}>
            <label className="admin-label">네거티브 프롬프트</label>
            <textarea name="negative_prompt" rows={2} disabled={loading}
              defaultValue="lowres, watermark, text, blur, artifacts, bad quality"
              style={{ width: "100%", boxSizing: "border-box", resize: "vertical" }} />
          </div>

          <details style={{ marginBottom: 20, border: "1px solid var(--line)", borderRadius: 8, padding: "12px 16px" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>모델 설정 (고급)</summary>
            <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 10, marginBottom: 14, padding: "8px 12px", background: "var(--bg-soft)", borderRadius: 6 }}>
              Flux 계열은 Guidance Scale이 낮아야 자연스럽습니다 (기본 3.5, 최대 5).
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="admin-form-group">
                <label className="admin-label">Strength</label>
                <input name="strength" type="number" min="0" max="1" step="0.05" defaultValue="0.85" disabled={loading} style={{ width: "100%", boxSizing: "border-box" }} />
              </div>
              <div className="admin-form-group">
                <label className="admin-label">Guidance Scale (최대 5)</label>
                <input name="guidance_scale" type="number" min="1" max="5" step="0.5" defaultValue="3.5" disabled={loading} style={{ width: "100%", boxSizing: "border-box" }} />
              </div>
              <div className="admin-form-group">
                <label className="admin-label">Inference Steps</label>
                <input name="num_inference_steps" type="number" min="10" max="50" defaultValue="28" disabled={loading} style={{ width: "100%", boxSizing: "border-box" }} />
              </div>
              <div className="admin-form-group">
                <label className="admin-label">Seed (비워두면 랜덤)</label>
                <input name="seed" type="number" placeholder="예: 42" disabled={loading} style={{ width: "100%", boxSizing: "border-box" }} />
              </div>
            </div>
          </details>

          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 24 }}>
            <button type="submit" className="admin-btn" disabled={loading} style={{ minWidth: 160 }}>
              {loading ? "처리 중…" : "Inpainting 실행"}
            </button>
            <button type="button" className="admin-btn admin-btn--ghost" disabled={loading} onClick={reset}>처음부터</button>
            <button type="button" className="admin-btn admin-btn--ghost" disabled={loading} onClick={() => { setStep(1); setMaskPreview(null); setMaskBlob(null); setPoints([]); }}>
              마스크 다시 생성
            </button>
          </div>

          {loading && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 8 }}>
                {phase === "uploading" ? statusMsg : `fal.ai 생성 중… ${formatMmSs(elapsed)}`}
              </div>
              <div style={{ height: 6, background: "var(--line)", borderRadius: 4, overflow: "hidden", maxWidth: 400 }}>
                <div style={{ height: "100%", width: `${phase === "uploading" ? 5 : progress}%`, background: "var(--accent)", borderRadius: 4, transition: "width 1s linear" }} />
              </div>
            </div>
          )}
        </form>
      )}

      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", fontSize: 13, marginTop: 16, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", marginBottom: 10 }}>결과 이미지</div>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={result} alt="결과" style={{ maxWidth: 400, borderRadius: 8, border: "1px solid var(--line)", display: "block" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <a href={result} target="_blank" rel="noreferrer" className="admin-btn" style={{ fontSize: 12 }}>원본 URL 열기</a>
              <button type="button" className="admin-btn admin-btn--ghost" style={{ fontSize: 12 }} onClick={() => navigator.clipboard.writeText(result)}>URL 복사</button>
              <button type="button" className="admin-btn admin-btn--ghost" style={{ fontSize: 12 }} onClick={reset}>다시 시도</button>
            </div>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: "var(--ink-faint)", fontFamily: "monospace", wordBreak: "break-all" }}>{result}</div>
        </div>
      )}
    </div>
  );
}
