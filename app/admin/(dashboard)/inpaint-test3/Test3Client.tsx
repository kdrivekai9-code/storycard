"use client";

import { useState, useRef, useEffect } from "react";
import {
  uploadImageA,
  uploadTextureMask,
  runSam2TextureMask,
  submitTextureInpainting,
  pollTextureInpainting,
  uploadFeaturesMask,
  compositeFeatures,
} from "./actions";

const POLL_INTERVAL_MS = 4000;
const ESTIMATE_SEC = 40;
const MAX_DIM = 1024;

type Step = 1 | 2 | 3 | 4;
type MaskMethod = "upload" | "sam2" | "invert";
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
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      cv.getContext("2d")!.drawImage(img, 0, 0, w, h);
      cv.toBlob((b) => b ? resolve({ blob: b, w, h }) : reject(new Error("resize 실패")), "image/jpeg", 0.92);
    };
    img.onerror = reject;
    img.src = url;
  });
}

/** SAM2 마스크(흰=선택) → 반전(흰=피부만, 검정=이목구비) — 실제 극성은 사용자가 확인 후 조정 */
function sam2ToTextureMask(imageUrl: string): Promise<{ blob: Blob; previewUrl: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      const ctx = cv.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      const id = ctx.getImageData(0, 0, w, h);
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const b = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        // SAM2 밝은 영역(선택된 피부 영역) → 흰색(질감 복원 대상)
        const v = b > 128 ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
      }
      ctx.putImageData(id, 0, 0);
      const previewUrl = cv.toDataURL("image/png");
      cv.toBlob((b) => b ? resolve({ blob: b, previewUrl }) : reject(new Error("toBlob 실패")), "image/png");
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
}

/** 질감 마스크 → 반전 → 이목구비 마스크 */
function invertMask(dataUrl: string): Promise<{ blob: Blob; previewUrl: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const ctx = cv.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const id = ctx.getImageData(0, 0, cv.width, cv.height);
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = d[i] > 128 ? 0 : 255;
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
      }
      ctx.putImageData(id, 0, 0);
      const previewUrl = cv.toDataURL("image/png");
      cv.toBlob((b) => b ? resolve({ blob: b, previewUrl }) : reject(new Error("toBlob")), "image/png");
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

const STEPS: { label: string; desc: string }[] = [
  { label: "STEP 1", desc: "이미지 A 업로드" },
  { label: "STEP 2", desc: "질감 마스크" },
  { label: "STEP 3", desc: "질감 복원 인페인팅" },
  { label: "STEP 4", desc: "이목구비 합성" },
];

