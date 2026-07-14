"use client";

import { useState } from "react";
import {
  uploadOriginalPhoto,
  uploadImageA,
  uploadTextureMask,
  runSam2TextureMask,
  directTextureTransfer,
  type EyePoint,
} from "./actions";

const MAX_DIM = 1024;
type Step = 1 | 2 | 3 | 4;
type MaskMethod = "upload" | "sam2";
type SAMPoint = { x: number; y: number; label: 1 | 0 };

function resizeFile(file: File): Promise<{ blob: Blob; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      cv.getContext("2d")!.drawImage(img, 0, 0, w, h);
      cv.toBlob((b) => b ? resolve({ blob: b, w, h }) : reject(new Error("resize 실패")), "image/jpeg", 0.92);
    };
    img.onerror = reject; img.src = url;
  });
}

function sam2ToTextureMask(url: string): Promise<{ blob: Blob; previewUrl: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = () => {
      const cv = document.createElement("canvas"); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const ctx = cv.getContext("2d")!; ctx.drawImage(img, 0, 0);
      const id = ctx.getImageData(0, 0, cv.width, cv.height); const d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const b = d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114;
        const v = b > 128 ? 255 : 0; d[i] = d[i+1] = d[i+2] = v; d[i+3] = 255;
      }
      ctx.putImageData(id, 0, 0);
      const previewUrl = cv.toDataURL("image/png");
      cv.toBlob((b) => b ? resolve({ blob: b, previewUrl }) : reject(new Error("toBlob")), "image/png");
    };
    img.onerror = reject; img.src = url;
  });
}

const STEPS = [
  { desc: "이미지 업로드" }, { desc: "얼굴 정렬 포인트" },
  { desc: "질감 마스크" },   { desc: "텍스처 전사" },
];

