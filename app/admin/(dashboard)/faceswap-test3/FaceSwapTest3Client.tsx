"use client";

import { useState, useRef, useEffect } from "react";
import { submitMultiFaceSwap, pollMultiFaceSwap, type RetryCtx } from "./actions";

const ESTIMATE_SEC = 40;

function formatMmSs(sec: number) {
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

// 서버(actions.ts/edge function)가 "<메시지> — 원본 응답: {...}" 형식으로 에러를 내려주는데,
// 브라우저에서 status/message/tip 필드를 따로 바로 읽을 수 있도록 파싱해서 보여준다.
const RAW_RESPONSE_MARKER = " — 원본 응답: ";
function parseApiError(error: string): { summary: string; raw: Record<string, unknown> | null } {
  const idx = error.indexOf(RAW_RESPONSE_MARKER);
  if (idx === -1) return { summary: error, raw: null };
  const summary = error.slice(0, idx);
  const rawText = error.slice(idx + RAW_RESPONSE_MARKER.length);
  try {
    return { summary, raw: JSON.parse(rawText) as Record<string, unknown> };
  } catch {
    return { summary, raw: null };
  }
}

// ── MediaPipe ─────────────────────────────────────────────────────────────────
type LandmarkPoint = { x: number; y: number; z: number };
type LandmarkerModule = {
  landmarker: { detect: (img: ImageData) => { faceLandmarks: LandmarkPoint[][] } };
};

let landmarkerPromise: Promise<LandmarkerModule> | null = null;
function loadFaceLandmarker(): Promise<LandmarkerModule> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod = await import("@mediapipe/tasks-vision") as any;
      const { FaceLandmarker, FilesetResolver } = mod;
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm",
      );
      const landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        },
        outputFaceBlendshapes: false,
        runningMode: "IMAGE",
        numFaces: 2,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      return { landmarker } as LandmarkerModule;
    })();
  }
  return landmarkerPromise;
}

function makeCropCanvas(
  src: ImageBitmap,
  sx: number, sy: number, sw: number, sh: number,
  maxDim: number,
): HTMLCanvasElement {
  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d")!.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
  return canvas;
}

function getImageData(canvas: HTMLCanvasElement): ImageData {
  return canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
}

function sortLR(faces: LandmarkPoint[][]): LandmarkPoint[][] {
  return [...faces].sort((a, b) => {
    const ax = a.reduce((s, p) => s + p.x, 0) / a.length;
    const bx = b.reduce((s, p) => s + p.x, 0) / b.length;
    return ax - bx;
  });
}

type CropRect = { sx: number; sy: number; sw: number; sh: number };

// [0, 1-frac] 구간을 count개로 균등 분할한 위치(비율) 배열
function evenPositions(frac: number, count: number): number[] {
  const last = Math.max(0, 1 - frac);
  if (frac >= 1 || count <= 1) return [last / 2];
  const step = last / (count - 1);
  return Array.from({ length: count }, (_, i) => i * step);
}

// frac 크기(원본 대비 비율)의 정사각 타일을 count×count 격자로 겹치게 배치
function generateGridTiles(W: number, H: number, frac: number, count = 3): CropRect[] {
  const xs = evenPositions(frac, count);
  const ys = evenPositions(frac, count);
  const tiles: CropRect[] = [];
  for (const py of ys) {
    for (const px of xs) {
      tiles.push({ sx: px * W, sy: py * H, sw: frac * W, sh: frac * H });
    }
  }
  return tiles;
}