export function Test3Client() {
  const [step, setStep] = useState<Step>(1);

  // STEP 1
  const [imageAPreview, setImageAPreview] = useState<string | null>(null);
  const [imageAUrl,     setImageAUrl]     = useState<string>("");
  const [imageADims,    setImageADims]    = useState<{ w: number; h: number } | null>(null);

  // STEP 2
  const [textureMaskMethod,  setTextureMaskMethod]  = useState<MaskMethod>("upload");
  const [textureMaskPreview, setTextureMaskPreview] = useState<string | null>(null);
  const [textureMaskBlob,    setTextureMaskBlob]    = useState<Blob | null>(null);
  const [textureMaskUrl,     setTextureMaskUrl]     = useState<string>("");
  const [sam2Points,         setSam2Points]         = useState<Point[]>([]);

  // STEP 3
  const [imageBPreview, setImageBPreview] = useState<string | null>(null);
  const [imageBUrl,     setImageBUrl]     = useState<string>("");

  // STEP 4
  const [featuresMaskMethod,  setFeaturesMaskMethod]  = useState<MaskMethod>("invert");
  const [featuresMaskPreview, setFeaturesMaskPreview] = useState<string | null>(null);
  const [featuresMaskBlob,    setFeaturesMaskBlob]    = useState<Blob | null>(null);
  const [featuresMaskUrl,     setFeaturesMaskUrl]     = useState<string>("");
  const [finalResult,         setFinalResult]         = useState<string | null>(null);

  // 공통
  const [loading,    setLoading]    = useState(false);
  const [statusMsg,  setStatusMsg]  = useState("");
  const [error,      setError]      = useState<string | null>(null);
  const [elapsed,    setElapsed]    = useState(0);

  const imgARef    = useRef<HTMLImageElement | null>(null);
  const formStep3  = useRef<HTMLFormElement>(null);
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchUrlRef = useRef<string>("");

  useEffect(() => {
    if (loading) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loading]);

  function stopPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }

  function err(msg: string) { setError(msg); setLoading(false); setStatusMsg(""); }

  // ── STEP 1 ──────────────────────────────────────────────────────────────
  async function handleUploadA(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setError(null); setLoading(true); setStatusMsg("이미지 업로드 중…");
    try {
      const { blob, w, h } = await resizeFile(f);
      setImageAPreview(URL.createObjectURL(blob));
      setImageADims({ w, h });
      const fd = new FormData();
      fd.append("image_a", new File([blob], "imageA.jpg", { type: "image/jpeg" }));
      const res = await uploadImageA(fd);
      if (!res.ok) { err(res.error); return; }
      setImageAUrl(res.imageAUrl);
      setLoading(false); setStatusMsg("");
    } catch (e2) { err(String(e2)); }
  }

  // ── STEP 2: 마스크 업로드 ───────────────────────────────────────────────
  async function handleTextureMaskUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setError(null); setLoading(true); setStatusMsg("마스크 업로드 중…");
    try {
      const fd = new FormData(); fd.append("texture_mask", f);
      const res = await uploadTextureMask(fd);
      if (!res.ok) { err(res.error); return; }
      setTextureMaskUrl(res.textureMaskUrl);
      setTextureMaskPreview(URL.createObjectURL(f));
      setTextureMaskBlob(f);
      setLoading(false); setStatusMsg("");
    } catch (e2) { err(String(e2)); }
  }

  // ── STEP 2: SAM 2 포인트 마스크 ─────────────────────────────────────────
  function handleSam2Click(e: React.MouseEvent<HTMLDivElement>) {
    if (!imageADims || loading) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = Math.round(((e.clientX - rect.left) / rect.width) * imageADims.w);
    const py = Math.round(((e.clientY - rect.top) / rect.height) * imageADims.h);
    setSam2Points((prev) => [...prev, { x: px, y: py, label: 1 }]);
  }
  function handleSam2RightClick(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!imageADims || loading) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = Math.round(((e.clientX - rect.left) / rect.width) * imageADims.w);
    const py = Math.round(((e.clientY - rect.top) / rect.height) * imageADims.h);
    setSam2Points((prev) => [...prev, { x: px, y: py, label: 0 }]);
  }

  async function handleGenerateSam2TextureMask() {
    if (!imageAUrl || sam2Points.length === 0) return;
    setError(null); setLoading(true); setStatusMsg("SAM 2 마스크 생성 중…");
    try {
      const res = await runSam2TextureMask(imageAUrl, sam2Points);
      if (!res.ok) { err(res.error); return; }
      setStatusMsg("마스크 변환 중…");
      const { blob, previewUrl } = await sam2ToTextureMask(res.sam2RawUrl);
      setTextureMaskBlob(blob);
      setTextureMaskPreview(previewUrl);
      setTextureMaskUrl(""); // blob 방식으로 step3에서 업로드
      setLoading(false); setStatusMsg("");
    } catch (e2) { err(String(e2)); }
  }

  function goToStep3() {
    if (!textureMaskPreview && !textureMaskUrl) { setError("질감 마스크를 먼저 생성/업로드해주세요."); return; }
    setError(null); setStep(3);
  }

  // ── STEP 3: 질감 복원 인페인팅 ──────────────────────────────────────────
  async function handleTextureInpainting(e: React.FormEvent) {
    e.preventDefault();
    if (!formStep3.current) return;
    stopPolling();
    setError(null); setLoading(true); setStatusMsg("마스크 전송 중…");

    const fd = new FormData(formStep3.current);
    fd.append("image_a_url", imageAUrl);
    if (textureMaskUrl) {
      fd.append("texture_mask_url", textureMaskUrl);
    } else if (textureMaskBlob) {
      fd.append("texture_mask_file", new File([textureMaskBlob], "mask.png", { type: "image/png" }));
    }

    const res = await submitTextureInpainting(fd);
    if (!res.ok) { err(res.error); return; }

    if (res.status === "success") {
      setImageBUrl(res.outputUrl); setImageBPreview(res.outputUrl);
      setLoading(false); setStatusMsg(""); setStep(4);
      return;
    }

    setStatusMsg("질감 복원 중…");
    fetchUrlRef.current = res.fetchUrl;
    stopPolling();
    pollRef.current = setInterval(async () => {
      const pr = await pollTextureInpainting(fetchUrlRef.current);
      if (pr.status === "success") {
        stopPolling(); setLoading(false); setStatusMsg("");
        setImageBUrl(pr.outputUrl); setImageBPreview(pr.outputUrl);
        setStep(4);
      } else if (pr.status === "error") {
        stopPolling(); err(pr.error);
      }
    }, POLL_INTERVAL_MS);
  }

  // ── STEP 4: 이목구비 마스크 ────────────────────────────────────────────
  async function handleFeaturesMaskUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setError(null); setLoading(true); setStatusMsg("이목구비 마스크 업로드 중…");
    try {
      const fd = new FormData(); fd.append("features_mask", f);
      const res = await uploadFeaturesMask(fd);
      if (!res.ok) { err(res.error); return; }
      setFeaturesMaskUrl(res.featuresMaskUrl);
      setFeaturesMaskPreview(URL.createObjectURL(f));
      setFeaturesMaskBlob(f);
      setLoading(false); setStatusMsg("");
    } catch (e2) { err(String(e2)); }
  }

  async function handleAutoInvertMask() {
    if (!textureMaskPreview) { setError("질감 마스크가 없습니다."); return; }
    setError(null); setLoading(true); setStatusMsg("마스크 반전 중…");
    try {
      const { blob, previewUrl } = await invertMask(textureMaskPreview);
      setFeaturesMaskBlob(blob);
      setFeaturesMaskPreview(previewUrl);
      setFeaturesMaskUrl("");
      setLoading(false); setStatusMsg("");
    } catch (e2) { err(String(e2)); }
  }

  async function handleComposite() {
    if (!imageBUrl || !imageAUrl) { setError("인페인팅 결과가 없습니다."); return; }
    if (!featuresMaskUrl && !featuresMaskBlob) { setError("이목구비 마스크가 없습니다."); return; }
    setError(null); setLoading(true); setStatusMsg("이목구비 마스크 업로드 중…");

    try {
      let maskUrl = featuresMaskUrl;
      if (!maskUrl && featuresMaskBlob) {
        const fd = new FormData();
        fd.append("features_mask", new File([featuresMaskBlob], "features-mask.png", { type: "image/png" }));
        const res = await uploadFeaturesMask(fd);
        if (!res.ok) { err(res.error); return; }
        maskUrl = res.featuresMaskUrl;
        setFeaturesMaskUrl(maskUrl);
      }

      setStatusMsg("Sharp 합성 중…");
      const res = await compositeFeatures({ baseUrl: imageBUrl, sourceUrl: imageAUrl, maskUrl });
      if (!res.ok) { err(res.error); return; }
      setFinalResult(res.resultUrl);
      setLoading(false); setStatusMsg("");
    } catch (e2) { err(String(e2)); }
  }

  function reset() {
    stopPolling();
    setStep(1);
    setImageAPreview(null); setImageAUrl(""); setImageADims(null);
    setTextureMaskPreview(null); setTextureMaskBlob(null); setTextureMaskUrl(""); setSam2Points([]);
    setImageBPreview(null); setImageBUrl("");
    setFeaturesMaskPreview(null); setFeaturesMaskBlob(null); setFeaturesMaskUrl("");
    setFinalResult(null); setError(null); setLoading(false); setStatusMsg("");
  }

  const progress = Math.min(100, Math.round((elapsed / ESTIMATE_SEC) * 100));

  return (
    <div>
      {/* 스텝 인디케이터 */}
      <div style={{ display: "flex", gap: 0, marginBottom: 28 }}>
        {STEPS.map((s, i) => {
          const n = (i + 1) as Step;
          const active = step === n;
          const done   = step > n;
          return (
            <div key={n} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, position: "relative" }}>
              {i > 0 && <div style={{ position: "absolute", left: 0, top: 14, width: "50%", height: 2, background: done ? "var(--accent)" : "var(--line)" }} />}
              {i < 3 && <div style={{ position: "absolute", right: 0, top: 14, width: "50%", height: 2, background: step > n ? "var(--accent)" : "var(--line)" }} />}
              <div style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, zIndex: 1, background: active ? "var(--accent)" : done ? "var(--accent)" : "var(--line)", color: active || done ? "#fff" : "var(--ink-soft)" }}>
                {done ? "✓" : n}
              </div>
              <div style={{ fontSize: 10, color: active ? "var(--accent)" : done ? "var(--ink)" : "var(--ink-faint)", fontWeight: active ? 700 : 400, textAlign: "center" }}>{s.desc}</div>
            </div>
          );
        })}
      </div>

      {/* ── STEP 1 ── */}
      {step === 1 && (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)", marginBottom: 12 }}>STEP 1 — 페이스스왑 완료 이미지 A 업로드</div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 16, padding: "8px 12px", background: "var(--bg-soft)", borderRadius: 6 }}>
            배경 합성이 완료된 페이스스왑 결과물을 업로드합니다.
          </div>
          <label htmlFor="imageA_input" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", maxWidth: 360, aspectRatio: "3/4", border: "2px dashed var(--line)", borderRadius: 8, overflow: "hidden", cursor: loading ? "default" : "pointer", background: "var(--bg-soft)", position: "relative", marginBottom: 16 }}>
            {imageAPreview
              ? <img src={imageAPreview} alt="A" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> // eslint-disable-line @next/next/no-img-element
              : <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: "var(--ink-faint)", fontSize: 13 }}><span style={{ fontSize: 36 }}>+</span><span>이미지 A 선택</span></div>}
          </label>
          <input id="imageA_input" type="file" accept="image/*" disabled={loading} style={{ display: "none" }} onChange={handleUploadA} />
          {loading && <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12 }}>{statusMsg}</div>}
          {imageAUrl && !loading && (
            <button type="button" className="admin-btn" onClick={() => { setError(null); setStep(2); }} style={{ minWidth: 160 }}>다음 →</button>
          )}
        </div>
      )}

      {/* ── STEP 2 ── */}
      {step === 2 && (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)", marginBottom: 12 }}>STEP 2 — 질감 마스크 생성</div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 16, padding: "8px 12px", background: "var(--bg-soft)", borderRadius: 6, lineHeight: 1.7 }}>
            이마, 볼, 팔자 주름 등 <strong>피부 질감 영역(흰색)</strong>만 선택하는 마스크입니다.<br />
            눈·코·입 이목구비는 마스크에서 <strong>검정(제외)</strong>으로 남겨야 합니다.
          </div>

          {/* 마스크 방법 선택 */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {([["upload", "직접 업로드"], ["sam2", "SAM 2 포인트"]] as const).map(([m, label]) => (
              <button key={m} type="button" disabled={loading}
                onClick={() => { setTextureMaskMethod(m); setSam2Points([]); setTextureMaskPreview(null); setTextureMaskBlob(null); }}
                style={{ padding: "6px 14px", borderRadius: 8, border: "2px solid", fontSize: 12, cursor: loading ? "default" : "pointer", borderColor: textureMaskMethod === m ? "var(--accent)" : "var(--line)", background: textureMaskMethod === m ? "var(--accent)" : "transparent", color: textureMaskMethod === m ? "#fff" : "var(--ink)", fontWeight: textureMaskMethod === m ? 700 : 400 }}>
                {label}
              </button>
            ))}
          </div>

          {/* 직접 업로드 */}
          {textureMaskMethod === "upload" && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 14, alignItems: "start" }}>
                <div>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>원본 이미지 A (참조용)</div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageAPreview!} alt="A" style={{ width: "100%", display: "block", borderRadius: 8, border: "1px solid var(--line)" }} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>질감 마스크 업로드</div>
                  <div style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 10, lineHeight: 1.6 }}>
                    포토샵/Photopea 등에서 이마·볼·팔자 주름 영역만 <strong>흰색</strong>으로, 눈·코·입은 <strong>검정</strong>으로 칠한 PNG를 업로드하세요.
                  </div>
                  <label htmlFor="textureMask_input" style={{ display: "inline-block", padding: "8px 16px", borderRadius: 8, border: "1px solid var(--line)", cursor: "pointer", fontSize: 12 }}>
                    마스크 파일 선택 (PNG 권장)
                  </label>
                  <input id="textureMask_input" type="file" accept="image/*" disabled={loading} style={{ display: "none" }} onChange={handleTextureMaskUpload} />
                </div>
              </div>
            </div>
          )}

          {/* SAM 2 포인트 */}
          {textureMaskMethod === "sam2" && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 8 }}>
                피부 영역(이마/볼/팔자)을 <span style={{ color: "#22c55e", fontWeight: 600 }}>좌클릭</span>,
                이목구비(눈/코/입) 주변을 <span style={{ color: "#ef4444", fontWeight: 600 }}>우클릭</span>
              </div>
              <div style={{ position: "relative", display: "inline-block", maxWidth: 320, width: "100%" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageAPreview!} alt="A" style={{ width: "100%", display: "block", borderRadius: 8, border: "1px solid var(--line)" }} />
                <div style={{ position: "absolute", inset: 0, cursor: "crosshair" }} onClick={handleSam2Click} onContextMenu={handleSam2RightClick}>
                  {sam2Points.map((p, i) => (
                    <div key={i} style={{ position: "absolute", left: `${(p.x / (imageADims?.w || 1)) * 100}%`, top: `${(p.y / (imageADims?.h || 1)) * 100}%`, width: 12, height: 12, borderRadius: "50%", background: p.label === 1 ? "#22c55e" : "#ef4444", border: "2px solid #fff", transform: "translate(-50%,-50%)", boxShadow: "0 1px 4px rgba(0,0,0,.4)", pointerEvents: "none" }} />
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button type="button" className="admin-btn" disabled={loading || sam2Points.filter(p => p.label === 1).length === 0} onClick={handleGenerateSam2TextureMask} style={{ fontSize: 12 }}>
                  SAM 2 마스크 생성 ({sam2Points.length}개)
                </button>
                {sam2Points.length > 0 && <button type="button" className="admin-btn admin-btn--ghost" disabled={loading} onClick={() => setSam2Points([])} style={{ fontSize: 12 }}>초기화</button>}
              </div>
            </div>
          )}

          {/* 마스크 미리보기 — SAM2 완료 후 또는 직접업로드 후 원본과 나란히 */}
          {textureMaskPreview && textureMaskMethod === "sam2" && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
                <div>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>원본 이미지 A</div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageAPreview!} alt="A" style={{ width: "100%", display: "block", borderRadius: 8, border: "1px solid var(--line)" }} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>질감 마스크 <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, background: "var(--line)" }}>흰색=복원 대상</span></div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={textureMaskPreview} alt="질감마스크" style={{ width: "100%", display: "block", borderRadius: 8, border: "1px solid var(--line)", marginBottom: 8 }} />
                  <a href={textureMaskPreview} download="texture-mask.png" className="admin-btn admin-btn--ghost" style={{ fontSize: 11, display: "inline-block" }}>마스크 저장</a>
                </div>
              </div>
            </div>
          )}
          {textureMaskPreview && textureMaskMethod === "upload" && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>업로드된 마스크 미리보기 <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, background: "var(--line)" }}>흰색=질감복원 대상</span></div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={textureMaskPreview} alt="질감마스크" style={{ maxWidth: 200, display: "block", borderRadius: 8, border: "1px solid var(--line)", marginBottom: 8 }} />
              <a href={textureMaskPreview} download="texture-mask.png" className="admin-btn admin-btn--ghost" style={{ fontSize: 11, display: "inline-block" }}>마스크 저장</a>
            </div>
          )}

          {loading && <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12 }}>{statusMsg}</div>}

          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="admin-btn admin-btn--ghost" onClick={() => setStep(1)} disabled={loading}>← 이전</button>
            <button type="button" className="admin-btn" onClick={goToStep3} disabled={loading || (!textureMaskPreview && !textureMaskUrl)}>다음 →</button>
          </div>
        </div>
      )}

      {/* ── STEP 3 ── */}
      {step === 3 && (
        <form ref={formStep3} onSubmit={handleTextureInpainting}>
          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)", marginBottom: 12 }}>STEP 3 — 질감 복원 인페인팅 (Strength 0.3~0.5)</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>이미지 A (입력)</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageAPreview!} alt="A" style={{ width: "100%", borderRadius: 8, border: "1px solid var(--line)", display: "block" }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>질감 마스크</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={textureMaskPreview!} alt="마스크" style={{ width: "100%", borderRadius: 8, border: "1px solid var(--line)", display: "block" }} />
            </div>
          </div>

          <div className="admin-form-group" style={{ marginBottom: 16 }}>
            <label className="admin-label">프롬프트 <span style={{ color: "#dc2626" }}>*</span></label>
            <textarea name="prompt" rows={3} disabled={loading} required
              defaultValue="photorealistic skin texture, natural wrinkles, realistic pores, subtle skin details, high quality portrait"
              style={{ width: "100%", boxSizing: "border-box", resize: "vertical" }} />
          </div>
          <div className="admin-form-group" style={{ marginBottom: 20 }}>
            <label className="admin-label">네거티브 프롬프트</label>
            <textarea name="negative_prompt" rows={2} disabled={loading}
              defaultValue="blur, oversmoothed skin, plastic skin, artifacts, bad quality"
              style={{ width: "100%", boxSizing: "border-box", resize: "vertical" }} />
          </div>

          <details style={{ marginBottom: 20, border: "1px solid var(--line)", borderRadius: 8, padding: "12px 16px" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 13 }}>모델 설정 (고급)</summary>
            <div style={{ fontSize: 12, color: "#f59e0b", marginTop: 10, marginBottom: 12, padding: "8px 12px", background: "#fefce8", borderRadius: 6 }}>
              ⚠️ Strength를 0.3~0.5로 낮춰야 이목구비가 유지됩니다. 높으면 이목구비가 변형됩니다.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="admin-form-group">
                <label className="admin-label">Model ID</label>
                <input name="model_id" type="text" defaultValue="realistic-vision-v51" disabled={loading} style={{ width: "100%", boxSizing: "border-box" }} />
              </div>
              <div className="admin-form-group">
                <label className="admin-label">Strength ← 0.3~0.5 권장</label>
                <input name="strength" type="number" min="0.1" max="1" step="0.05" defaultValue="0.4" disabled={loading} style={{ width: "100%", boxSizing: "border-box" }} />
              </div>
              <div className="admin-form-group">
                <label className="admin-label">Width</label>
                <input name="width" type="number" defaultValue="512" disabled={loading} style={{ width: "100%", boxSizing: "border-box" }} />
              </div>
              <div className="admin-form-group">
                <label className="admin-label">Height</label>
                <input name="height" type="number" defaultValue="768" disabled={loading} style={{ width: "100%", boxSizing: "border-box" }} />
              </div>
              <div className="admin-form-group">
                <label className="admin-label">Guidance Scale</label>
                <input name="guidance_scale" type="number" min="1" max="15" step="0.5" defaultValue="7" disabled={loading} style={{ width: "100%", boxSizing: "border-box" }} />
              </div>
              <div className="admin-form-group">
                <label className="admin-label">Inference Steps</label>
                <input name="num_inference_steps" type="number" min="10" max="50" defaultValue="31" disabled={loading} style={{ width: "100%", boxSizing: "border-box" }} />
              </div>
            </div>
          </details>

          {loading && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 8 }}>{statusMsg || `질감 복원 중… ${formatMmSs(elapsed)}`}</div>
              <div style={{ height: 6, background: "var(--line)", borderRadius: 4, overflow: "hidden", maxWidth: 400 }}>
                <div style={{ height: "100%", width: `${progress}%`, background: "var(--accent)", borderRadius: 4, transition: "width 1s linear" }} />
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="admin-btn admin-btn--ghost" onClick={() => setStep(2)} disabled={loading}>← 이전</button>
            <button type="submit" className="admin-btn" disabled={loading} style={{ minWidth: 160 }}>{loading ? "처리 중…" : "질감 복원 실행"}</button>
          </div>
        </form>
      )}

      {/* ── STEP 4 ── */}
      {step === 4 && (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)", marginBottom: 12 }}>STEP 4 — 이목구비 합성 (Sharp)</div>

          {/* 이미지 B 미리보기 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>이미지 B (질감 복원 결과)</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageBPreview!} alt="B" style={{ width: "100%", borderRadius: 8, border: "1px solid var(--line)", display: "block" }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>이미지 A (원본 이목구비)</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageAPreview!} alt="A" style={{ width: "100%", borderRadius: 8, border: "1px solid var(--line)", display: "block" }} />
            </div>
          </div>

          {/* 이목구비 마스크 선택 */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>이목구비 마스크 (흰색=눈·코·입 영역)</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {([["invert", "질감 마스크 자동 반전"], ["upload", "직접 업로드"]] as const).map(([m, label]) => (
                <button key={m} type="button" disabled={loading}
                  onClick={() => { setFeaturesMaskMethod(m); setFeaturesMaskPreview(null); setFeaturesMaskBlob(null); setFeaturesMaskUrl(""); }}
                  style={{ padding: "6px 14px", borderRadius: 8, border: "2px solid", fontSize: 12, cursor: loading ? "default" : "pointer", borderColor: featuresMaskMethod === m ? "var(--accent)" : "var(--line)", background: featuresMaskMethod === m ? "var(--accent)" : "transparent", color: featuresMaskMethod === m ? "#fff" : "var(--ink)", fontWeight: featuresMaskMethod === m ? 700 : 400 }}>
                  {label}
                </button>
              ))}
            </div>

            {featuresMaskMethod === "invert" && !featuresMaskPreview && (
              <button type="button" className="admin-btn" onClick={handleAutoInvertMask} disabled={loading || !textureMaskPreview} style={{ fontSize: 12 }}>
                질감 마스크 반전하여 이목구비 마스크 생성
              </button>
            )}

            {featuresMaskMethod === "upload" && (
              <div>
                <label htmlFor="featuresMask_input" style={{ display: "inline-block", padding: "8px 16px", borderRadius: 8, border: "1px solid var(--line)", cursor: "pointer", fontSize: 12 }}>
                  이목구비 마스크 파일 선택
                </label>
                <input id="featuresMask_input" type="file" accept="image/*" disabled={loading} style={{ display: "none" }} onChange={handleFeaturesMaskUpload} />
              </div>
            )}

            {featuresMaskPreview && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>이목구비 마스크 미리보기</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={featuresMaskPreview} alt="이목구비마스크" style={{ maxWidth: 240, display: "block", borderRadius: 8, border: "1px solid var(--line)", marginBottom: 8 }} />
                <a href={featuresMaskPreview} download="features-mask.png" className="admin-btn admin-btn--ghost" style={{ fontSize: 11, display: "inline-block" }}>마스크 저장</a>
              </div>
            )}
          </div>

          {loading && <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12 }}>{statusMsg}</div>}

          <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
            <button type="button" className="admin-btn admin-btn--ghost" onClick={() => setStep(3)} disabled={loading}>← 이전</button>
            <button type="button" className="admin-btn" onClick={handleComposite}
              disabled={loading || (!featuresMaskPreview && !featuresMaskUrl)}
              style={{ minWidth: 180 }}>
              {loading ? statusMsg || "합성 중…" : "Sharp 이목구비 합성 실행"}
            </button>
          </div>

          {/* 최종 결과 */}
          {finalResult && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", marginBottom: 10 }}>최종 합성 결과</div>
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={finalResult} alt="최종결과" style={{ maxWidth: 400, borderRadius: 8, border: "1px solid var(--line)", display: "block" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <a href={finalResult} target="_blank" rel="noreferrer" className="admin-btn" style={{ fontSize: 12 }}>원본 URL 열기</a>
                  <button type="button" className="admin-btn admin-btn--ghost" style={{ fontSize: 12 }} onClick={() => navigator.clipboard.writeText(finalResult)}>URL 복사</button>
                  <button type="button" className="admin-btn admin-btn--ghost" style={{ fontSize: 12 }} onClick={reset}>처음부터</button>
                </div>
              </div>
              <div style={{ marginTop: 10, fontSize: 11, color: "var(--ink-faint)", fontFamily: "monospace", wordBreak: "break-all" }}>{finalResult}</div>
            </div>
          )}
        </div>
      )}

      {/* 오류 */}
      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", fontSize: 13, marginTop: 16, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          {error}
        </div>
      )}
    </div>
  );
}
