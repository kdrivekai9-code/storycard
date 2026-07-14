"use client";

import { useState, useRef } from "react";
import {
  uploadOriginalPhoto,
  uploadImageA,
  uploadTextureMask,
  runSam2TextureMask,
  directTextureTransfer,
} from "./actions";

const MAX_DIM = 1024;

type Step = 1 | 2 | 3;
type MaskMethod = "upload" | "sam2";
type Point = { x: number; y: number; label: 1 | 0 };

function resizeFile(file: File): Promise<{ blob: Blob; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
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

/** SAM2 결과(밝은=선택 영역) → 그대로 흰색 유지 (피부 = 밝은 영역으로 선택) */
function sam2ToTextureMask(imageUrl: string): Promise<{ blob: Blob; previewUrl: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const ctx = cv.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const id = ctx.getImageData(0, 0, cv.width, cv.height);
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const b = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        const v = b > 128 ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
      }
      ctx.putImageData(id, 0, 0);
      const previewUrl = cv.toDataURL("image/png");
      cv.toBlob((b) => b ? resolve({ blob: b, previewUrl }) : reject(new Error("toBlob")), "image/png");
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
}

const STEPS = [
  { label: "STEP 1", desc: "이미지 업로드" },
  { label: "STEP 2", desc: "질감 마스크" },
  { label: "STEP 3", desc: "텍스처 전사" },
];

