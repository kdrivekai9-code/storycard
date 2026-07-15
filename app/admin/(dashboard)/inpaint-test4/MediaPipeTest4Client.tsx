"use client";

import { useRef, useState, useCallback } from "react";
import { runMediaPipeTransfer } from "./actions";

// MediaPipe Face Mesh 얼굴 윤곽 인덱스 (FACEMESH_FACE_OVAL)
const FACE_OVAL_INDICES = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10,
];

type LandmarkPoint = { x: number; y: number; z: number };
type Triangle = [number, number, number];

interface DetectionResult {
  landmarks: LandmarkPoint[];
  triangles: Triangle[];
}

// ── MediaPipe 동적 로드 ───────────────────────────────────────────────────────
// Promise를 싱글턴으로 캐싱 → Promise.all로 동시 호출돼도 초기화는 한 번만 실행됨

type LandmarkerModule = {
  landmarker: { detect: (img: ImageData) => { faceLandmarks: LandmarkPoint[][] } };
  FaceLandmarker: { FACE_LANDMARKS_TESSELATION: Array<{ start: number; end: number }> };
};
let landmarkerPromise: Promise<LandmarkerModule> | null = null;

function loadFaceLandmarker(): Promise<LandmarkerModule> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const mod = await import("@mediapipe/tasks-vision") as any;
      const { FaceLandmarker, FilesetResolver } = mod;
      /* eslint-enable @typescript-eslint/no-explicit-any */
      const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm",
      );
      const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        },
        outputFaceBlendshapes: false,
        runningMode: "IMAGE",
        numFaces: 1,
        minFaceDetectionConfidence: 0.1,
        minFacePresenceConfidence: 0.1,
        minTrackingConfidence: 0.1,
      });
      return { landmarker, FaceLandmarker } as LandmarkerModule;
    })();
  }
  return landmarkerPromise;
}

// MediaPipe connections → triangle 인덱스 추출
function getTrianglesFromConnections(connections: Array<{ start: number; end: number }> | undefined): Triangle[] {
  if (!connections) return [];
  // Simple edge-based approach: connections은 edges → Delaunay 근사
  // MediaPipe FACE_LANDMARKS_TESSELATION이 있으면 사용, 없으면 직접 triangulate
  // connections 배열 자체가 triangulation을 위한 연결 정보
  const triangles: Triangle[] = [];
  // connections를 인접 리스트로 변환
  const adj = new Map<number, Set<number>>();
  for (const { start, end } of connections) {
    if (!adj.has(start)) adj.set(start, new Set());
    if (!adj.has(end)) adj.set(end, new Set());
    adj.get(start)!.add(end);
    adj.get(end)!.add(start);
  }
  // 공통 이웃을 가진 엣지 쌍으로 삼각형 생성
  const seen = new Set<string>();
  for (const { start: a, end: b } of connections) {
    const neighborsA = adj.get(a) || new Set();
    const neighborsB = adj.get(b) || new Set();
    for (const c of neighborsA) {
      if (c !== b && neighborsB.has(c)) {
        const key = [a, b, c].sort((x, y) => x - y).join(",");
        if (!seen.has(key)) {
          seen.add(key);
          triangles.push([a, b, c]);
        }
      }
    }
  }
  return triangles;
}

async function fileToImageData(file: File): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
}

async function detectLandmarks(file: File): Promise<DetectionResult | null> {
  const { landmarker, FaceLandmarker } = await loadFaceLandmarker();
  const imageData = await fileToImageData(file);
  console.log("[MediaPipe] 감지 시작 — imageData:", imageData.width, "×", imageData.height);
  let result: { faceLandmarks: LandmarkPoint[][] };
  try {
    result = landmarker.detect(imageData);
  } catch (raw) {
    const name = raw instanceof Error ? raw.name : "Error";
    const msg  = raw instanceof Error ? raw.message : String(raw);
    console.error("[MediaPipe detect]", name, msg, raw);
    throw new Error(`MediaPipe detect 실패 — ${name}: ${msg || "(메시지 없음)"}`);
  }
  console.log("[MediaPipe] 감지 결과 — faceLandmarks 수:", result.faceLandmarks?.length ?? 0);
  if (!result.faceLandmarks || result.faceLandmarks.length === 0) return null;
  const landmarks = result.faceLandmarks[0];
  const triangles = getTrianglesFromConnections(FaceLandmarker.FACE_LANDMARKS_TESSELATION);
  return { landmarks, triangles };
}

// ── Canvas overlay 그리기 ─────────────────────────────────────────────────────

