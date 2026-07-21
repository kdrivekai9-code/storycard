"use server";

import sharp from "sharp";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "invitation-photos";
const PREFIX = "inpaint-test4";

type Point = { x: number; y: number };
type Triangle = [number, number, number]; // landmark indices

// ── Storage helpers ──────────────────────────────────────────────────────────

async function uploadBuffer(buf: Buffer | Uint8Array, name: string, contentType: string): Promise<string> {
  const admin = createAdminClient();
  const path = `${PREFIX}/${Date.now()}-${name}`;
  const { error } = await admin.storage.from(BUCKET).upload(path, buf, { contentType, upsert: true });
  if (error) throw new Error(`업로드 실패(${name}): ${error.message}`);
  return admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function downloadBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`다운로드 실패(${url}): ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// 브라우저가 RLS 없이 Supabase Storage에 직접 PUT할 수 있는 Signed URL을 발급한다.
// 서비스 롤 키를 사용하는 어드민 클라이언트가 서명하므로 RLS 정책을 우회한다.
export async function createUploadUrls(): Promise<
  | { ok: true; orig: { signedUrl: string; publicUrl: string }; swap: { signedUrl: string; publicUrl: string } }
  | { ok: false; error: string }
> {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    const ts = Date.now();
    const origPath = `${PREFIX}/${ts}-orig.jpg`;
    const swapPath = `${PREFIX}/${ts + 1}-swap.jpg`;

    const [origRes, swapRes] = await Promise.all([
      admin.storage.from(BUCKET).createSignedUploadUrl(origPath),
      admin.storage.from(BUCKET).createSignedUploadUrl(swapPath),
    ]);
    if (origRes.error) throw new Error(origRes.error.message);
    if (swapRes.error) throw new Error(swapRes.error.message);

    return {
      ok: true,
      orig: {
        signedUrl: origRes.data.signedUrl,
        publicUrl: admin.storage.from(BUCKET).getPublicUrl(origPath).data.publicUrl,
      },
      swap: {
        signedUrl: swapRes.data.signedUrl,
        publicUrl: admin.storage.from(BUCKET).getPublicUrl(swapPath).data.publicUrl,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── HIGH-PASS FILTER ─────────────────────────────────────────────────────────

async function applyHighPass(buf: Buffer, sigma: number, amplify = 2.0): Promise<Buffer> {
  const { data: origData, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const blurData = await sharp(buf).removeAlpha().blur(Math.max(0.3, sigma)).raw().toBuffer();
  const hpData = Buffer.allocUnsafe(origData.length);
  for (let i = 0; i < origData.length; i++) {
    hpData[i] = Math.max(0, Math.min(255, 128 + (origData[i] - blurData[i]) * amplify));
  }
  // 무손실 PNG는 고해상도 이미지에서 Storage 업로드 크기 제한을 넘길 수 있어 JPEG로 저장 (디버그용이라 손실 무관)
  return sharp(hpData, { raw: { width: info.width, height: info.height, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
}

// ── PIECEWISE AFFINE WARP ────────────────────────────────────────────────────
// 각 삼각형에 대해 affine 역변환 → 원본 픽셀 이중선형 샘플링

function computeAffine(
  srcPts: [Point, Point, Point],
  dstPts: [Point, Point, Point],
): { a: number; b: number; c: number; d: number; e: number; f: number } {
  // dst = A * src + t
  // [x'] = [a b] [x] + [e]
  // [y']   [c d] [y]   [f]
  // Solve for a,b,c,d,e,f via 3-point correspondence
  const [s0, s1, s2] = srcPts;
  const [d0, d1, d2] = dstPts;

  const denom =
    (s0.x - s2.x) * (s1.y - s2.y) - (s1.x - s2.x) * (s0.y - s2.y);
  if (Math.abs(denom) < 1e-10) return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

  const invD = 1 / denom;
  const a = ((d0.x - d2.x) * (s1.y - s2.y) - (d1.x - d2.x) * (s0.y - s2.y)) * invD;
  const b = ((d0.x - d2.x) * (s2.x - s1.x) + (d1.x - d2.x) * (s0.x - s2.x)) * invD;
  const e = d0.x - a * s0.x - b * s0.y;
  const c = ((d0.y - d2.y) * (s1.y - s2.y) - (d1.y - d2.y) * (s0.y - s2.y)) * invD;
  const dd = ((d0.y - d2.y) * (s2.x - s1.x) + (d1.y - d2.y) * (s0.x - s2.x)) * invD;
  const f = d0.y - c * s0.x - dd * s0.y;
  return { a, b, c, d: dd, e, f };
}

function invertAffine(T: { a: number; b: number; c: number; d: number; e: number; f: number }) {
  const det = T.a * T.d - T.b * T.c;
  if (Math.abs(det) < 1e-10) return T;
  const inv = 1 / det;
  const ia = T.d * inv;
  const ib = -T.b * inv;
  const ic = -T.c * inv;
  const id = T.a * inv;
  const ie = -(ia * T.e + ib * T.f);
  const if_ = -(ic * T.e + id * T.f);
  return { a: ia, b: ib, c: ic, d: id, e: ie, f: if_ };
}

// ── 얼굴 전체 회전/스케일 사전 정렬 (2점 similarity transform) ────────────────
// 삼각형별 affine만으로는 "얼굴 전체가 얼마나 기울어져 있는지"를 보정하지 못한다.
// 원본과 스왑 이미지에서 같은 인물의 머리 각도가 다르면(예: 원본은 고개를 기울이고
// 스왑은 정면), 삼각형 단위 왜곡이 쌓여 눈·코 위치가 어긋나 보인다. 양쪽 눈의
// 바깥쪽 코너 2점(가장 변형이 적은 안정적인 기준점)만으로 회전+스케일+이동을
// 먼저 맞춰서, 삼각형별 보정은 그 잔차(표정 차이 등)만 처리하게 한다.
function similarityFromTwoPoints(
  srcP1: Point, srcP2: Point, dstP1: Point, dstP2: Point,
): { apply: (p: Point) => Point; applyInverse: (p: Point) => Point } {
  const dsx = srcP2.x - srcP1.x, dsy = srcP2.y - srcP1.y;
  const ddx = dstP2.x - dstP1.x, ddy = dstP2.y - dstP1.y;
  const srcLenSq = dsx * dsx + dsy * dsy || 1e-10;
  // 회전+스케일을 하나의 복소수 배율 r로 표현: r = d_dst / d_src (복소수 나눗셈)
  const rRe = (ddx * dsx + ddy * dsy) / srcLenSq;
  const rIm = (ddy * dsx - ddx * dsy) / srcLenSq;
  const rLenSq = rRe * rRe + rIm * rIm || 1e-10;
  const invRe = rRe / rLenSq;
  const invIm = -rIm / rLenSq;

  return {
    apply: (p: Point): Point => {
      const vx = p.x - srcP1.x, vy = p.y - srcP1.y;
      return { x: dstP1.x + (vx * rRe - vy * rIm), y: dstP1.y + (vx * rIm + vy * rRe) };
    },
    applyInverse: (p: Point): Point => {
      const vx = p.x - dstP1.x, vy = p.y - dstP1.y;
      return { x: srcP1.x + (vx * invRe - vy * invIm), y: srcP1.y + (vx * invIm + vy * invRe) };
    },
  };
}

function pointInTriangle(px: number, py: number, p0: Point, p1: Point, p2: Point): boolean {
  const dX = px - p2.x, dY = py - p2.y;
  const dX21 = p2.x - p1.x, dY12 = p1.y - p2.y;
  const D = dY12 * (p0.x - p2.x) + dX21 * (p0.y - p2.y);
  const s = dY12 * dX + dX21 * dY;
  const t = (p2.y - p0.y) * dX + (p0.x - p2.x) * dY;
  if (D < 0) return s <= 0 && t <= 0 && s + t >= D;
  return s >= 0 && t >= 0 && s + t <= D;
}

function bilinear(raw: Buffer, w: number, h: number, fx: number, fy: number): [number, number, number] {
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  if (x0 < 0 || y0 < 0 || x0 >= w - 1 || y0 >= h - 1) {
    const cx = Math.max(0, Math.min(w - 1, x0));
    const cy = Math.max(0, Math.min(h - 1, y0));
    const p = (cy * w + cx) * 3;
    return [raw[p], raw[p + 1], raw[p + 2]];
  }
  const dx = fx - x0, dy = fy - y0;
  const w00 = (1 - dx) * (1 - dy), w01 = dx * (1 - dy), w10 = (1 - dx) * dy, w11 = dx * dy;
  const p00 = (y0 * w + x0) * 3;
  return [
    Math.round(w00 * raw[p00] + w01 * raw[p00 + 3] + w10 * raw[p00 + w * 3] + w11 * raw[p00 + w * 3 + 3]),
    Math.round(w00 * raw[p00 + 1] + w01 * raw[p00 + 4] + w10 * raw[p00 + w * 3 + 1] + w11 * raw[p00 + w * 3 + 4]),
    Math.round(w00 * raw[p00 + 2] + w01 * raw[p00 + 5] + w10 * raw[p00 + w * 3 + 2] + w11 * raw[p00 + w * 3 + 5]),
  ];
}

// ── MAIN ACTION ──────────────────────────────────────────────────────────────

export async function runMediaPipeTransfer(params: {
  origUrl: string;
  swapUrl: string;
  landmarksOrigList: Point[][];
  landmarksSwapList: Point[][];
  triangles: Triangle[];
  faceContour: number[];
  blend: number;
  sigma: number;
}): Promise<
  | { ok: true; resultUrl: string; warpedUrl: string; highPassUrl: string; maskUrl: string }
  | { ok: false; error: string }
> {
  try {
    await requireAdmin();

    const { origUrl, swapUrl, landmarksOrigList, landmarksSwapList, triangles, faceContour } = params;
    const blendRatio = Math.max(0, Math.min(1, params.blend));
    const sigma = Math.max(0.3, params.sigma);

    if (landmarksOrigList.length === 0 || landmarksOrigList.length !== landmarksSwapList.length) {
      return { ok: false, error: "원본/스왑 얼굴 매칭 수가 일치하지 않습니다." };
    }

    // 두 이미지 다운로드 (클라이언트에서 Supabase에 업로드한 URL)
    const [origBuf, swapBuf] = await Promise.all([
      downloadBuffer(origUrl),
      downloadBuffer(swapUrl),
    ]);

    const swapMeta = await sharp(swapBuf).metadata();
    const baseW = swapMeta.width!;
    const baseH = swapMeta.height!;

    const origMeta = await sharp(origBuf).metadata();
    const origW = origMeta.width!;
    const origH = origMeta.height!;

    // 원본 이미지 raw 픽셀
    const { data: origRaw } = await sharp(origBuf).removeAlpha().toColorspace("srgb").raw().toBuffer({ resolveWithObject: true });
    const { data: swapRaw } = await sharp(swapBuf).removeAlpha().toColorspace("srgb").raw().toBuffer({ resolveWithObject: true });

    type TriAffine = { inv: ReturnType<typeof invertAffine>; dst: [Point, Point, Point] };

    // MediaPipe FACE_OVAL 컨투어는 눈높이 위로는 헤어라인까지 못 미치고 일찍 끝나서
    // 이마가 마스크/워프 대상에서 빠지는 경우가 있다. 눈높이를 기준 삼아 위로 갈수록
    // 점을 밀어올리되, 고정 비율이 아니라 "스왑 이미지에서 실제 피부색이 유지되는
    // 지점"까지만 픽셀 색상을 검사해 정확히 멈춰서 머리카락 영역을 침범하지 않게 한다.
    const FOREHEAD_EXTEND_RATIO = 0.35; // 색상 경계를 못 찾았을 때의 안전 상한선일 뿐, 보통 이보다 훨씬 일찍 멈춘다
    const TOP_IDX = 10;    // 이마 정점(헤어라인 중앙)
    const CHIN_IDX = 152;  // 턱 끝
    const EYE_L_IDX = 33;  // 오른쪽 눈 바깥쪽 코너
    const EYE_R_IDX = 263; // 왼쪽 눈 바깥쪽 코너
    const CHEEK_L_IDX = 50;  // 오른쪽 볼 (안정적인 피부색 기준 샘플)
    const CHEEK_R_IDX = 280; // 왼쪽 볼
    const SKIN_COLOR_THRESHOLD = 40; // RGB 유클리드 거리 — 이보다 색이 달라지면 머리카락으로 판단
    // 머리카락 경계 바로 앞 그림자 전환부에서 색상 판정이 너무 일찍 멈춰 이마가
    // 얇게 안 덮이는 경우가 있어, 감지된 경계에서 얼굴 크기에 비례해 조금 더 밀어올린다.
    // (그 결과 머리카락을 살짝 침범할 수 있지만, soft-light 블렌드라 티가 잘 안 나고
    // 빠진 부분이 남는 것보다는 덮고 나서 나중에 경계를 다듬는 쪽이 낫다)
    const FOREHEAD_MARGIN_RATIO = 0.06;

    function colorDist(a: [number, number, number], b: [number, number, number]): number {
      const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
      return Math.sqrt(dr * dr + dg * dg + db * db);
    }

    // x 좌표를 고정한 채 startY에서 위로(y 감소 방향) 한 픽셀씩 색을 검사하며,
    // 기준 피부색(skinColor)과 크게 달라지는(=머리카락 시작) 지점 바로 앞까지의 y를 반환한다.
    function findSkinBoundaryY(
      raw: Buffer, w: number, h: number,
      x: number, startY: number, maxExtendPx: number,
      skinColor: [number, number, number],
    ): number {
      const step = 2;
      let lastGoodY = startY;
      for (let d = step; d <= maxExtendPx; d += step) {
        const y = startY - d;
        if (y < 0) break;
        const c = bilinear(raw, w, h, x, y);
        if (colorDist(c, skinColor) > SKIN_COLOR_THRESHOLD) break;
        lastGoodY = y;
      }
      return lastGoodY;
    }

    // orig/swap 컨투어를 함께 확장한다. 스왑 쪽은 "얼마나 덮고 싶은지"(피부색 경계 + 여유
    // 마진)를 결정하고, 원본 쪽은 "실제로 워프에 쓸 진짜 피부가 있는지"를 독립적으로
    // 검사한다. 둘 중 더 보수적인(짧은) 비율만 실제로 적용해, 원본 이미지 자신의
    // 머리카락이 스왑의 이마 확장 영역으로 잘못 이식되는 것(검은 얼룩)을 막는다.
    function computeExtendedOvalPair(
      origAllPts: Point[], swapAllPts: Point[], contourIdx: number[],
    ): { origExt: Point[]; swapExt: Point[] } {
      const origTop = origAllPts[TOP_IDX];
      const swapTop = swapAllPts[TOP_IDX];
      const origFaceH = Math.abs(origAllPts[CHIN_IDX].y - origTop.y) || 1;
      const swapFaceH = Math.abs(swapAllPts[CHIN_IDX].y - swapTop.y) || 1;
      const origEyeY = (origAllPts[EYE_L_IDX].y + origAllPts[EYE_R_IDX].y) / 2;
      const swapEyeY = (swapAllPts[EYE_L_IDX].y + swapAllPts[EYE_R_IDX].y) / 2;
      const origDenom = origEyeY - origTop.y || 1;
      const swapDenom = swapEyeY - swapTop.y || 1;

      const origExt: Point[] = [];
      const swapExt: Point[] = [];
      for (const idx of contourIdx) {
        const op = origAllPts[idx];
        const sp = swapAllPts[idx];
        const swapWeight = Math.max(0, Math.min(1, (swapEyeY - sp.y) / swapDenom));
        const origWeight = Math.max(0, Math.min(1, (origEyeY - op.y) / origDenom));

        if (swapWeight <= 0 && origWeight <= 0) {
          origExt.push(op);
          swapExt.push(sp);
          continue;
        }

        // 스왑 쪽: 얼마나 덮고 싶은지 (피부색 경계 + 여유 마진)
        const swapMaxExtendPx = swapWeight * swapFaceH * FOREHEAD_EXTEND_RATIO;
        const swapSkinColor = bilinear(swapRaw, baseW, baseH, sp.x, sp.y);
        const swapDetectedY = findSkinBoundaryY(swapRaw, baseW, baseH, sp.x, sp.y, swapMaxExtendPx, swapSkinColor);
        const swapMargin = swapWeight * swapFaceH * FOREHEAD_MARGIN_RATIO;
        const swapGoalY = Math.max(swapDetectedY - swapMargin, sp.y - swapMaxExtendPx);
        const swapFraction = swapMaxExtendPx > 0 ? (sp.y - swapGoalY) / swapMaxExtendPx : 0;

        // 원본 쪽: 실제로 워프 소스로 쓸 수 있는 진짜 피부가 어디까지인지 (머리카락 침범 방지)
        const origMaxExtendPx = origWeight * origFaceH * FOREHEAD_EXTEND_RATIO;
        const origSkinColor = bilinear(origRaw, origW, origH, op.x, op.y);
        const origDetectedY = findSkinBoundaryY(origRaw, origW, origH, op.x, op.y, origMaxExtendPx, origSkinColor);
        const origFraction = origMaxExtendPx > 0 ? (op.y - origDetectedY) / origMaxExtendPx : 0;

        // 둘 중 더 보수적인 비율만큼만 실제로 확장 — 원본에 피부가 없으면 스왑도 그 이상 못 늘린다
        const fraction = Math.min(swapFraction, origFraction);

        swapExt.push({ x: sp.x, y: sp.y - swapWeight * swapFaceH * FOREHEAD_EXTEND_RATIO * fraction });
        origExt.push({ x: op.x, y: op.y - origWeight * origFaceH * FOREHEAD_EXTEND_RATIO * fraction });
      }
      return { origExt, swapExt };
    }

    // 인물별로 독립적으로 랜드마크 → 픽셀 좌표 변환 + 삼각형 역변환 계산
    // (얼굴마다 자기 자신의 468개 랜드마크만 사용하므로 인물끼리 서로 섞이지 않는다)
    const faces = landmarksOrigList.map((landmarksOrig, i) => {
      const landmarksSwap = landmarksSwapList[i];
      const origPts: Point[] = landmarksOrig.map((p) => ({ x: p.x * origW, y: p.y * origH }));
      const swapPts: Point[] = landmarksSwap.map((p) => ({ x: p.x * baseW, y: p.y * baseH }));

      // 원본/스왑 이미지에서 같은 인물의 머리 각도가 다르면(예: 원본은 고개를
      // 기울이고 스왑은 정면) 삼각형별 affine만으로는 전체 회전을 보정 못 해
      // 눈·코 위치가 어긋난다. 양쪽 눈 바깥쪽 코너 2점으로 먼저 회전+스케일을
      // 맞춘 "정렬된 원본 좌표"를 만들어, 삼각형별 affine은 그 잔차(표정 차이
      // 등)만 처리하게 한다. 실제 픽셀은 항상 원본 이미지의 진짜 좌표(origRaw
      // 기준)에서 샘플링해야 하므로, 워프 계산엔 alignedOrigPts를 쓰고 샘플링
      // 시점에만 align.applyInverse로 진짜 좌표로 되돌린다.
      const align = similarityFromTwoPoints(
        origPts[EYE_L_IDX], origPts[EYE_R_IDX],
        swapPts[EYE_L_IDX], swapPts[EYE_R_IDX],
      );
      const alignedOrigPts = origPts.map(align.apply);

      // orig → swap 방향: warp 결과 픽셀(swap 공간)에서 orig 픽셀 찾기
      // fwd: alignedOrig_pt → swap_pt / inv: swap_pt → alignedOrig_pt
      const triAffines: TriAffine[] = triangles.map((tri) => {
        const [i0, i1, i2] = tri;
        const fwd = computeAffine(
          [alignedOrigPts[i0], alignedOrigPts[i1], alignedOrigPts[i2]],
          [swapPts[i0], swapPts[i1], swapPts[i2]],
        );
        const inv = invertAffine(fwd);
        return { inv, dst: [swapPts[i0], swapPts[i1], swapPts[i2]] as [Point, Point, Point] };
      });

      let contourPts: Point[] | null = null;
      let origContourPts: Point[] | null = null;
      const skinColor: [number, number, number] = bilinear(
        swapRaw, baseW, baseH,
        (swapPts[CHEEK_L_IDX].x + swapPts[CHEEK_R_IDX].x) / 2,
        (swapPts[CHEEK_L_IDX].y + swapPts[CHEEK_R_IDX].y) / 2,
      );
      if (faceContour.length > 2) {
        // 헤어라인 감지(computeExtendedOvalPair)는 실제 원본 픽셀(origRaw)의
        // 진짜 좌표를 검사해야 하므로 origPts(정렬 전)를 그대로 넘긴다.
        const { origExt, swapExt } = computeExtendedOvalPair(origPts, swapPts, faceContour);
        contourPts = swapExt; // 마스크는 확장된(이마 포함) 컨투어를 사용
        origContourPts = faceContour.map((idx) => swapPts[idx]); // 확장 전 원래 오벌 (색상 보정 없이 항상 포함)

        // 확장한 이마 영역도 실제로 원본 피부 질감이 채워지도록, 원래 오벌 테두리와
        // 확장된 테두리 사이를 "스커트" 삼각형으로 이어 워프 대상에 추가한다.
        // (눈높이 아래 구간은 확장량이 0이라 삼각형이 퇴화되어 아무 영향 없다)
        // srcTri는 alignedOrigPts와 같은 정렬된 공간으로 맞춰야 하므로 align.apply를 거친다.
        for (let k = 0; k < faceContour.length - 1; k++) {
          const o0 = align.apply(origPts[faceContour[k]]);
          const o1 = align.apply(origPts[faceContour[k + 1]]);
          const oe0 = align.apply(origExt[k]);
          const oe1 = align.apply(origExt[k + 1]);
          const s0 = swapPts[faceContour[k]];
          const s1 = swapPts[faceContour[k + 1]];
          const se0 = swapExt[k];
          const se1 = swapExt[k + 1];

          const skirtTris: [[Point, Point, Point], [Point, Point, Point]][] = [
            [[o0, o1, oe1], [s0, s1, se1]],
            [[o0, oe1, oe0], [s0, se1, se0]],
          ];
          for (const [srcTri, dstTri] of skirtTris) {
            const fwd = computeAffine(srcTri, dstTri);
            const inv = invertAffine(fwd);
            triAffines.push({ inv, dst: dstTri });
          }
        }
      }
      return { triAffines, contourPts, origContourPts, skinColor, align };
    });

    // 얼굴 마스크: 얼굴별 폴리곤(또는 삼각형 합집합)을 모두 합쳐 마스크 버퍼(0 or 255)에 채운다.
    // 인물별로 독립적으로 scanline fill 하므로 서로 다른 인물의 컨투어가 하나의 폴리곤으로
    // 잘못 이어지는 문제(2인 이상일 때 마스크가 깨지는 버그)가 없다.
    const maskData = Buffer.alloc(baseW * baseH, 0);

    function scanlineSpans(pts: Point[], y: number): [number, number][] {
      const intersections: number[] = [];
      for (let k = 0; k < pts.length; k++) {
        const p1 = pts[k];
        const p2 = pts[(k + 1) % pts.length];
        if ((p1.y <= y && p2.y > y) || (p2.y <= y && p1.y > y)) {
          const x = p1.x + ((y - p1.y) / (p2.y - p1.y)) * (p2.x - p1.x);
          intersections.push(x);
        }
      }
      intersections.sort((a, b) => a - b);
      const spans: [number, number][] = [];
      for (let k = 0; k < intersections.length - 1; k += 2) {
        spans.push([intersections[k], intersections[k + 1]]);
      }
      return spans;
    }

    function inSpans(x: number, spans: [number, number][]): boolean {
      for (const [a, b] of spans) if (x >= a && x <= b) return true;
      return false;
    }

    for (const { triAffines, contourPts, origContourPts, skinColor } of faces) {
      if (contourPts) {
        for (let y = 0; y < baseH; y++) {
          const extSpans = scanlineSpans(contourPts, y);
          if (extSpans.length === 0) continue;
          const innerSpans = origContourPts ? scanlineSpans(origContourPts, y) : [];
          for (const [xStartF, xEndF] of extSpans) {
            const xStart = Math.max(0, Math.ceil(xStartF));
            const xEnd = Math.min(baseW - 1, Math.floor(xEndF));
            for (let x = xStart; x <= xEnd; x++) {
              if (inSpans(x, innerSpans)) {
                // 원래(확장 전) 오벌 내부 — 이미 잘 작동하던 영역이므로 색상 검사 없이 그대로 포함
                maskData[y * baseW + x] = 255;
              } else {
                // 이마 확장으로 새로 추가된 "스커트" 영역 — 머리카락이 섞여 있을 수 있으므로
                // 피부색과 비슷할 때만 포함해 자동으로 침범 부분을 제외한다
                const c = bilinear(swapRaw, baseW, baseH, x, y);
                if (colorDist(c, skinColor) <= SKIN_COLOR_THRESHOLD) {
                  maskData[y * baseW + x] = 255;
                }
              }
            }
          }
        }
      } else {
        // contour 없으면 해당 얼굴의 삼각형 합집합으로 마스크 생성
        for (const { dst } of triAffines) {
          const minY = Math.max(0, Math.floor(Math.min(dst[0].y, dst[1].y, dst[2].y)));
          const maxY = Math.min(baseH - 1, Math.ceil(Math.max(dst[0].y, dst[1].y, dst[2].y)));
          const minX = Math.max(0, Math.floor(Math.min(dst[0].x, dst[1].x, dst[2].x)));
          const maxX = Math.min(baseW - 1, Math.ceil(Math.max(dst[0].x, dst[1].x, dst[2].x)));
          for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
              if (pointInTriangle(x, y, dst[0], dst[1], dst[2])) {
                maskData[y * baseW + x] = 255;
              }
            }
          }
        }
      }
    }

    // 마스크 가우시안 블러 (경계 부드럽게)
    const maskBuf = await sharp(maskData, { raw: { width: baseW, height: baseH, channels: 1 } })
      .png()
      .toBuffer();
    const blurredMaskBuf = await sharp(maskBuf).blur(8).toBuffer();
    const { data: blurredMask } = await sharp(blurredMaskBuf).grayscale().raw().toBuffer({ resolveWithObject: true });

    // 피스와이즈 어파인 워프: swap 공간 각 픽셀 → 해당하는 삼각형 찾아 orig 샘플링 (얼굴별로 반복)
    const warpedRaw = Buffer.from(swapRaw); // 초기값: swap 이미지

    for (const { triAffines, align } of faces) {
      for (const { inv, dst } of triAffines) {
        const minY = Math.max(0, Math.floor(Math.min(dst[0].y, dst[1].y, dst[2].y)));
        const maxY = Math.min(baseH - 1, Math.ceil(Math.max(dst[0].y, dst[1].y, dst[2].y)));
        const minX = Math.max(0, Math.floor(Math.min(dst[0].x, dst[1].x, dst[2].x)));
        const maxX = Math.min(baseW - 1, Math.ceil(Math.max(dst[0].x, dst[1].x, dst[2].x)));

        for (let oy = minY; oy <= maxY; oy++) {
          for (let ox = minX; ox <= maxX; ox++) {
            if (!pointInTriangle(ox, oy, dst[0], dst[1], dst[2])) continue;
            // 역변환으로 "정렬된 원본" 좌표를 구한 뒤, align.applyInverse로 진짜
            // 원본 이미지 픽셀 좌표로 되돌려서 샘플링한다 (원본 픽셀은 항상
            // origRaw의 실제 좌표계에 있으므로).
            const ax = inv.a * ox + inv.b * oy + inv.e;
            const ay = inv.c * ox + inv.d * oy + inv.f;
            const { x: ix, y: iy } = align.applyInverse({ x: ax, y: ay });
            const [r, g, b] = bilinear(origRaw, origW, origH, ix, iy);
            const po = (oy * baseW + ox) * 3;
            warpedRaw[po] = r;
            warpedRaw[po + 1] = g;
            warpedRaw[po + 2] = b;
          }
        }
      }
    }

    // 무손실 PNG는 고해상도 이미지에서 Storage 업로드 크기 제한을 넘길 수 있어 JPEG로 저장 (디버그용이라 손실 무관)
    const warpedBuf = await sharp(warpedRaw, { raw: { width: baseW, height: baseH, channels: 3 } })
      .jpeg({ quality: 90 })
      .toBuffer();

    // high-pass: warpedBuf 기준으로 생성
    const highPassBuf = await applyHighPass(warpedBuf, sigma);

    // soft-light 블렌딩: swap 이미지 위에 highpass 적용
    const { data: hpData } = await sharp(highPassBuf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const resultRaw = Buffer.from(swapRaw);

    for (let i = 0; i < baseW * baseH; i++) {
      const maskAlpha = (blurredMask[i] / 255) * blendRatio;
      if (maskAlpha < 0.01) continue;
      const po = i * 3;
      for (let c = 0; c < 3; c++) {
        const base = swapRaw[po + c] / 255;
        const blend = hpData[po + c] / 255;
        // soft-light 공식
        let sl: number;
        if (blend <= 0.5) {
          sl = base - (1 - 2 * blend) * base * (1 - base);
        } else {
          const d = base <= 0.25 ? ((16 * base - 12) * base + 4) * base : Math.sqrt(base);
          sl = base + (2 * blend - 1) * (d - base);
        }
        const result = base * (1 - maskAlpha) + sl * maskAlpha;
        resultRaw[po + c] = Math.max(0, Math.min(255, Math.round(result * 255)));
      }
    }

    const resultBuf = await sharp(resultRaw, { raw: { width: baseW, height: baseH, channels: 3 } })
      .jpeg({ quality: 92 })
      .toBuffer();

    // 마스크 디버그 이미지 업로드 (흰색=얼굴 영역)
    const maskDebugBuf = await sharp(maskData, { raw: { width: baseW, height: baseH, channels: 1 } })
      .png()
      .toBuffer();

    const [resultUrl, warpedUrl, highPassUrl, maskUrl] = await Promise.all([
      uploadBuffer(resultBuf, "result.jpg", "image/jpeg"),
      uploadBuffer(warpedBuf, "dbg-warped.jpg", "image/jpeg"),
      uploadBuffer(highPassBuf, "dbg-highpass.jpg", "image/jpeg"),
      uploadBuffer(maskDebugBuf, "dbg-mask.png", "image/png"),
    ]);

    return { ok: true, resultUrl, warpedUrl, highPassUrl, maskUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