async function detectTwoFaces(file: File): Promise<LandmarkPoint[][] | null> {
  const { landmarker } = await loadFaceLandmarker();
  const bitmap = await createImageBitmap(file);
  const W = bitmap.width;
  const H = bitmap.height;

  // 크롭 좌표 → 원본 이미지 정규화 좌표로 역매핑
  function remap(faces: LandmarkPoint[][], crop: CropRect) {
    return faces.map(lms => lms.map(p => ({
      x: (crop.sx + p.x * crop.sw) / W,
      y: (crop.sy + p.y * crop.sh) / H,
      z: p.z,
    })));
  }

  function tryIn(crop: CropRect, maxDim: number): LandmarkPoint[][] {
    const canvas = makeCropCanvas(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, maxDim);
    const faces = landmarker.detect(getImageData(canvas)).faceLandmarks;
    return remap(faces, crop);
  }

  // 지금까지 찾은 것 중 가장 얼굴을 많이 찾은 결과를 유지 (한 크롭에 인물이 모두 안 잡힐 수 있어서)
  let best: LandmarkPoint[][] | null = null;
  const consider = (faces: LandmarkPoint[][]): boolean => {
    if (faces.length === 0) return false;
    if (!best || faces.length > best.length) best = sortLR(faces);
    return best.length >= 2;
  };

  try {
    // 1차: 전체 이미지, 점진적 축소 (클로즈업 사진 — 대부분 여기서 감지됨)
    const full: CropRect = { sx: 0, sy: 0, sw: W, sh: H };
    for (const maxDim of [1280, 960, 640]) {
      if (consider(tryIn(full, maxDim))) return best!.slice(0, 2);
    }

    // 2차: 전신/와이드샷처럼 얼굴이 화면에서 작게 나온 경우.
    // 축소할수록 얼굴은 더 작아질 뿐이므로, 반대로 겹치는 영역을 크롭해
    // 확대(얼굴 비중 UP)한 뒤 재시도한다. (얼굴 위치를 가정하지 않는 전면 격자 스캔)
    outer: for (const frac of [0.5, 0.32, 0.2]) {
      if (best && best.length >= 2) break;
      for (const tile of generateGridTiles(W, H, frac)) {
        if (consider(tryIn(tile, 1280))) break outer;
      }
    }

    if (!best) return null;
    return best.slice(0, 2);
  } finally {
    bitmap.close();
  }
}

async function cropFaceFromBitmap(
  bitmap: ImageBitmap,
  landmarks: LandmarkPoint[],
): Promise<{ file: File; preview: string }> {
  const W = bitmap.width;
  const H = bitmap.height;

  const xs = landmarks.map(p => p.x * W);
  const ys = landmarks.map(p => p.y * H);
  const faceW = Math.max(...xs) - Math.min(...xs);
  const faceH = Math.max(...ys) - Math.min(...ys);
  const padX = faceW * 0.55;
  const padY = faceH * 0.55;

  const sx = Math.max(0, Math.min(...xs) - padX);
  const sy = Math.max(0, Math.min(...ys) - padY);
  const sw = Math.min(W - sx, Math.max(...xs) + padX - sx);
  const sh = Math.min(H - sy, Math.max(...ys) + padY - sy);

  const canvas = makeCropCanvas(bitmap, sx, sy, sw, sh, 4096);

  return new Promise(resolve => {
    canvas.toBlob(blob => {
      const f = new File([blob!], "face.jpg", { type: "image/jpeg" });
      resolve({ file: f, preview: URL.createObjectURL(f) });
    }, "image/jpeg", 0.95);
  });
}