function drawLandmarks(canvas: HTMLCanvasElement, img: HTMLImageElement, landmarks: LandmarkPoint[], color: string) {
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  ctx.fillStyle = color;
  for (const pt of landmarks) {
    ctx.beginPath();
    ctx.arc(pt.x * img.naturalWidth, pt.y * img.naturalHeight, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // 얼굴 윤곽 폴리곤
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < FACE_OVAL_INDICES.length; i++) {
    const pt = landmarks[FACE_OVAL_INDICES[i]];
    const x = pt.x * img.naturalWidth;
    const y = pt.y * img.naturalHeight;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

type Phase = "idle" | "detecting" | "detected" | "processing" | "done" | "error";

export function MediaPipeTest4Client() {
  const [origFile, setOrigFile] = useState<File | null>(null);
  const [swapFile, setSwapFile] = useState<File | null>(null);
  const [origPreviewUrl, setOrigPreviewUrl] = useState("");
  const [swapPreviewUrl, setSwapPreviewUrl] = useState("");
  const [origLandmarks, setOrigLandmarks] = useState<LandmarkPoint[] | null>(null);
  const [swapLandmarks, setSwapLandmarks] = useState<LandmarkPoint[] | null>(null);
  const [triangles, setTriangles] = useState<Triangle[] | null>(null);
  const [blend, setBlend] = useState(0.65);
  const [sigma, setSigma] = useState(1.5);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [warpedUrl, setWarpedUrl] = useState("");
  const [highPassUrl, setHighPassUrl] = useState("");
  const [maskUrl, setMaskUrl] = useState("");

  const origImgRef = useRef<HTMLImageElement | null>(null);
  const swapImgRef = useRef<HTMLImageElement | null>(null);
  const origCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const swapCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>, slot: "orig" | "swap") => {
      const file = e.target.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      if (slot === "orig") {
        setOrigFile(file);
        setOrigPreviewUrl(url);
        setOrigLandmarks(null);
      } else {
        setSwapFile(file);
        setSwapPreviewUrl(url);
        setSwapLandmarks(null);
        setTriangles(null);
      }
      setPhase("idle");
      setResultUrl("");
    },
    [],
  );

  const handleDetect = useCallback(async () => {
    if (!origFile || !swapFile) {
      setErrorMsg("원본 이미지와 스왑 이미지를 모두 선택해주세요.");
      setPhase("error");
      return;
    }
    setPhase("detecting");
    setErrorMsg("");
    try {
      // 같은 모델 인스턴스에 동시 detect() 호출 시 충돌 → 순차 실행
      const origResult = await detectLandmarks(origFile);
      const swapResult = await detectLandmarks(swapFile);

      if (!origResult) throw new Error("원본 이미지에서 얼굴을 찾을 수 없습니다.");
      if (!swapResult) throw new Error("스왑 이미지에서 얼굴을 찾을 수 없습니다.");

      setOrigLandmarks(origResult.landmarks);
      setSwapLandmarks(swapResult.landmarks);
      setTriangles(swapResult.triangles);

      // 캔버스 오버레이: HTMLImageElement로 그리기
      const toImg = (file: File): Promise<HTMLImageElement> =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = URL.createObjectURL(file);
        });
      const [origImg, swapImg] = await Promise.all([toImg(origFile), toImg(swapFile)]);
      origImgRef.current = origImg;
      swapImgRef.current = swapImg;
      if (origCanvasRef.current) drawLandmarks(origCanvasRef.current, origImg, origResult.landmarks, "#00ff88");
      if (swapCanvasRef.current) drawLandmarks(swapCanvasRef.current, swapImg, swapResult.landmarks, "#ff6644");

      setPhase("detected");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }, [origFile, swapFile]);

  const handleTransfer = useCallback(async () => {
    if (!origFile || !swapFile || !origLandmarks || !swapLandmarks || !triangles) return;
    setPhase("processing");
    setResultUrl("");
    try {
      const fd = new FormData();
      fd.append("orig", origFile);
      fd.append("swap", swapFile);
      fd.append("landmarksOrig", JSON.stringify(origLandmarks));
      fd.append("landmarksSwap", JSON.stringify(swapLandmarks));
      fd.append("triangles", JSON.stringify(triangles));
      fd.append("faceContour", JSON.stringify(FACE_OVAL_INDICES));
      fd.append("blend", String(blend));
      fd.append("sigma", String(sigma));
      const res = await runMediaPipeTransfer(fd);
      if (!res.ok) throw new Error(res.error);
      setResultUrl(res.resultUrl);
      setWarpedUrl(res.warpedUrl);
      setHighPassUrl(res.highPassUrl);
      setMaskUrl(res.maskUrl);
      setPhase("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }, [origFile, swapFile, origLandmarks, swapLandmarks, triangles, blend, sigma]);

  const isDetecting = phase === "detecting";
  const isProcessing = phase === "processing";
  const busy = isDetecting || isProcessing;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* 이미지 업로드 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <SlotUpload
          label="원본 이미지 (피부 질감 소스)"
          file={origFile}
          previewUrl={origPreviewUrl}
          hasLandmarks={origLandmarks !== null}
          canvasRef={origCanvasRef}
          onChange={(e) => handleFileChange(e, "orig")}
          accentColor="#00c875"
        />
        <SlotUpload
          label="스왑 완료 이미지 (질감 전사 대상)"
          file={swapFile}
          previewUrl={swapPreviewUrl}
          hasLandmarks={swapLandmarks !== null}
          canvasRef={swapCanvasRef}
          onChange={(e) => handleFileChange(e, "swap")}
          accentColor="#ff6644"
        />
      </div>

      {/* 파라미터 */}
      <div style={{ display: "flex", gap: 32, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
          <span style={{ color: "var(--ink-soft)" }}>블렌드 강도 ({Math.round(blend * 100)}%)</span>
          <input
            type="range"
            min={0.1}
            max={1.0}
            step={0.05}
            value={blend}
            onChange={(e) => setBlend(parseFloat(e.target.value))}
            style={{ width: 180 }}
            disabled={busy}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
          <span style={{ color: "var(--ink-soft)" }}>High-Pass Sigma ({sigma})</span>
          <input
            type="range"
            min={0.5}
            max={5.0}
            step={0.5}
            value={sigma}
            onChange={(e) => setSigma(parseFloat(e.target.value))}
            style={{ width: 180 }}
            disabled={busy}
          />
        </label>
      </div>

      {/* 액션 버튼 */}
      <div style={{ display: "flex", gap: 12 }}>
        <button
          className="admin-btn"
          onClick={handleDetect}
          disabled={busy || !origFile || !swapFile}
        >
          {isDetecting ? "얼굴 감지 중…" : "① 얼굴 랜드마크 자동 감지"}
        </button>
        {(phase === "detected" || phase === "done") && (
          <button
            className="admin-btn"
            onClick={handleTransfer}
            disabled={isProcessing}
            style={{ background: "var(--accent)" }}
          >
            {isProcessing ? "질감 전사 중…" : "② 질감 전사 실행"}
          </button>
        )}
      </div>

      {/* 랜드마크 감지 상태 */}
      {phase === "detected" && (
        <div style={{ padding: "10px 14px", background: "#0a3d0a", borderRadius: 8, color: "#4eff8f", fontSize: 13 }}>
          얼굴 랜드마크 감지 완료: 원본 {origLandmarks?.length}개 / 스왑 {swapLandmarks?.length}개 포인트
          · 삼각형 {triangles?.length}개
        </div>
      )}

      {/* 에러 */}
      {phase === "error" && (
        <div style={{ padding: "10px 14px", background: "#3d0a0a", borderRadius: 8, color: "#ff8f8f", fontSize: 13 }}>
          오류: {errorMsg}
        </div>
      )}

      {/* 결과 */}
      {phase === "done" && resultUrl && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 8 }}>질감 전사 결과</p>
            <a href={resultUrl} target="_blank" rel="noopener noreferrer">
              <img
                src={resultUrl}
                alt="결과"
                style={{ maxWidth: "100%", maxHeight: 480, borderRadius: 8, border: "1px solid var(--line)" }}
              />
            </a>
          </div>

          <details style={{ fontSize: 13 }}>
            <summary style={{ cursor: "pointer", color: "var(--ink-soft)", marginBottom: 8 }}>
              디버그 이미지 (워프 결과 / High-Pass / 마스크)
            </summary>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 10 }}>
              {[
                { url: warpedUrl, label: "워프된 원본" },
                { url: highPassUrl, label: "High-Pass" },
                { url: maskUrl, label: "얼굴 마스크" },
              ].map(({ url, label }) => url && (
                <div key={label}>
                  <p style={{ color: "var(--ink-faint)", marginBottom: 4 }}>{label}</p>
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={url}
                      alt={label}
                      style={{ width: "100%", borderRadius: 6, border: "1px solid var(--line)" }}
                    />
                  </a>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

// ── 이미지 슬롯 ───────────────────────────────────────────────────────────────

function SlotUpload({
  label,
  file,
  previewUrl,
  hasLandmarks,
  canvasRef,
  onChange,
  accentColor,
}: {
  label: string;
  file: File | null;
  previewUrl: string;
  hasLandmarks: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  accentColor: string;
}) {
  // 캔버스는 랜드마크 감지 완료 시에만 표시 (부모 state 기반 — 로컬 state 없음)
  const showCanvas = hasLandmarks;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 2 }}>{label}</p>
      <label
        style={{
          display: "block",
          cursor: "pointer",
          border: `2px dashed ${accentColor}40`,
          borderRadius: 8,
          overflow: "hidden",
          position: "relative",
          minHeight: 180,
          background: "var(--bg)",
        }}
      >
        <input type="file" accept="image/*" onChange={onChange} style={{ display: "none" }} />
        {previewUrl ? (
          <>
            <img
              src={previewUrl}
              alt=""
              style={{
                width: "100%",
                display: showCanvas ? "none" : "block",
                maxHeight: 300,
                objectFit: "contain",
              }}
            />
            <canvas
              ref={canvasRef}
              style={{
                width: "100%",
                display: showCanvas ? "block" : "none",
                maxHeight: 300,
                objectFit: "contain",
              }}
            />
          </>
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--ink-faint)",
              fontSize: 13,
            }}
          >
            클릭하여 이미지 선택
          </div>
        )}
      </label>
      {file && (
        <p style={{ fontSize: 11, color: "var(--ink-faint)" }}>{file.name} ({(file.size / 1024).toFixed(0)} KB)</p>
      )}
    </div>
  );
}
