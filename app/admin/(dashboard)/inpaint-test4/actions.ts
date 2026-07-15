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

async function uploadFile(file: File, name: string): Promise<string> {
  return uploadBuffer(new Uint8Array(await file.arrayBuffer()), name, file.type || "image/jpeg");
}

async function downloadBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`다운로드 실패(${url}): ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── HIGH-PASS FILTER ─────────────────────────────────────────────────────────

async function applyHighPass(buf: Buffer, sigma: number, amplify = 2.0): Promise<Buffer> {
  const { data: origData, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const blurData = await sharp(buf).removeAlpha().blur(Math.max(0.3, sigma)).raw().toBuffer();
  const hpData = Buffer.allocUnsafe(origData.length);
  for (let i = 0; i < origData.length; i++) {
    hpData[i] = Math.max(0, Math.min(255, 128 + (origData[i] - blurData[i]) * amplify));
  }
  return sharp(hpData, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toBuffer();
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

export async function runMediaPipeTransfer(formData: FormData): Promise<
  | { ok: true; resultUrl: string; warpedUrl: string; highPassUrl: string; maskUrl: string }
  | { ok: false; error: string }
> {
  try {
    await requireAdmin();

    const origFile = formData.get("orig") as File | null;
    const swapFile = formData.get("swap") as File | null;
    const landmarksOrigRaw = formData.get("landmarksOrig") as string | null;
    const landmarksSwapRaw = formData.get("landmarksSwap") as string | null;
    const trianglesRaw = formData.get("triangles") as string | null;
    const blendStr = formData.get("blend") as string | null;
    const sigmaStr = formData.get("sigma") as string | null;
    const faceContourRaw = formData.get("faceContour") as string | null;

    if (!origFile || !swapFile || !landmarksOrigRaw || !landmarksSwapRaw || !trianglesRaw) {
      return { ok: false, error: "필수 데이터 누락" };
    }

    const landmarksOrig: Point[] = JSON.parse(landmarksOrigRaw);
    const landmarksSwap: Point[] = JSON.parse(landmarksSwapRaw);
    const triangles: Triangle[] = JSON.parse(trianglesRaw);
    const faceContour: number[] = faceContourRaw ? JSON.parse(faceContourRaw) : [];
    const blendRatio = Math.max(0, Math.min(1, parseFloat(blendStr ?? "0.7")));
    const sigma = Math.max(0.3, parseFloat(sigmaStr ?? "1.5"));

    // 두 이미지 로드
    const [origBuf, swapBuf] = await Promise.all([
      origFile.arrayBuffer().then(Buffer.from),
      swapFile.arrayBuffer().then(Buffer.from),
    ]);

    const swapMeta = await sharp(swapBuf).metadata();
    const baseW = swapMeta.width!;
    const baseH = swapMeta.height!;

    const origMeta = await sharp(origBuf).metadata();
    const origW = origMeta.width!;
    const origH = origMeta.height!;

    // 랜드마크를 각 이미지의 픽셀 좌표로 변환 (normalize → pixel)
    const origPts: Point[] = landmarksOrig.map((p) => ({
      x: p.x * origW,
      y: p.y * origH,
    }));
    const swapPts: Point[] = landmarksSwap.map((p) => ({
      x: p.x * baseW,
      y: p.y * baseH,
    }));

    // 원본 이미지 raw 픽셀
    const { data: origRaw } = await sharp(origBuf).removeAlpha().toColorspace("srgb").raw().toBuffer({ resolveWithObject: true });
    const { data: swapRaw } = await sharp(swapBuf).removeAlpha().toColorspace("srgb").raw().toBuffer({ resolveWithObject: true });

    // 각 삼각형에 대한 역변환 행렬 사전 계산
    // orig → swap 방향: warp 결과 픽셀(swap 공간)에서 orig 픽셀 찾기
    // fwd: orig_pt → swap_pt / inv: swap_pt → orig_pt
    const triAffines = triangles.map((tri) => {
      const [i0, i1, i2] = tri;
      const fwd = computeAffine(
        [origPts[i0], origPts[i1], origPts[i2]],
        [swapPts[i0], swapPts[i1], swapPts[i2]],
      );
      const inv = invertAffine(fwd);
      return {
        inv,
        dst: [swapPts[i0], swapPts[i1], swapPts[i2]] as [Point, Point, Point],
      };
    });

    // 얼굴 마스크: faceContour 랜드마크로 폴리곤 내부 픽셀 결정
    // 마스크 버퍼 (0 or 255)
    const maskData = Buffer.alloc(baseW * baseH, 0);

    if (faceContour.length > 2) {
      const contourPts = faceContour.map((idx) => swapPts[idx]);
      // scanline fill
      for (let y = 0; y < baseH; y++) {
        const intersections: number[] = [];
        for (let k = 0; k < contourPts.length; k++) {
          const p1 = contourPts[k];
          const p2 = contourPts[(k + 1) % contourPts.length];
          if ((p1.y <= y && p2.y > y) || (p2.y <= y && p1.y > y)) {
            const x = p1.x + ((y - p1.y) / (p2.y - p1.y)) * (p2.x - p1.x);
            intersections.push(x);
          }
        }
        intersections.sort((a, b) => a - b);
        for (let k = 0; k < intersections.length - 1; k += 2) {
          const xStart = Math.max(0, Math.ceil(intersections[k]));
          const xEnd = Math.min(baseW - 1, Math.floor(intersections[k + 1]));
          for (let x = xStart; x <= xEnd; x++) {
            maskData[y * baseW + x] = 255;
          }
        }
      }
    } else {
      // contour 없으면 전체 얼굴 삼각형 합집합으로 마스크 생성
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

    // 마스크 가우시안 블러 (경계 부드럽게)
    const maskBuf = await sharp(maskData, { raw: { width: baseW, height: baseH, channels: 1 } })
      .png()
      .toBuffer();
    const blurredMaskBuf = await sharp(maskBuf).blur(8).toBuffer();
    const { data: blurredMask } = await sharp(blurredMaskBuf).grayscale().raw().toBuffer({ resolveWithObject: true });

    // 피스와이즈 어파인 워프: swap 공간 각 픽셀 → 해당하는 삼각형 찾아 orig 샘플링
    const warpedRaw = Buffer.from(swapRaw); // 초기값: swap 이미지

    for (const { inv, dst } of triAffines) {
      const minY = Math.max(0, Math.floor(Math.min(dst[0].y, dst[1].y, dst[2].y)));
      const maxY = Math.min(baseH - 1, Math.ceil(Math.max(dst[0].y, dst[1].y, dst[2].y)));
      const minX = Math.max(0, Math.floor(Math.min(dst[0].x, dst[1].x, dst[2].x)));
      const maxX = Math.min(baseW - 1, Math.ceil(Math.max(dst[0].x, dst[1].x, dst[2].x)));

      for (let oy = minY; oy <= maxY; oy++) {
        for (let ox = minX; ox <= maxX; ox++) {
          if (!pointInTriangle(ox, oy, dst[0], dst[1], dst[2])) continue;
          // 역변환으로 orig 좌표 계산
          const ix = inv.a * ox + inv.b * oy + inv.e;
          const iy = inv.c * ox + inv.d * oy + inv.f;
          const [r, g, b] = bilinear(origRaw, origW, origH, ix, iy);
          const po = (oy * baseW + ox) * 3;
          warpedRaw[po] = r;
          warpedRaw[po + 1] = g;
          warpedRaw[po + 2] = b;
        }
      }
    }

    const warpedBuf = await sharp(warpedRaw, { raw: { width: baseW, height: baseH, channels: 3 } })
      .png()
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
      uploadBuffer(warpedBuf, "dbg-warped.png", "image/png"),
      uploadBuffer(highPassBuf, "dbg-highpass.png", "image/png"),
      uploadBuffer(maskDebugBuf, "dbg-mask.png", "image/png"),
    ]);

    return { ok: true, resultUrl, warpedUrl, highPassUrl, maskUrl };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