export function Test3Client() {
  const [step, setStep] = useState<Step>(1);

  // STEP 1
  const [origPreview,  setOrigPreview]  = useState<string | null>(null);
  const [origUrl,      setOrigUrl]      = useState("");
  const [imageAPreview, setImageAPreview] = useState<string | null>(null);
  const [imageAUrl,    setImageAUrl]    = useState("");
  const [imageADims,   setImageADims]   = useState<{ w: number; h: number } | null>(null);

  // STEP 2
  const [maskMethod,   setMaskMethod]   = useState<MaskMethod>("upload");
  const [maskPreview,  setMaskPreview]  = useState<string | null>(null);
  const [maskBlob,     setMaskBlob]     = useState<Blob | null>(null);
  const [maskUrl,      setMaskUrl]      = useState("");
  const [sam2Points,   setSam2Points]   = useState<Point[]>([]);

  // STEP 3
  const [blendStrength, setBlendStrength] = useState(0.7);
  const [useAutoAlign,  setUseAutoAlign]  = useState(true);
  const [resultUrl,     setResultUrl]     = useState<string | null>(null);

  // 공통
  const [loading,   setLoading]   = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [error,     setError]     = useState<string | null>(null);

  function err(msg: string) { setError(msg); setLoading(false); setStatusMsg(""); }

  // ── STEP 1 ──────────────────────────────────────────────────────────────
  async function handleOrigUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setError(null); setLoading(true); setStatusMsg("원본 사진 업로드 중…");
    try {
      const { blob } = await resizeFile(f);
      setOrigPreview(URL.createObjectURL(blob));
      const fd = new FormData();
      fd.append("original_photo", new File([blob], "original.jpg", { type: "image/jpeg" }));
      const res = await uploadOriginalPhoto(fd);
      if (!res.ok) { err(res.error); return; }
      setOrigUrl(res.originalUrl);
      setLoading(false); setStatusMsg("");
    } catch (e2) { err(String(e2)); }
  }

  async function handleImageAUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setError(null); setLoading(true); setStatusMsg("이미지 A 업로드 중…");
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

  // ── STEP 2: 직접 업로드 마스크 ─────────────────────────────────────────
  async function handleMaskUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setError(null); setLoading(true); setStatusMsg("마스크 업로드 중…");
    try {
      const fd = new FormData(); fd.append("texture_mask", f);
      const res = await uploadTextureMask(fd);
      if (!res.ok) { err(res.error); return; }
      setMaskUrl(res.textureMaskUrl);
      setMaskBlob(f);
      setMaskPreview(URL.createObjectURL(f));
      setLoading(false); setStatusMsg("");
    } catch (e2) { err(String(e2)); }
  }

  // ── STEP 2: SAM 2 포인트 ─────────────────────────────────────────────────
  function handleSam2Click(e: React.MouseEvent<HTMLDivElement>) {
    if (!imageADims || loading) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = Math.round(((e.clientX - rect.left) / rect.width) * imageADims.w);
    const py = Math.round(((e.clientY - rect.top) / rect.height) * imageADims.h);
    setSam2Points((p) => [...p, { x: px, y: py, label: 1 }]);
  }
  function handleSam2RightClick(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!imageADims || loading) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = Math.round(((e.clientX - rect.left) / rect.width) * imageADims.w);
    const py = Math.round(((e.clientY - rect.top) / rect.height) * imageADims.h);
    setSam2Points((p) => [...p, { x: px, y: py, label: 0 }]);
  }

  async function handleSam2Generate() {
    if (!imageAUrl || sam2Points.length === 0) return;
    setError(null); setLoading(true); setStatusMsg("SAM 2 마스크 생성 중…");
    try {
      const res = await runSam2TextureMask(imageAUrl, sam2Points);
      if (!res.ok) { err(res.error); return; }
      setStatusMsg("마스크 변환 중…");
      const { blob, previewUrl } = await sam2ToTextureMask(res.sam2RawUrl);
      setMaskBlob(blob);
      setMaskPreview(previewUrl);
      setMaskUrl("");
      setLoading(false); setStatusMsg("");
    } catch (e2) { err(String(e2)); }
  }

  // ── STEP 3: 텍스처 전사 실행 ─────────────────────────────────────────────
  async function handleTransfer() {
    if (!origUrl || !imageAUrl) { setError("원본 사진과 이미지 A가 모두 필요합니다."); return; }
    if (!maskUrl && !maskBlob) { setError("질감 마스크가 없습니다."); return; }
    setError(null); setLoading(true);

    let finalMaskUrl = maskUrl;

    if (!finalMaskUrl && maskBlob) {
      setStatusMsg("마스크 업로드 중…");
      try {
        const fd = new FormData();
        fd.append("texture_mask", new File([maskBlob], "mask.png", { type: "image/png" }));
        const res = await uploadTextureMask(fd);
        if (!res.ok) { err(res.error); return; }
        finalMaskUrl = res.textureMaskUrl;
        setMaskUrl(finalMaskUrl);
      } catch (e2) { err(String(e2)); return; }
    }

    setStatusMsg(useAutoAlign
      ? "BiRefNet 얼굴 정렬 중… (약 20-30초)"
      : "텍스처 전사 중…"
    );

    const res = await directTextureTransfer({
      originalUrl:    origUrl,
      imageAUrl,
      textureMaskUrl: finalMaskUrl,
      blendStrength,
      useAutoAlign,
    });

    if (!res.ok) { err(res.error); return; }
    setResultUrl(res.resultUrl);
    setLoading(false); setStatusMsg("");
  }

  function reset() {
    setStep(1);
    setOrigPreview(null); setOrigUrl("");
    setImageAPreview(null); setImageAUrl(""); setImageADims(null);
    setMaskPreview(null); setMaskBlob(null); setMaskUrl(""); setSam2Points([]);
    setBlendStrength(0.7); setUseAutoAlign(true);
    setResultUrl(null); setError(null); setLoading(false); setStatusMsg("");
  }

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
              {i < STEPS.length - 1 && <div style={{ position: "absolute", right: 0, top: 14, width: "50%", height: 2, background: step > n ? "var(--accent)" : "var(--line)" }} />}
              <div style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, zIndex: 1, background: active || done ? "var(--accent)" : "var(--line)", color: active || done ? "#fff" : "var(--ink-soft)" }}>
                {done ? "✓" : n}
              </div>
              <div style={{ fontSize: 10, color: active ? "var(--accent)" : done ? "var(--ink)" : "var(--ink-faint)", fontWeight: active ? 700 : 400, textAlign: "center" }}>{s.desc}</div>
            </div>
          );
        })}
      </div>

      {/* ── STEP 1: 이미지 업로드 ── */}
      {step === 1 && (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>STEP 1 — 두 이미지 업로드</div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 18, padding: "10px 14px", background: "var(--bg-soft)", borderRadius: 6, lineHeight: 1.8 }}>
            <strong>원본 사진</strong> — 보조개·주름·모공이 살아있는 스왑 전 원본 인물 사진<br />
            <strong>이미지 A</strong> — 페이스스왑 완료본 (텍스처가 뭉개진 결과물)
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
            {/* 원본 사진 */}
            <div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 8, fontWeight: 600 }}>원본 사진 (텍스처 소스)</div>
              <label htmlFor="orig_input" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", aspectRatio: "3/4", border: "2px dashed var(--line)", borderRadius: 8, overflow: "hidden", cursor: loading ? "default" : "pointer", background: "var(--bg-soft)", position: "relative" }}>
                {origPreview
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={origPreview} alt="원본" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: "var(--ink-faint)", fontSize: 13 }}><span style={{ fontSize: 36 }}>+</span><span>원본 사진 선택</span></div>}
              </label>
              <input id="orig_input" type="file" accept="image/*" disabled={loading} style={{ display: "none" }} onChange={handleOrigUpload} />
              {origUrl && <div style={{ marginTop: 6, fontSize: 11, color: "#22c55e" }}>✓ 업로드 완료</div>}
            </div>

            {/* 이미지 A */}
            <div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 8, fontWeight: 600 }}>이미지 A (스왑 완료본)</div>
              <label htmlFor="imageA_input" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", aspectRatio: "3/4", border: "2px dashed var(--line)", borderRadius: 8, overflow: "hidden", cursor: loading ? "default" : "pointer", background: "var(--bg-soft)", position: "relative" }}>
                {imageAPreview
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={imageAPreview} alt="A" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: "var(--ink-faint)", fontSize: 13 }}><span style={{ fontSize: 36 }}>+</span><span>이미지 A 선택</span></div>}
              </label>
              <input id="imageA_input" type="file" accept="image/*" disabled={loading} style={{ display: "none" }} onChange={handleImageAUpload} />
              {imageAUrl && <div style={{ marginTop: 6, fontSize: 11, color: "#22c55e" }}>✓ 업로드 완료</div>}
            </div>
          </div>

          {loading && <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12 }}>{statusMsg}</div>}
          <button type="button" className="admin-btn" disabled={loading || !origUrl || !imageAUrl}
            onClick={() => { setError(null); setStep(2); }} style={{ minWidth: 160 }}>
            다음 →
          </button>
        </div>
      )}

      {/* ── STEP 2: 질감 마스크 ── */}
      {step === 2 && (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>STEP 2 — 질감 마스크 생성 (이미지 A 기준)</div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 16, padding: "10px 14px", background: "var(--bg-soft)", borderRadius: 6, lineHeight: 1.8 }}>
            이마·볼·팔자 주름 등 <strong>피부 질감 영역</strong>만 <strong style={{ color: "#fff", background: "#555", padding: "0 4px", borderRadius: 3 }}>흰색</strong>으로 표시합니다.<br />
            눈·코·입 이목구비는 <strong style={{ color: "#fff", background: "#000", padding: "0 4px", borderRadius: 3 }}>검정</strong>으로 남겨야 원본 이목구비가 유지됩니다.<br />
            마스크는 <strong>이미지 A의 얼굴 위치 기준</strong>으로 만들어야 합니다.
          </div>

          {/* 방법 선택 */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {([["upload", "직접 업로드"], ["sam2", "SAM 2 포인트"]] as const).map(([m, label]) => (
              <button key={m} type="button" disabled={loading}
                onClick={() => { setMaskMethod(m); setSam2Points([]); setMaskPreview(null); setMaskBlob(null); setMaskUrl(""); }}
                style={{ padding: "6px 14px", borderRadius: 8, border: "2px solid", fontSize: 12, cursor: loading ? "default" : "pointer", borderColor: maskMethod === m ? "var(--accent)" : "var(--line)", background: maskMethod === m ? "var(--accent)" : "transparent", color: maskMethod === m ? "#fff" : "var(--ink)", fontWeight: maskMethod === m ? 700 : 400 }}>
                {label}
              </button>
            ))}
          </div>

          {/* 직접 업로드 */}
          {maskMethod === "upload" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16, alignItems: "start" }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>이미지 A 참조 (마스크 기준)</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageAPreview!} alt="A" style={{ width: "100%", display: "block", borderRadius: 8, border: "1px solid var(--line)" }} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>마스크 업로드</div>
                <div style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 10, lineHeight: 1.7 }}>
                  이미지 A 위에서 이마·볼·팔자 영역을 <strong>흰색</strong>,<br />
                  눈·코·입은 <strong>검정</strong>으로 칠한 PNG를 업로드하세요.
                </div>
                {maskPreview
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={maskPreview} alt="마스크" style={{ width: "100%", display: "block", borderRadius: 8, border: "1px solid var(--line)", marginBottom: 8 }} />
                  : (
                    <label htmlFor="mask_input" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", aspectRatio: "3/4", border: "2px dashed var(--line)", borderRadius: 8, cursor: "pointer", background: "var(--bg-soft)" }}>
                      <span style={{ fontSize: 28, color: "var(--ink-faint)" }}>+</span>
                      <span style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 6 }}>마스크 선택</span>
                    </label>
                  )}
                <input id="mask_input" type="file" accept="image/*" disabled={loading} style={{ display: "none" }} onChange={handleMaskUpload} />
                {maskPreview && <label htmlFor="mask_input" style={{ display: "inline-block", marginTop: 6, fontSize: 11, cursor: "pointer", color: "var(--accent)" }}>다시 선택</label>}
              </div>
            </div>
          )}

          {/* SAM 2 포인트 */}
          {maskMethod === "sam2" && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 8 }}>
                피부 영역(이마·볼·팔자)을 <span style={{ color: "#22c55e", fontWeight: 600 }}>좌클릭</span>,
                이목구비 주변을 <span style={{ color: "#ef4444", fontWeight: 600 }}>우클릭</span>으로 제외합니다.
              </div>
              <div style={{ position: "relative", display: "inline-block", maxWidth: 340, width: "100%" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageAPreview!} alt="A" style={{ width: "100%", display: "block", borderRadius: 8, border: "1px solid var(--line)" }} />
                <div style={{ position: "absolute", inset: 0, cursor: "crosshair" }} onClick={handleSam2Click} onContextMenu={handleSam2RightClick}>
                  {sam2Points.map((p, i) => (
                    <div key={i} style={{ position: "absolute", left: `${(p.x / (imageADims?.w || 1)) * 100}%`, top: `${(p.y / (imageADims?.h || 1)) * 100}%`, width: 12, height: 12, borderRadius: "50%", background: p.label === 1 ? "#22c55e" : "#ef4444", border: "2px solid #fff", transform: "translate(-50%,-50%)", boxShadow: "0 1px 4px rgba(0,0,0,.5)", pointerEvents: "none" }} />
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button type="button" className="admin-btn" disabled={loading || sam2Points.filter(p => p.label === 1).length === 0} onClick={handleSam2Generate} style={{ fontSize: 12 }}>
                  SAM 2 마스크 생성 ({sam2Points.length}개 포인트)
                </button>
                {sam2Points.length > 0 && <button type="button" className="admin-btn admin-btn--ghost" disabled={loading} onClick={() => setSam2Points([])} style={{ fontSize: 12 }}>초기화</button>}
              </div>

              {/* SAM2 결과 미리보기 */}
              {maskPreview && (
                <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "start" }}>
                  <div>
                    <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>이미지 A</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageAPreview!} alt="A" style={{ width: "100%", display: "block", borderRadius: 8, border: "1px solid var(--line)" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>질감 마스크 <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: "var(--line)" }}>흰색=복원 대상</span></div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={maskPreview} alt="마스크" style={{ width: "100%", display: "block", borderRadius: 8, border: "1px solid var(--line)", marginBottom: 8 }} />
                    <a href={maskPreview} download="texture-mask.png" className="admin-btn admin-btn--ghost" style={{ fontSize: 11, display: "inline-block" }}>마스크 저장</a>
                  </div>
                </div>
              )}
            </div>
          )}

          {loading && <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12 }}>{statusMsg}</div>}

          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button type="button" className="admin-btn admin-btn--ghost" onClick={() => setStep(1)} disabled={loading}>← 이전</button>
            <button type="button" className="admin-btn" disabled={loading || (!maskPreview && !maskUrl)}
              onClick={() => { setError(null); setStep(3); }}>
              다음 →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: 텍스처 전사 ── */}
      {step === 3 && (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>STEP 3 — Sharp 직접 텍스처 전사</div>

          {/* 이미지 확인 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 5 }}>원본 사진 (텍스처 소스)</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={origPreview!} alt="원본" style={{ width: "100%", borderRadius: 7, border: "1px solid var(--line)", display: "block" }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 5 }}>이미지 A (스왑 완료본)</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageAPreview!} alt="A" style={{ width: "100%", borderRadius: 7, border: "1px solid var(--line)", display: "block" }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 5 }}>질감 마스크</div>
              {maskPreview
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={maskPreview} alt="마스크" style={{ width: "100%", borderRadius: 7, border: "1px solid var(--line)", display: "block" }} />
                : <div style={{ width: "100%", aspectRatio: "3/4", background: "var(--bg-soft)", borderRadius: 7, border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--ink-faint)" }}>URL만 업로드됨</div>}
            </div>
          </div>

          {/* 설정 */}
          <div style={{ padding: "16px 18px", background: "var(--bg-soft)", borderRadius: 8, border: "1px solid var(--line)", marginBottom: 20 }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>
                블렌드 강도 — <span style={{ color: "var(--accent)" }}>{Math.round(blendStrength * 100)}%</span>
                <span style={{ fontSize: 11, color: "var(--ink-faint)", fontWeight: 400, marginLeft: 8 }}>낮을수록 원본 텍스처 영향 감소</span>
              </label>
              <input type="range" min={10} max={100} value={Math.round(blendStrength * 100)}
                onChange={(e) => setBlendStrength(parseInt(e.target.value) / 100)}
                disabled={loading} style={{ width: "100%", accentColor: "var(--accent)" }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--ink-faint)", marginTop: 2 }}>
                <span>10% (미세)</span><span>50% (중간)</span><span>100% (강함)</span>
              </div>
            </div>

            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: loading ? "default" : "pointer" }}>
              <input type="checkbox" checked={useAutoAlign} onChange={(e) => setUseAutoAlign(e.target.checked)} disabled={loading} style={{ marginTop: 2, accentColor: "var(--accent)", width: 14, height: 14 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>BiRefNet 자동 얼굴 정렬 (권장)</div>
                <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 3, lineHeight: 1.6 }}>
                  두 이미지에서 인물 영역을 자동 감지해 원본 얼굴을 이미지 A 얼굴 위치에 정렬합니다.<br />
                  처리 시간 약 20-30초 추가. 구도가 다른 사진일수록 필요합니다.
                </div>
              </div>
            </label>

            {!useAutoAlign && (
              <div style={{ marginTop: 12, fontSize: 12, color: "#f59e0b", padding: "8px 12px", background: "#fefce8", borderRadius: 6 }}>
                ⚠️ 자동 정렬 없이 단순 리사이즈만 적용됩니다. 두 사진의 구도·얼굴 크기가 비슷할 때만 유효합니다.
              </div>
            )}
          </div>

          {/* 텍스처 전사 원리 설명 */}
          <details style={{ marginBottom: 20, border: "1px solid var(--line)", borderRadius: 8, padding: "10px 14px" }}>
            <summary style={{ fontSize: 12, cursor: "pointer", color: "var(--ink-soft)" }}>작동 방식 설명</summary>
            <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 10, lineHeight: 1.8 }}>
              1. 원본 사진을 BiRefNet으로 배경 제거 → 인물 바운딩박스 감지<br />
              2. 이미지 A도 동일하게 인물 바운딩박스 감지<br />
              3. 원본 얼굴 영역을 이미지 A 얼굴 크기·위치로 리사이즈 후 배치<br />
              4. 질감 마스크(흰색 영역)에만 <strong>soft-light 블렌드</strong> 적용<br />
              → 원본의 보조개·주름·모공 등 명암 패턴이 이미지 A에 전사됩니다<br />
              → 이목구비(검정 영역)는 마스크로 차단되어 이미지 A 그대로 유지
            </div>
          </details>

          {loading && (
            <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 16, padding: "10px 14px", background: "var(--bg-soft)", borderRadius: 6 }}>
              ⏳ {statusMsg}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
            <button type="button" className="admin-btn admin-btn--ghost" onClick={() => setStep(2)} disabled={loading}>← 이전</button>
            <button type="button" className="admin-btn" onClick={handleTransfer} disabled={loading} style={{ minWidth: 200 }}>
              {loading ? "처리 중…" : "텍스처 전사 실행"}
            </button>
          </div>

          {/* 결과 */}
          {resultUrl && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>텍스처 전사 결과</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 5 }}>원본 (텍스처 소스)</div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={origPreview!} alt="원본" style={{ width: "100%", borderRadius: 7, border: "1px solid var(--line)", display: "block" }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 5 }}>이미지 A (스왑 완료본)</div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageAPreview!} alt="A" style={{ width: "100%", borderRadius: 7, border: "1px solid var(--line)", display: "block" }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 5 }}>결과 (텍스처 전사 후)</div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={resultUrl} alt="결과" style={{ width: "100%", borderRadius: 7, border: "2px solid var(--accent)", display: "block" }} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <a href={resultUrl} target="_blank" rel="noreferrer" className="admin-btn" style={{ fontSize: 12 }}>원본 URL 열기</a>
                <button type="button" className="admin-btn admin-btn--ghost" style={{ fontSize: 12 }} onClick={() => navigator.clipboard.writeText(resultUrl)}>URL 복사</button>
                <button type="button" className="admin-btn admin-btn--ghost" style={{ fontSize: 12 }} onClick={() => { setResultUrl(null); }}>다시 시도 (설정 유지)</button>
                <button type="button" className="admin-btn admin-btn--ghost" style={{ fontSize: 12 }} onClick={reset}>처음부터</button>
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--ink-faint)", fontFamily: "monospace", wordBreak: "break-all" }}>{resultUrl}</div>
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
