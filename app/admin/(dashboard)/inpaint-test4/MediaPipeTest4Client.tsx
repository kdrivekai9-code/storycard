"use client";

import { useRef, useState, useCallback } from "react";
import { createUploadUrls, runMediaPipeTransfer } from "./actions";

// MediaPipe Face Mesh 얼굴 윤곽 인덱스 (FACEMESH_FACE_OVAL)
const FACE_OVAL_INDICES = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10,
];

type LandmarkPoint = { x: number; y: number; z: number };
type Triangle = [number, number, number];

interface DetectionResult {
  faces: LandmarkPoint[][]; // 감지된 얼굴별 랜드마크 (좌→우 정렬 — 원본/스왑 간 동일 인물 매칭용)
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
        numFaces: 2, // 신랑+신부처럼 인물이 2명인 사진이 일반적이므로 둘 다 감지
        // 신뢰도를 너무 낮게(0.1) 두면 얼굴이 아닌 것(구름·질감 등)을 얼굴로 오인식한다.
        // "작은 얼굴" 문제는 이제 크롭+확대 재시도(generateGridTiles)로 해결하므로
        // 신뢰도는 기본값 수준으로 되돌려 오탐지를 줄인다.
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
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

type CropRect = { sx: number; sy: number; sw: number; sh: number };

// bitmap의 crop 영역을 최대 maxDim까지 확대/축소해 ImageData로 반환
function cropToImageData(bitmap: ImageBitmap, crop: CropRect, maxDim: number): ImageData {
  const scale = Math.min(1, maxDim / Math.max(crop.sw, crop.sh)) || 1;
  const w = Math.max(1, Math.round(crop.sw * scale));
  const h = Math.max(1, Math.round(crop.sh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

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

function avgX(face: LandmarkPoint[]): number {
  let sum = 0;
  for (const p of face) sum += p.x;
  return sum / face.length;
}

async function detectLandmarks(file: File, expectedFaces = 2): Promise<DetectionResult | null> {
  const { landmarker, FaceLandmarker } = await loadFaceLandmarker();
  const bitmap = await createImageBitmap(file);
  const W = bitmap.width;
  const H = bitmap.height;

  const tryDetect = (crop: CropRect, maxDim: number, label: string): LandmarkPoint[][] | null => {
    const imageData = cropToImageData(bitmap, crop, maxDim);
    let result: { faceLandmarks: LandmarkPoint[][] };
    try {
      result = landmarker.detect(imageData);
    } catch (raw) {
      const name = raw instanceof Error ? raw.name : "Error";
      const msg  = raw instanceof Error ? raw.message : String(raw);
      console.error("[MediaPipe detect]", name, msg, raw);
      throw new Error(`MediaPipe detect 실패 — ${name}: ${msg || "(메시지 없음)"}`);
    }
    const found = result.faceLandmarks?.length ?? 0;
    console.log(`[MediaPipe] ${label} (${imageData.width}×${imageData.height}): 감지 수 ${found}`);
    if (found === 0) return null;
    // crop 기준 normalized 좌표 → 원본 이미지 기준 normalized 좌표로 환산
    const faces = result.faceLandmarks.map((face) =>
      face.map((p) => ({
        x: (crop.sx + p.x * crop.sw) / W,
        y: (crop.sy + p.y * crop.sh) / H,
        z: p.z,
      })),
    );
    // 좌→우 정렬: 원본/스왑 이미지에서 각각 감지된 얼굴을 인물별로 매칭하기 위함
    faces.sort((a, b) => avgX(a) - avgX(b));
    return faces;
  };

  // 지금까지 찾은 것 중 가장 얼굴을 많이 찾은 결과를 유지 (한 크롭에 인물이 모두 안 잡힐 수 있어서)
  let best: LandmarkPoint[][] | null = null;
  const consider = (faces: LandmarkPoint[][] | null): boolean => {
    if (!faces) return false;
    if (!best || faces.length > best.length) best = faces;
    return best.length >= expectedFaces;
  };

  try {
    // 1차: 전체 이미지, 점진적 축소 (클로즈업 사진 — 대부분 여기서 감지됨)
    const full: CropRect = { sx: 0, sy: 0, sw: W, sh: H };
    for (const maxDim of [1280, 640, 320]) {
      if (consider(tryDetect(full, maxDim, `전체(maxDim=${maxDim})`))) break;
    }

    // 2차: 전신/와이드샷처럼 얼굴이 화면에서 작게 나온 경우.
    // 1차에서 이미 축소했는데도 실패했다면 더 축소해봐야 얼굴은 더 작아질 뿐이다.
    // 실측 결과 MediaPipe는 얼굴이 프레임의 25~35% 이상을 차지해야 감지되므로,
    // 반대로 격자 형태로 겹치는 영역을 크롭해 확대(얼굴 비중 UP)한 뒤 재시도한다.
    outer: for (const frac of [0.5, 0.32, 0.2]) {
      if (best && best.length >= expectedFaces) break;
      for (const tile of generateGridTiles(W, H, frac)) {
        if (consider(tryDetect(tile, 1280, `타일(frac=${frac},${Math.round(tile.sx)},${Math.round(tile.sy)})`))) {
          break outer;
        }
      }
    }

    if (!best) return null;
    return { faces: best, triangles: getTrianglesFromConnections(FaceLandmarker.FACE_LANDMARKS_TESSELATION) };
  } finally {
    bitmap.close();
  }
}

// ── Canvas overlay 그리기 ─────────────────────────────────────────────────────

function drawLandmarks(canvas: HTMLCanvasElement, img: HTMLImageElement, faces: LandmarkPoint[][], color: string) {
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  for (const landmarks of faces) {
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
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

type Phase = "idle" | "detecting" | "detected" | "uploading" | "processing" | "done" | "error";

export function MediaPipeTest4Client() {
  const [origFile, setOrigFile] = useState<File | null>(null);
  const [swapFile, setSwapFile] = useState<File | null>(null);
  const [origPreviewUrl, setOrigPreviewUrl] = useState("");
  const [swapPreviewUrl, setSwapPreviewUrl] = useState("");
  const [origFaces, setOrigFaces] = useState<LandmarkPoint[][] | null>(null);
  const [swapFaces, setSwapFaces] = useState<LandmarkPoint[][] | null>(null);
  const [triangles, setTriangles] = useState<Triangle[] | null>(null);
  const [blend, setBlend] = useState(0.65);
  const [sigma, setSigma] = useState(1.5);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [warpedUrl, setWarpedUrl] = useState("");
  const [highPassUrl, setHighPassUrl] = useState("");
  const [maskUrl, setMaskUrl] = useState("");
  // 결과는 서버 Storage에 매번 저장되지만, 이 페이지는 화면에 마지막 결과만 보여주고
  // 새로고침/이동하면 사라진다 — 탭을 유지하는 동안은 이전 결과들도 다시 볼 수 있도록
  // 세션 내 히스토리를 남겨둔다.
  const [history, setHistory] = useState<string[]>([]);

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
        setOrigFaces(null);
      } else {
        setSwapFile(file);
        setSwapPreviewUrl(url);
        setSwapFaces(null);
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

      // 좌→우 정렬된 얼굴들을 인덱스로 매칭 (신랑+신부처럼 인물이 여럿인 경우 대응)
      const pairCount = Math.min(origResult.faces.length, swapResult.faces.length);
      if (pairCount === 0) throw new Error("원본/스왑 이미지에서 매칭 가능한 얼굴을 찾을 수 없습니다.");
      const origPaired = origResult.faces.slice(0, pairCount);
      const swapPaired = swapResult.faces.slice(0, pairCount);

      setOrigFaces(origPaired);
      setSwapFaces(swapPaired);
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
      if (origCanvasRef.current) drawLandmarks(origCanvasRef.current, origImg, origPaired, "#00ff88");
      if (swapCanvasRef.current) drawLandmarks(swapCanvasRef.current, swapImg, swapPaired, "#ff6644");

      setPhase("detected");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }, [origFile, swapFile]);

  const handleTransfer = useCallback(async () => {
    if (!origFile || !swapFile || !origFaces || !swapFaces || !triangles) return;
    setPhase("uploading");
    setResultUrl("");
    try {
      // 서버가 서명한 URL을 받아 브라우저가 Supabase에 직접 PUT한다.
      // → 서버 액션에 바이너리를 전송하지 않으므로 프록시 버퍼 한도 문제가 없고,
      //   서비스 롤 키로 서명하므로 RLS 정책도 우회한다.
      const urlRes = await createUploadUrls();
      if (!urlRes.ok) throw new Error(urlRes.error);

      const [origResp, swapResp] = await Promise.all([
        fetch(urlRes.orig.signedUrl, { method: "PUT", headers: { "Content-Type": origFile.type || "image/jpeg" }, body: origFile }),
        fetch(urlRes.swap.signedUrl, { method: "PUT", headers: { "Content-Type": swapFile.type || "image/jpeg" }, body: swapFile }),
      ]);
      if (!origResp.ok) throw new Error(`원본 이미지 업로드 실패: ${origResp.status}`);
      if (!swapResp.ok) throw new Error(`스왑 이미지 업로드 실패: ${swapResp.status}`);

      const origUrl = urlRes.orig.publicUrl;
      const swapUrl = urlRes.swap.publicUrl;

      setPhase("processing");
      const res = await runMediaPipeTransfer({
        origUrl,
        swapUrl,
        landmarksOrigList: origFaces,
        landmarksSwapList: swapFaces,
        triangles,
        faceContour: FACE_OVAL_INDICES,
        blend,
        sigma,
      });
      if (!res.ok) throw new Error(res.error);
      setResultUrl(res.resultUrl);
      setWarpedUrl(res.warpedUrl);
      setHighPassUrl(res.highPassUrl);
      setMaskUrl(res.maskUrl);
      setHistory(h => [res.resultUrl, ...h].slice(0, 20));
      setPhase("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }, [origFile, swapFile, origFaces, swapFaces, triangles, blend, sigma]);

  const isDetecting = phase === "detecting";
  const isUploading = phase === "uploading";
  const isProcessing = phase === "processing";
  const busy = isDetecting || isUploading || isProcessing;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* 이미지 업로드 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <SlotUpload
          label="원본 이미지 (피부 질감 소스)"
          file={origFile}
          previewUrl={origPreviewUrl}
          hasLandmarks={origFaces !== null}
          canvasRef={origCanvasRef}
          onChange={(e) => handleFileChange(e, "orig")}
          accentColor="#00c875"
        />
        <SlotUpload
          label="스왑 완료 이미지 (질감 전사 대상)"
          file={swapFile}
          previewUrl={swapPreviewUrl}
          hasLandmarks={swapFaces !== null}
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
        {(phase === "detected" || phase === "uploading" || phase === "processing" || phase === "done") && (
          <button
            className="admin-btn"
            onClick={handleTransfer}
            disabled={isUploading || isProcessing}
            style={{ background: "var(--accent)" }}
          >
            {isUploading ? "업로드 중…" : isProcessing ? "질감 전사 중…" : "② 질감 전사 실행"}
          </button>
        )}
      </div>

      {/* 랜드마크 감지 상태 */}
      {phase === "detected" && (
        <div style={{ padding: "10px 14px", background: "#0a3d0a", borderRadius: 8, color: "#4eff8f", fontSize: 13 }}>
          얼굴 랜드마크 감지 완료: {origFaces?.length}명 매칭 · 얼굴당 {origFaces?.[0]?.length}개 포인트
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

          <details open style={{ fontSize: 13 }}>
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

      {/* 이번 세션 결과 히스토리 — 페이지를 새로고침해도 탭을 유지하는 동안은
          이전 결과 URL들을 다시 볼 수 있게 남겨둔다 (Storage에는 매번 저장되지만
          이 페이지 자체가 지금까지 그걸 다시 보여줄 방법이 없었다). */}
      {history.length > 0 && (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 20, marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>이번 세션 결과 ({history.length})</div>
            <button type="button" className="admin-btn admin-btn--ghost" style={{ fontSize: 11 }} onClick={() => setHistory([])}>전체 삭제</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
            {history.map((url, i) => (
              <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden", background: "var(--bg)" }}>
                <a href={url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`결과 ${i + 1}`} style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", display: "block" }} />
                </a>
                <div style={{ padding: "6px 8px", display: "flex", gap: 6 }}>
                  <a href={url} target="_blank" rel="noreferrer" className="admin-btn admin-btn--ghost" style={{ fontSize: 10, padding: "3px 8px" }}>열기</a>
                  <button type="button" className="admin-btn admin-btn--ghost" style={{ fontSize: 10, padding: "3px 8px" }} onClick={() => navigator.clipboard.writeText(url)}>복사</button>
                </div>
              </div>
            ))}
          </div>
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
          minHeight: 240,
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
                maxHeight: 480,
                objectFit: "contain",
              }}
            />
            <canvas
              ref={canvasRef}
              style={{
                width: "100%",
                display: showCanvas ? "block" : "none",
                maxHeight: 480,
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