// Multiple Face Swap(deepfake/multiple_face_swap)은 target_image가 문자열
// 하나만 지원한다(배열 불가 — ModelsLab 문서 기준). 얼굴 소스가 2명이면
// 소스1·2를 좌우로 이어붙인 합성 이미지 하나를 만들어 target_image로 넘긴다 —
// "target_image 안에 얼굴이 여러 개면 init_image의 얼굴들과 순서대로 매칭한다"는
// 문서 설명과 일치하는 방식이다.
async function composeSideBySide(fileA: File, fileB: File): Promise<{ file: File; preview: string }> {
  const [bmpA, bmpB] = await Promise.all([createImageBitmap(fileA), createImageBitmap(fileB)]);
  try {
    const H = 900;
    const wA = Math.max(1, Math.round(bmpA.width * (H / bmpA.height)));
    const wB = Math.max(1, Math.round(bmpB.width * (H / bmpB.height)));
    const canvas = document.createElement("canvas");
    canvas.width = wA + wB;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bmpA, 0, 0, wA, H);
    ctx.drawImage(bmpB, wA, 0, wB, H);
    return new Promise(resolve => {
      canvas.toBlob(blob => {
        const f = new File([blob!], "combined-target.jpg", { type: "image/jpeg" });
        resolve({ file: f, preview: URL.createObjectURL(f) });
      }, "image/jpeg", 0.95);
    });
  } finally {
    bmpA.close(); bmpB.close();
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
type SlotKey = "init_image" | "target_image" | "target_image_2";
const SLOTS: { key: SlotKey; label: string; desc: string; required: boolean }[] = [
  { key: "init_image",    label: "Init Image",   desc: "얼굴이 교체될 기본 이미지", required: true },
  { key: "target_image",  label: "얼굴 소스 1", desc: "교체할 얼굴 (필수, 1명)",   required: true },
  { key: "target_image_2",label: "얼굴 소스 2", desc: "2번째 얼굴 소스 (선택)",     required: false },
];

type SplitResult = { files: [File, File]; previews: [string, string] };

// 매 응답(제출/폴링/재시도)을 시간순으로 남겨서, 최종 결과만으로는 안 보이는
// 중간 상태(예: 한 번은 processing이었다가 나중에 실패)도 나중에 다시 확인할 수 있게 한다.
type TimelineEntry = {
  time: string;
  source: string; // "제출" | "폴링" | "폴링(재시도됨)"
  result: "processing" | "success" | "error";
  rawStatus?: string;
  eta?: number;
  message?: string;
  raw?: Record<string, unknown> | null;
  retried?: boolean;
};

function nowLabel(): string {
  const d = new Date();
  return d.toLocaleTimeString("ko-KR", { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0");
}

// ── Component ─────────────────────────────────────────────────────────────────
export function FaceSwapTest3Client() {
  const [previews,   setPreviews]   = useState<Partial<Record<SlotKey, string>>>({});
  const [enhance,    setEnhance]    = useState(false);
  const [result,     setResult]     = useState<string | null>(null);
  const [history,    setHistory]    = useState<string[]>([]);
  const [error,      setError]      = useState<string | null>(null);
  const [errorRetried, setErrorRetried] = useState(false);
  const [phase,      setPhase]      = useState<"idle" | "uploading" | "processing">("idle");
  const [elapsed,    setElapsed]    = useState(0);
  const [lightbox,   setLightbox]   = useState<string | null>(null);
  const [statusInfo, setStatusInfo] = useState<{ rawStatus?: string; eta?: number; retried?: boolean } | null>(null);
  const [timeline,   setTimeline]   = useState<TimelineEntry[]>([]);
  // 2인→2인 스왑 시 소스1·2를 좌우로 합성해 target_image로 넘기는 이미지의 미리보기
  const [combinedPreview, setCombinedPreview] = useState<string | null>(null);

  function logEntry(entry: Omit<TimelineEntry, "time">) {
    setTimeline(t => [...t, { ...entry, time: nowLabel() }]);
  }

  // 자동 분리 상태
  const [splitSrcPreview, setSplitSrcPreview] = useState<string>("");
  const [splitResult,     setSplitResult]     = useState<SplitResult | null>(null);
  const [splitLoading,    setSplitLoading]    = useState(false);
  const [splitError,      setSplitError]      = useState<string | null>(null);

  const formRef          = useRef<HTMLFormElement>(null);
  const pollingActiveRef = useRef(false);
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchUrlRef      = useRef("");

  useEffect(() => {
    if (phase !== "idle") {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  useEffect(() => {
    if (!lightbox) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setLightbox(null); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [lightbox]);

  function stopPolling() {
    pollingActiveRef.current = false;
  }

  function finalizeSuccess(outputUrl: string, source: string) {
    stopPolling(); setPhase("idle");
    setResult(outputUrl);
    setHistory(h => [outputUrl, ...h].slice(0, 20));
    logEntry({ source, result: "success" });
  }

  function finalizeError(errorMsg: string, retried: boolean | undefined, source: string) {
    stopPolling(); setPhase("idle");
    setError(errorMsg);
    setErrorRetried(!!retried);
    const { summary, raw } = parseApiError(errorMsg);
    logEntry({ source, result: "error", message: summary, raw, retried });
  }

  // 클라이언트에서 짧은 간격으로 반복 호출하는 대신, 서버(pollMultiFaceSwap)가
  // 내부적으로 최대 90초간 알아서 재확인하다가 응답한다. 그래서 여기서는 그
  // 응답이 돌아올 때만(=완료됐거나 서버 쪽 대기 예산 소진) 곧바로 이어서 한
  // 번 더 부르면 되고, setInterval로 매번 새 요청을 쏠 필요가 없다.
  // ModelsLab이 "Try Again"처럼 재시도 가능한 실패를 내면 서버가 자동으로 한 번
  // 재제출하는데, 그럴 때 fetchUrl이 새 작업의 것으로 바뀌므로 여기서 갱신해둔다.
  async function startPolling(fetchUrl: string, retryCtx?: RetryCtx) {
    fetchUrlRef.current = fetchUrl;
    pollingActiveRef.current = true;
    while (pollingActiveRef.current) {
      const res = await pollMultiFaceSwap(fetchUrlRef.current, retryCtx);
      if (!pollingActiveRef.current) return;
      if (res.status === "success") { finalizeSuccess(res.outputUrl, "폴링"); return; }
      if (res.status === "error") { finalizeError(res.error, res.retried, "폴링"); return; }
      if (res.fetchUrl) fetchUrlRef.current = res.fetchUrl;
      setStatusInfo({ rawStatus: res.rawStatus, eta: res.eta, retried: res.retried });
      logEntry({ source: res.retried ? "폴링(재시도됨)" : "폴링", result: "processing", rawStatus: res.rawStatus, eta: res.eta });
      // 여전히 processing — 서버가 이미 자체적으로 기다렸으니 바로 다시 요청
    }
  }

  async function handleAutoSplit(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSplitSrcPreview(URL.createObjectURL(file));
    setSplitResult(null);
    setSplitError(null);
    setSplitLoading(true);
    try {
      const faces = await detectTwoFaces(file);
      if (!faces || faces.length < 2) {
        setSplitError("이미지에서 얼굴 2개를 찾지 못했습니다. 정면 사진을 사용하거나 각 슬롯에 직접 등록해주세요.");
        setSplitLoading(false);
        return;
      }
      const bitmap = await createImageBitmap(file);
      const [c1, c2] = await Promise.all([
        cropFaceFromBitmap(bitmap, faces[0]),
        cropFaceFromBitmap(bitmap, faces[1]),
      ]);
      bitmap.close();
      setSplitResult({ files: [c1.file, c2.file], previews: [c1.preview, c2.preview] });
    } catch (err) {
      setSplitError(`자동 분리 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSplitLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formRef.current) return;
    stopPolling();
    setResult(null); setError(null); setErrorRetried(false); setPhase("uploading"); setStatusInfo(null);
    setCombinedPreview(null);

    const fd = new FormData(formRef.current);
    fd.set("enhance", enhance ? "1" : "0");

    // 자동 분리 결과가 있으면 소스1·2에 주입
    if (splitResult) {
      fd.set("target_image",   splitResult.files[0]);
      fd.set("target_image_2", splitResult.files[1]);
    }

    setTimeline([]);

    const source1File = fd.get("target_image")   as File | null;
    const source2File  = fd.get("target_image_2") as File | null;
    const hasSecondSource = !!(source2File && source2File.size > 0);

    if (hasSecondSource && source1File) {
      // 2인→2인: 소스1·2 얼굴을 좌우로 이어붙인 합성 이미지 하나를 target_image로 넘긴다.
      try {
        const combined = await composeSideBySide(source1File, source2File);
        setCombinedPreview(combined.preview);
        fd.set("target_image", combined.file);
        fd.delete("target_image_2");
      } catch (err) {
        setPhase("idle");
        setError(`합성 이미지 생성 실패: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
    }

    const res = await submitMultiFaceSwap(fd);
    if (!res.ok) { finalizeError(res.error, res.retried, "제출"); return; }
    if (res.status === "success") { finalizeSuccess(res.outputUrl, "제출"); return; }
    setPhase("processing");
    setStatusInfo({ rawStatus: res.rawStatus, eta: res.eta });
    logEntry({ source: "제출", result: "processing", rawStatus: res.rawStatus, eta: res.eta });
    void startPolling(res.fetchUrl, res.retryCtx);
  }

  const loading   = phase !== "idle";
  const progress  = Math.min(100, Math.round((elapsed / ESTIMATE_SEC) * 100));
  const hasTarget = !!previews.target_image || !!splitResult;
  const ready     = !!previews.init_image && hasTarget;
  const isTwoToTwo = !!(previews.target_image_2 || splitResult);

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

        {/* ── 이미지 슬롯 3개 ─────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, marginBottom: 24 }}>
          {SLOTS.map(({ key, label, desc, required }) => {
            const autoPreview = splitResult
              ? (key === "target_image" ? splitResult.previews[0] : key === "target_image_2" ? splitResult.previews[1] : null)
              : null;
            const displayPreview = autoPreview ?? previews[key];
            const isAutoFilled = !!autoPreview;

            return (
              <div key={key}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{label}</span>
                  {isAutoFilled && (
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "#dcfce7", color: "#166534" }}>자동분리</span>
                  )}
                  {!required && !isAutoFilled && (
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "var(--line)", color: "var(--ink-faint)" }}>선택</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 10 }}>{desc}</div>
                <label htmlFor={key} style={{ display: "block", width: "100%", aspectRatio: "3/4", border: `2px dashed ${isAutoFilled ? "#86efac" : "var(--line)"}`, borderRadius: 10, overflow: "hidden", cursor: loading ? "default" : "pointer", background: "var(--bg-soft)", position: "relative" }}>
                  {displayPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={displayPreview} alt={label} style={{ width: "100%", height: "100%", objectFit: "contain", background: "var(--bg-soft)" }} />
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
                    // 수동으로 업로드하면 자동분리 결과 무시
                    if (key === "target_image" || key === "target_image_2") setSplitResult(null);
                    setPreviews(p => ({ ...p, [key]: URL.createObjectURL(f) }));
                  }} />
                {displayPreview && !loading && (
                  <button type="button" className="admin-btn admin-btn--ghost" style={{ fontSize: 11, marginTop: 8 }}
                    onClick={() => {
                      if (isAutoFilled) { setSplitResult(null); return; }
                      setPreviews(p => { const n = { ...p }; delete n[key]; return n; });
                      const inp = document.getElementById(key) as HTMLInputElement;
                      if (inp) inp.value = "";
                    }}>초기화</button>
                )}
              </div>
            );
          })}
        </div>

        {/* ── 2인 자동 분리 ─────────────────────────────────────────── */}
        <div style={{ marginBottom: 24, padding: "16px 20px", background: "var(--bg-soft)", borderRadius: 10, border: "1px solid var(--line)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>
            얼굴 소스 자동 분리
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 14 }}>
            2명이 함께 있는 사진 1장을 업로드하면 MediaPipe가 얼굴을 감지해 소스 1 · 2로 자동 분리합니다.
          </div>

          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            {/* 원본 업로드 */}
            <div style={{ flex: "0 0 auto" }}>
              <label htmlFor="split-src" style={{ display: "block", width: 120, height: 160, border: "2px dashed var(--line)", borderRadius: 8, overflow: "hidden", cursor: loading || splitLoading ? "default" : "pointer", background: "var(--bg)", position: "relative" }}>
                {splitSrcPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={splitSrcPreview} alt="소스" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "var(--ink-faint)" }}>
                    <span style={{ fontSize: 28 }}>+</span>
                    <span style={{ fontSize: 11, textAlign: "center" }}>2명 사진<br/>업로드</span>
                  </div>
                )}
              </label>
              <input id="split-src" type="file" accept="image/*" disabled={loading || splitLoading} style={{ display: "none" }} onChange={handleAutoSplit} />
            </div>

            {/* 화살표 */}
            {(splitLoading || splitResult || splitError) && (
              <div style={{ display: "flex", alignItems: "center", paddingTop: 60, color: "var(--ink-faint)", fontSize: 20 }}>→</div>
            )}

            {/* 로딩 */}
            {splitLoading && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 160, gap: 10, color: "var(--ink-soft)", fontSize: 13 }}>
                <div style={{ width: 28, height: 28, border: "3px solid var(--line)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                얼굴 감지 중…
              </div>
            )}

            {/* 오류 */}
            {splitError && !splitLoading && (
              <div style={{ fontSize: 12, color: "#dc2626", maxWidth: 280, paddingTop: 8 }}>{splitError}</div>
            )}

            {/* 분리 결과 미리보기 */}
            {splitResult && !splitLoading && (
              <div style={{ display: "flex", gap: 12 }}>
                {splitResult.previews.map((url, i) => (
                  <div key={i} style={{ textAlign: "center" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`얼굴 ${i + 1}`} onClick={() => setLightbox(url)}
                      style={{ width: 120, height: 160, objectFit: "cover", borderRadius: 8, border: "2px solid #86efac", cursor: "zoom-in", display: "block" }} />
                    <div style={{ fontSize: 11, color: "#166534", marginTop: 4, fontWeight: 600 }}>소스 {i + 1}</div>
                  </div>
                ))}
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
                  <button type="button" className="admin-btn admin-btn--ghost" style={{ fontSize: 11 }}
                    onClick={() => { setSplitResult(null); setSplitSrcPreview(""); setSplitError(null); }}>
                    초기화
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── 옵션 ─────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, padding: "12px 16px", background: "var(--bg-soft)", borderRadius: 8, border: "1px solid var(--line)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, userSelect: "none" }}>
            <input type="checkbox" checked={enhance} onChange={e => setEnhance(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: "var(--accent)", cursor: "pointer" }} />
            <span style={{ fontWeight: 600 }}>Enhance Face Swap</span>
          </label>
          <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>얼굴 품질 향상 (처리 시간 약간 증가)</span>
        </div>

        {/* ── 실행 버튼 ─────────────────────────────────────────────── */}
        <button type="submit" className="admin-btn" disabled={loading || !ready}
          style={{ minWidth: 180, fontSize: 14, padding: "10px 28px", marginBottom: 24 }}>
          {loading ? "처리 중…" : isTwoToTwo ? "✦ 2인→2인 Face Swap 실행 (합성)" : "✦ Multiple Face Swap 실행"}
        </button>

        {/* ── 진행 상태 ─────────────────────────────────────────────── */}
        {loading && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 8 }}>
              {phase === "uploading" ? "이미지 업로드 중…" : `처리 중… ${formatMmSs(elapsed)}`}
            </div>
            <div style={{ height: 6, background: "var(--line)", borderRadius: 4, overflow: "hidden", maxWidth: 480 }}>
              <div style={{ height: "100%", width: `${phase === "uploading" ? 8 : progress}%`, background: "var(--accent)", borderRadius: 4, transition: "width 1s linear" }} />
            </div>
            {/* ModelsLab이 실제로 보고하는 원본 상태값(processing/queued 등)을 그대로 노출 —
                내부적으로 무슨 상태인지 몰라 답답하지 않도록 */}
            {phase === "processing" && statusInfo && (
              <div style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 6, fontFamily: "monospace" }}>
                ModelsLab status: {statusInfo.rawStatus ?? "(응답 대기 중)"}
                {typeof statusInfo.eta === "number" && ` · eta ${statusInfo.eta}s`}
                {statusInfo.retried && " · 재시도 1회 발생"}
              </div>
            )}
            {combinedPreview && (
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
                <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>실제 target_image로 전송된 합성 이미지:</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={combinedPreview} alt="합성된 target_image" onClick={() => setLightbox(combinedPreview)}
                  style={{ height: 60, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)", cursor: "zoom-in" }} />
              </div>
            )}
          </div>
        )}

        {/* ── 오류 ─────────────────────────────────────────────────── */}
        {error && (() => {
          const { summary, raw } = parseApiError(error);
          return (
            <div style={{ padding: "12px 16px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", fontSize: 13, marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: raw ? 8 : 0 }}>
                <div style={{ fontWeight: 700 }}>{summary}</div>
                {errorRetried && (
                  <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "#fee2e2", color: "#991b1b", fontWeight: 600 }}>
                    자동 재시도 1회 실행 후에도 실패
                  </span>
                )}
              </div>
              {raw && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                  {typeof raw.status === "string" && <div><b>status:</b> {raw.status}</div>}
                  {typeof raw.message === "string" && <div><b>message:</b> {raw.message}</div>}
                  {typeof raw.tip === "string" && <div><b>tip:</b> {raw.tip}</div>}
                </div>
              )}
              {raw && (
                <details>
                  <summary style={{ cursor: "pointer", color: "#991b1b" }}>ModelsLab 원본 JSON 응답 전체</summary>
                  <pre style={{ fontSize: 11, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all", marginTop: 6, padding: 8, background: "#fff", borderRadius: 6, border: "1px solid #fecaca" }}>
                    {JSON.stringify(raw, null, 2)}
                  </pre>
                </details>
              )}
              {!raw && <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{error}</div>}
            </div>
          );
        })()}

        {/* ── 결과 ─────────────────────────────────────────────────── */}
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

        {/* ── 타임라인 (요청/응답 전체 기록) ─────────────────────────── */}
        {timeline.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <details>
              <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>
                타임라인 ({timeline.length}건) — 제출/폴링/재시도 전체 기록
              </summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                {timeline.map((t, i) => {
                  const color = t.result === "success" ? "#166534" : t.result === "error" ? "#dc2626" : "var(--ink-soft)";
                  const bg = t.result === "success" ? "#f0fdf4" : t.result === "error" ? "#fef2f2" : "var(--bg-soft)";
                  const border = t.result === "success" ? "#bbf7d0" : t.result === "error" ? "#fecaca" : "var(--line)";
                  return (
                    <div key={i} style={{ fontSize: 12, padding: "8px 12px", borderRadius: 6, background: bg, border: `1px solid ${border}` }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "monospace", color: "var(--ink-faint)" }}>{t.time}</span>
                        <span style={{ fontWeight: 700 }}>{t.source}</span>
                        <span style={{ color, fontWeight: 600 }}>{t.result}</span>
                        {t.rawStatus && <span style={{ fontFamily: "monospace", color: "var(--ink-faint)" }}>rawStatus: {t.rawStatus}</span>}
                        {typeof t.eta === "number" && <span style={{ fontFamily: "monospace", color: "var(--ink-faint)" }}>eta {t.eta}s</span>}
                        {t.retried && (
                          <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "#fee2e2", color: "#991b1b", fontWeight: 600 }}>
                            자동 재시도 1회 실행됨
                          </span>
                        )}
                      </div>
                      {t.message && <div style={{ marginTop: 4, color }}>{t.message}</div>}
                      {t.raw && (
                        <details style={{ marginTop: 4 }}>
                          <summary style={{ cursor: "pointer", fontSize: 11, color: "var(--ink-faint)" }}>원본 JSON</summary>
                          <pre style={{ fontSize: 11, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all", marginTop: 4, padding: 8, background: "#fff", borderRadius: 6, border: "1px solid var(--line)" }}>
                            {JSON.stringify(t.raw, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            </details>
          </div>
        )}
      </form>

      {/* ── 히스토리 ─────────────────────────────────────────────────── */}
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

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