export function Test3Client() {
  const [step, setStep] = useState<Step>(1);

  // STEP 1
  const [origPreview,   setOrigPreview]   = useState<string | null>(null);
  const [origUrl,       setOrigUrl]       = useState("");
  const [origDims,      setOrigDims]      = useState<{ w: number; h: number } | null>(null);
  const [imageAPreview, setImageAPreview] = useState<string | null>(null);
  const [imageAUrl,     setImageAUrl]     = useState("");
  const [imageADims,    setImageADims]    = useState<{ w: number; h: number } | null>(null);

  // STEP 2 — 눈 랜드마크
  const [origEyes,     setOrigEyes]     = useState<{ left: EyePoint | null; right: EyePoint | null }>({ left: null, right: null });
  const [imageAEyes,   setImageAEyes]   = useState<{ left: EyePoint | null; right: EyePoint | null }>({ left: null, right: null });
  const [skipAlign,    setSkipAlign]    = useState(false);

  // STEP 3 — 질감 마스크
  const [maskMethod,   setMaskMethod]   = useState<MaskMethod>("upload");
  const [maskPreview,  setMaskPreview]  = useState<string | null>(null);
  const [maskBlob,     setMaskBlob]     = useState<Blob | null>(null);
  const [maskUrl,      setMaskUrl]      = useState("");
  const [sam2Points,   setSam2Points]   = useState<SAMPoint[]>([]);

  // STEP 4 — 설정
  const [blendStrength,  setBlendStrength]  = useState(0.7);
  const [highPassRadius, setHighPassRadius] = useState(3);
  const [colorMatch,     setColorMatch]     = useState(true);
  const [resultUrl,      setResultUrl]      = useState<string | null>(null);

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
      const { blob, w, h } = await resizeFile(f);
      setOrigPreview(URL.createObjectURL(blob)); setOrigDims({ w, h });
      const fd = new FormData(); fd.append("original_photo", new File([blob], "orig.jpg", { type: "image/jpeg" }));
      const res = await uploadOriginalPhoto(fd);
      if (!res.ok) { err(res.error); return; }
      setOrigUrl(res.originalUrl); setLoading(false); setStatusMsg("");
    } catch (e2) { err(String(e2)); }
  }

  async function handleImageAUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setError(null); setLoading(true); setStatusMsg("이미지 A 업로드 중…");
    try {
      const { blob, w, h } = await resizeFile(f);
      setImageAPreview(URL.createObjectURL(blob)); setImageADims({ w, h });
      const fd = new FormData(); fd.append("image_a", new File([blob], "imageA.jpg", { type: "image/jpeg" }));
      const res = await uploadImageA(fd);
      if (!res.ok) { err(res.error); return; }
      setImageAUrl(res.imageAUrl); setLoading(false); setStatusMsg("");
    } catch (e2) { err(String(e2)); }
  }

  // ── STEP 2 — 눈 포인트 클릭 ─────────────────────────────────────────────
  function handleOrigClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!origDims) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = Math.round(((e.clientX - rect.left) / rect.width)  * origDims.w);
    const py = Math.round(((e.clientY - rect.top)  / rect.height) * origDims.h);
    setOrigEyes(prev =>
      !prev.left  ? { left: { x: px, y: py }, right: null } :
      !prev.right ? { ...prev, right: { x: px, y: py } }   : { left: { x: px, y: py }, right: null }
    );
  }
  function handleImageAClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!imageADims) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = Math.round(((e.clientX - rect.left) / rect.width)  * imageADims.w);
    const py = Math.round(((e.clientY - rect.top)  / rect.height) * imageADims.h);
    setImageAEyes(prev =>
      !prev.left  ? { left: { x: px, y: py }, right: null } :
      !prev.right ? { ...prev, right: { x: px, y: py } }   : { left: { x: px, y: py }, right: null }
    );
  }

  const eyesComplete = skipAlign ||
    (!!origEyes.left && !!origEyes.right && !!imageAEyes.left && !!imageAEyes.right);

  // ── STEP 3 — 마스크 ──────────────────────────────────────────────────────
  async function handleMaskUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setError(null); setLoading(true); setStatusMsg("마스크 업로드 중…");
    try {
      const fd = new FormData(); fd.append("texture_mask", f);
      const res = await uploadTextureMask(fd);
      if (!res.ok) { err(res.error); return; }
      setMaskUrl(res.textureMaskUrl); setMaskBlob(f); setMaskPreview(URL.createObjectURL(f));
      setLoading(false); setStatusMsg("");
    } catch (e2) { err(String(e2)); }
  }

  function handleSam2Click(e: React.MouseEvent<HTMLDivElement>) {
    if (!imageADims || loading) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = Math.round(((e.clientX - rect.left) / rect.width)  * imageADims.w);
    const py = Math.round(((e.clientY - rect.top)  / rect.height) * imageADims.h);
    setSam2Points(p => [...p, { x: px, y: py, label: 1 }]);
  }
  function handleSam2RightClick(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault(); if (!imageADims || loading) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = Math.round(((e.clientX - rect.left) / rect.width)  * imageADims.w);
    const py = Math.round(((e.clientY - rect.top)  / rect.height) * imageADims.h);
    setSam2Points(p => [...p, { x: px, y: py, label: 0 }]);
  }
  async function handleSam2Generate() {
    if (!imageAUrl || sam2Points.length === 0) return;
    setError(null); setLoading(true); setStatusMsg("SAM 2 마스크 생성 중…");
    try {
      const res = await runSam2TextureMask(imageAUrl, sam2Points);
      if (!res.ok) { err(res.error); return; }
      const { blob, previewUrl } = await sam2ToTextureMask(res.sam2RawUrl);
      setMaskBlob(blob); setMaskPreview(previewUrl); setMaskUrl("");
      setLoading(false); setStatusMsg("");
    } catch (e2) { err(String(e2)); }
  }

  // ── STEP 4 — 텍스처 전사 실행 ───────────────────────────────────────────
  async function handleTransfer() {
    setError(null); setLoading(true);

    // 마스크 URL 확보
    let finalMaskUrl = maskUrl;
    if (!finalMaskUrl && maskBlob) {
      setStatusMsg("마스크 업로드 중…");
      const fd = new FormData(); fd.append("texture_mask", new File([maskBlob], "mask.png", { type: "image/png" }));
      const res = await uploadTextureMask(fd);
      if (!res.ok) { err(res.error); return; }
      finalMaskUrl = res.textureMaskUrl; setMaskUrl(finalMaskUrl);
    }

    setStatusMsg(
      !skipAlign && origEyes.left
        ? "얼굴 정렬 + 텍스처 전사 중…"
        : "BiRefNet 정렬 + 텍스처 전사 중… (약 20-30초)"
    );

    const res = await directTextureTransfer({
      originalUrl:    origUrl,
      imageAUrl,
      textureMaskUrl: finalMaskUrl,
      blendStrength,
      highPassRadius,
      colorMatch,
      origDims:      origDims  ?? undefined,
      imageADims:    imageADims ?? undefined,
      origLeftEye:   skipAlign ? undefined : origEyes.left  ?? undefined,
      origRightEye:  skipAlign ? undefined : origEyes.right ?? undefined,
      imageALeftEye: skipAlign ? undefined : imageAEyes.left  ?? undefined,
      imageARightEye: skipAlign ? undefined : imageAEyes.right ?? undefined,
    });

    if (!res.ok) { err(res.error); return; }
    setResultUrl(res.resultUrl);
    setLoading(false); setStatusMsg("");
  }

  function reset() {
    setStep(1);
    setOrigPreview(null); setOrigUrl(""); setOrigDims(null);
    setImageAPreview(null); setImageAUrl(""); setImageADims(null);
    setOrigEyes({ left: null, right: null }); setImageAEyes({ left: null, right: null }); setSkipAlign(false);
    setMaskPreview(null); setMaskBlob(null); setMaskUrl(""); setSam2Points([]);
    setResultUrl(null); setError(null); setLoading(false); setStatusMsg("");
  }

  // ── 헬퍼 컴포넌트 ────────────────────────────────────────────────────────

  function EyeDot({ dims, eyes, labelStr }: { dims: { w: number; h: number } | null; eyes: { left: EyePoint | null; right: EyePoint | null }; labelStr: string }) {
    return (
      <>
        {eyes.left && (
          <div style={{ position: "absolute", left: `${(eyes.left.x / (dims?.w || 1)) * 100}%`, top: `${(eyes.left.y / (dims?.h || 1)) * 100}%`, transform: "translate(-50%,-50%)", pointerEvents: "none" }}>
            <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#22c55e", border: "2px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,.5)" }} />
            <div style={{ fontSize: 9, color: "#fff", background: "#22c55e", borderRadius: 3, padding: "0 3px", position: "absolute", top: 18, left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap" }}>{labelStr} 왼쪽 눈</div>
          </div>
        )}
        {eyes.right && (
          <div style={{ position: "absolute", left: `${(eyes.right.x / (dims?.w || 1)) * 100}%`, top: `${(eyes.right.y / (dims?.h || 1)) * 100}%`, transform: "translate(-50%,-50%)", pointerEvents: "none" }}>
            <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#3b82f6", border: "2px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,.5)" }} />
            <div style={{ fontSize: 9, color: "#fff", background: "#3b82f6", borderRadius: 3, padding: "0 3px", position: "absolute", top: 18, left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap" }}>{labelStr} 오른쪽 눈</div>
          </div>
        )}
      </>
    );
  }

  return (
    <div>
      {/* 스텝 인디케이터 */}
      <div style={{ display: "flex", gap: 0, marginBottom: 28 }}>
        {STEPS.map((s, i) => {
          const n = (i + 1) as Step;
          const active = step === n, done = step > n;
          return (
            <div key={n} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, position: "relative" }}>
              {i > 0 && <div style={{ position: "absolute", left: 0, top: 14, width: "50%", height: 2, background: done ? "var(--accent)" : "var(--line)" }} />}
              {i < 3 && <div style={{ position: "absolute", right: 0, top: 14, width: "50%", height: 2, background: step > n ? "var(--accent)" : "var(--line)" }} />}
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
          <div style={{ fontSize: 12, color: "var(--ink-soft)", padding: "10px 14px", background: "var(--bg-soft)", borderRadius: 6, marginBottom: 18, lineHeight: 1.8 }}>
            <strong>원본 사진</strong> — 보조개·주름이 살아있는 스왑 <em>전</em> 인물 사진 (텍스처 소스)<br />
            <strong>이미지 A</strong> — 페이스스왑 완료본 (텍스처가 뭉개진 결과물, 텍스처 복원 대상)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
            {[
              { id: "orig_input", label: "원본 사진 (텍스처 소스)", preview: origPreview, done: !!origUrl, handler: handleOrigUpload },
              { id: "a_input",    label: "이미지 A (스왑 완료본)", preview: imageAPreview, done: !!imageAUrl, handler: handleImageAUpload },
            ].map(({ id, label, preview, done, handler }) => (
              <div key={id}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 8 }}>{label}</div>
                <label htmlFor={id} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", aspectRatio: "3/4", border: "2px dashed var(--line)", borderRadius: 8, overflow: "hidden", cursor: loading ? "default" : "pointer", background: "var(--bg-soft)", position: "relative" }}>
                  {preview
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={preview} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: "var(--ink-faint)", fontSize: 13 }}><span style={{ fontSize: 36 }}>+</span><span>파일 선택</span></div>}
                </label>
                <input id={id} type="file" accept="image/*" disabled={loading} style={{ display: "none" }} onChange={handler} />
                {done && <div style={{ fontSize: 11, color: "#22c55e", marginTop: 5 }}>✓ 업로드 완료</div>}
              </div>
            ))}
          </div>
          {loading && <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12 }}>{statusMsg}</div>}
          <button type="button" className="admin-btn" disabled={loading || !origUrl || !imageAUrl} onClick={() => { setError(null); setStep(2); }}>다음 →</button>
        </div>
      )}

      {/* ── STEP 2: 얼굴 정렬 포인트 ── */}
      {step === 2 && (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>STEP 2 — 얼굴 정렬 포인트</div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", padding: "10px 14px", background: "var(--bg-soft)", borderRadius: 6, marginBottom: 16, lineHeight: 1.8 }}>
            두 이미지에서 <span style={{ color: "#22c55e", fontWeight: 600 }}>왼쪽 눈</span>(클릭 1) →
            <span style={{ color: "#3b82f6", fontWeight: 600 }}> 오른쪽 눈</span>(클릭 2) 순서로 클릭하세요.<br />
            이 4개 포인트로 얼굴 각도·크기·위치를 정밀 정렬합니다.
            3번째 클릭 시 왼쪽 눈부터 다시 시작합니다.
          </div>

          {skipAlign && (
            <div style={{ fontSize: 12, color: "#f59e0b", padding: "8px 12px", background: "#fefce8", borderRadius: 6, marginBottom: 14 }}>
              ⚠️ 건너뜀 — BiRefNet 바운딩박스로 자동 정렬합니다 (정확도 낮음).
              <button type="button" style={{ marginLeft: 10, fontSize: 11, color: "var(--accent)", background: "none", border: "none", cursor: "pointer" }} onClick={() => setSkipAlign(false)}>취소</button>
            </div>
          )}

          {!skipAlign && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              {/* 원본 사진 */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 6 }}>
                  원본 사진
                  <span style={{ marginLeft: 8, fontSize: 11, color: "var(--ink-faint)", fontWeight: 400 }}>
                    {!origEyes.left ? "👆 왼쪽 눈 클릭" : !origEyes.right ? "👆 오른쪽 눈 클릭" : "✓ 완료"}
                  </span>
                </div>
                <div style={{ position: "relative", display: "block" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={origPreview!} alt="원본" style={{ width: "100%", display: "block", borderRadius: 8, border: "1px solid var(--line)", cursor: "crosshair" }} onClick={handleOrigClick} />
                  <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                    <EyeDot dims={origDims} eyes={origEyes} labelStr="원본" />
                  </div>
                </div>
                {(origEyes.left || origEyes.right) && (
                  <button type="button" className="admin-btn admin-btn--ghost" style={{ fontSize: 11, marginTop: 6 }} onClick={() => setOrigEyes({ left: null, right: null })}>초기화</button>
                )}
              </div>

              {/* 이미지 A */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 6 }}>
                  이미지 A
                  <span style={{ marginLeft: 8, fontSize: 11, color: "var(--ink-faint)", fontWeight: 400 }}>
                    {!imageAEyes.left ? "👆 왼쪽 눈 클릭" : !imageAEyes.right ? "👆 오른쪽 눈 클릭" : "✓ 완료"}
                  </span>
                </div>
                <div style={{ position: "relative", display: "block" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageAPreview!} alt="A" style={{ width: "100%", display: "block", borderRadius: 8, border: "1px solid var(--line)", cursor: "crosshair" }} onClick={handleImageAClick} />
                  <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                    <EyeDot dims={imageADims} eyes={imageAEyes} labelStr="A" />
                  </div>
                </div>
                {(imageAEyes.left || imageAEyes.right) && (
                  <button type="button" className="admin-btn admin-btn--ghost" style={{ fontSize: 11, marginTop: 6 }} onClick={() => setImageAEyes({ left: null, right: null })}>초기화</button>
                )}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="admin-btn admin-btn--ghost" onClick={() => setStep(1)}>← 이전</button>
            {!skipAlign && (
              <button type="button" className="admin-btn admin-btn--ghost" style={{ fontSize: 12 }} onClick={() => setSkipAlign(true)}>
                건너뛰기 (BiRefNet 자동 정렬)
              </button>
            )}
            <button type="button" className="admin-btn" disabled={!eyesComplete} onClick={() => { setError(null); setStep(3); }}>다음 →</button>
          </div>
        </div>
      )}

      {/* ── STEP 3: 질감 마스크 ── */}
      {step === 3 && (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>STEP 3 — 질감 마스크 (이미지 A 기준)</div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", padding: "10px 14px", background: "var(--bg-soft)", borderRadius: 6, marginBottom: 16, lineHeight: 1.8 }}>
            이마·볼·팔자를 <strong style={{ background: "#555", color: "#fff", padding: "0 4px", borderRadius: 3 }}>흰색</strong>,
            눈·코·입을 <strong style={{ background: "#000", color: "#fff", padding: "0 4px", borderRadius: 3 }}>검정</strong>으로 표시.
            <strong> 이미지 A의 얼굴 위치 기준</strong>으로 마스크를 만드세요.
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {([["upload", "직접 업로드"], ["sam2", "SAM 2 포인트"]] as const).map(([m, lbl]) => (
              <button key={m} type="button" disabled={loading}
                onClick={() => { setMaskMethod(m); setSam2Points([]); setMaskPreview(null); setMaskBlob(null); setMaskUrl(""); }}
                style={{ padding: "6px 14px", borderRadius: 8, border: "2px solid", fontSize: 12, cursor: loading ? "default" : "pointer", borderColor: maskMethod === m ? "var(--accent)" : "var(--line)", background: maskMethod === m ? "var(--accent)" : "transparent", color: maskMethod === m ? "#fff" : "var(--ink)", fontWeight: maskMethod === m ? 700 : 400 }}>
                {lbl}
              </button>
            ))}
          </div>

          {maskMethod === "upload" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>이미지 A 참조</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageAPreview!} alt="A" style={{ width: "100%", display: "block", borderRadius: 8, border: "1px solid var(--line)" }} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>마스크 업로드</div>
                <div style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 8, lineHeight: 1.6 }}>이마·볼·팔자 → 흰색<br />눈·코·입 → 검정 (PNG)</div>
                {maskPreview
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={maskPreview} alt="마스크" style={{ width: "100%", display: "block", borderRadius: 8, border: "1px solid var(--line)", marginBottom: 6 }} />
                  : <label htmlFor="mask_input" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", aspectRatio: "3/4", border: "2px dashed var(--line)", borderRadius: 8, cursor: "pointer", background: "var(--bg-soft)" }}>
                      <span style={{ fontSize: 28, color: "var(--ink-faint)" }}>+</span>
                      <span style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 6 }}>마스크 선택</span>
                    </label>}
                <input id="mask_input" type="file" accept="image/*" disabled={loading} style={{ display: "none" }} onChange={handleMaskUpload} />
                {maskPreview && <label htmlFor="mask_input" style={{ fontSize: 11, color: "var(--accent)", cursor: "pointer" }}>다시 선택</label>}
              </div>
            </div>
          )}

          {maskMethod === "sam2" && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 8 }}>
                피부 영역 <span style={{ color: "#22c55e", fontWeight: 600 }}>좌클릭</span> / 제외 영역 <span style={{ color: "#ef4444", fontWeight: 600 }}>우클릭</span>
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
                  SAM 2 마스크 생성 ({sam2Points.length}개)
                </button>
                {sam2Points.length > 0 && <button type="button" className="admin-btn admin-btn--ghost" disabled={loading} style={{ fontSize: 12 }} onClick={() => setSam2Points([])}>초기화</button>}
              </div>
              {maskPreview && (
                <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div><div style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 5 }}>이미지 A</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageAPreview!} alt="A" style={{ width: "100%", display: "block", borderRadius: 8, border: "1px solid var(--line)" }} /></div>
                  <div><div style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 5 }}>질감 마스크</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={maskPreview} alt="마스크" style={{ width: "100%", display: "block", borderRadius: 8, border: "1px solid var(--line)", marginBottom: 6 }} />
                    <a href={maskPreview} download="texture-mask.png" className="admin-btn admin-btn--ghost" style={{ fontSize: 11, display: "inline-block" }}>마스크 저장</a></div>
                </div>
              )}
            </div>
          )}

          {loading && <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12 }}>{statusMsg}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button type="button" className="admin-btn admin-btn--ghost" onClick={() => setStep(2)} disabled={loading}>← 이전</button>
            <button type="button" className="admin-btn" disabled={loading || (!maskPreview && !maskUrl)} onClick={() => { setError(null); setStep(4); }}>다음 →</button>
          </div>
        </div>
      )}

      {/* ── STEP 4: 텍스처 전사 설정 + 실행 ── */}
      {step === 4 && (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14 }}>STEP 4 — 텍스처 전사 설정</div>

          {/* 3열 이미지 확인 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
            {[
              { label: "원본 (텍스처 소스)", src: origPreview! },
              { label: "이미지 A (스왑 완료본)", src: imageAPreview! },
              { label: "질감 마스크", src: maskPreview },
            ].map(({ label, src }) => (
              <div key={label}>
                <div style={{ fontSize: 10, color: "var(--ink-soft)", marginBottom: 4 }}>{label}</div>
                {src
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={src} alt={label} style={{ width: "100%", borderRadius: 6, border: "1px solid var(--line)", display: "block" }} />
                  : <div style={{ width: "100%", aspectRatio: "3/4", background: "var(--bg-soft)", borderRadius: 6, border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "var(--ink-faint)" }}>업로드됨</div>}
              </div>
            ))}
          </div>

          {/* 설정 패널 */}
          <div style={{ padding: "18px 20px", background: "var(--bg-soft)", borderRadius: 8, border: "1px solid var(--line)", marginBottom: 20 }}>

            {/* 블렌드 강도 */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>
                블렌드 강도 — <span style={{ color: "var(--accent)" }}>{Math.round(blendStrength * 100)}%</span>
                <span style={{ fontSize: 11, color: "var(--ink-faint)", fontWeight: 400, marginLeft: 8 }}>높을수록 텍스처 강하게 전사</span>
              </label>
              <input type="range" min={10} max={100} value={Math.round(blendStrength * 100)}
                onChange={e => setBlendStrength(parseInt(e.target.value) / 100)}
                disabled={loading} style={{ width: "100%", accentColor: "var(--accent)" }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--ink-faint)" }}>
                <span>10% 미세</span><span>70% 권장</span><span>100% 강함</span>
              </div>
            </div>

            {/* 하이패스 반경 */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 8 }}>
                High-Pass Radius — <span style={{ color: "var(--accent)" }}>{highPassRadius}</span>
                <span style={{ fontSize: 11, color: "var(--ink-faint)", fontWeight: 400, marginLeft: 8 }}>
                  {highPassRadius <= 2 ? "모공·미세결 (매우 세밀)" : highPassRadius <= 4 ? "일반 피부결" : highPassRadius <= 6 ? "주름·팔자" : "깊은 주름·보조개"}
                </span>
              </label>
              <input type="range" min={1} max={10} step={1} value={highPassRadius}
                onChange={e => setHighPassRadius(parseInt(e.target.value))}
                disabled={loading} style={{ width: "100%", accentColor: "var(--accent)" }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--ink-faint)" }}>
                <span>1 (모공)</span><span>3~5 (피부결)</span><span>10 (주름)</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 6, lineHeight: 1.6 }}>
                원본 이미지를 이 반경으로 Gaussian blur 후 빼기 → 해당 크기의 텍스처만 남습니다.<br />
                보조개처럼 큰 특징은 높은 값(6~8), 모공은 낮은 값(1~3)을 사용하세요.
              </div>
            </div>

            {/* Color Match */}
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: loading ? "default" : "pointer" }}>
              <input type="checkbox" checked={colorMatch} onChange={e => setColorMatch(e.target.checked)} disabled={loading}
                style={{ marginTop: 2, accentColor: "var(--accent)", width: 14, height: 14 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>Color Match (피부톤 자동 보정)</div>
                <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 3, lineHeight: 1.6 }}>
                  텍스처 전사 후 히스토그램 매칭으로 이미지 A의 피부톤에 맞게 색상을 보정합니다.<br />
                  원본과 이미지 A의 조명·색온도가 다를 때 효과적입니다.
                </div>
              </div>
            </label>
          </div>

          {/* 정렬 방식 요약 */}
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 16, padding: "8px 12px", background: "var(--bg-soft)", borderRadius: 6 }}>
            정렬 방식: {skipAlign
              ? "BiRefNet 바운딩박스 자동 정렬 (근사치)"
              : origEyes.left && origEyes.right && imageAEyes.left && imageAEyes.right
                ? `얼굴 랜드마크 affine 정렬 ✓ (원본 눈 간격 → 이미지 A 눈 간격 매핑)`
                : "포인트 미입력 → BiRefNet 자동 정렬"}
          </div>

          {loading && (
            <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 16, padding: "10px 14px", background: "var(--bg-soft)", borderRadius: 6 }}>
              ⏳ {statusMsg}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
            <button type="button" className="admin-btn admin-btn--ghost" onClick={() => setStep(3)} disabled={loading}>← 이전</button>
            <button type="button" className="admin-btn" onClick={handleTransfer} disabled={loading} style={{ minWidth: 200 }}>
              {loading ? "처리 중…" : "텍스처 전사 실행"}
            </button>
          </div>

          {/* 결과 */}
          {resultUrl && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>텍스처 전사 결과</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                {[
                  { label: "원본 (텍스처 소스)", src: origPreview! },
                  { label: "이미지 A (스왑 완료본)", src: imageAPreview! },
                  { label: "결과 (텍스처 전사 후)", src: resultUrl, accent: true },
                ].map(({ label, src, accent }) => (
                  <div key={label}>
                    <div style={{ fontSize: 10, color: "var(--ink-soft)", marginBottom: 5 }}>{label}</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={label} style={{ width: "100%", borderRadius: 7, border: `2px solid ${accent ? "var(--accent)" : "var(--line)"}`, display: "block" }} />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <a href={resultUrl} target="_blank" rel="noreferrer" className="admin-btn" style={{ fontSize: 12 }}>원본 URL 열기</a>
                <button type="button" className="admin-btn admin-btn--ghost" style={{ fontSize: 12 }} onClick={() => navigator.clipboard.writeText(resultUrl)}>URL 복사</button>
                <button type="button" className="admin-btn admin-btn--ghost" style={{ fontSize: 12 }} onClick={() => setResultUrl(null)}>다시 시도</button>
                <button type="button" className="admin-btn admin-btn--ghost" style={{ fontSize: 12 }} onClick={reset}>처음부터</button>
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--ink-faint)", fontFamily: "monospace", wordBreak: "break-all" }}>{resultUrl}</div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", fontSize: 13, marginTop: 16, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          {error}
        </div>
      )}
    </div>
  );
}
