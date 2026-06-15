import type { Mood, PaletteId, ThemeTokens } from "./types";

/**
 * Q1 분위기 — ported from `MOOD_THEMES` (bloomcard_prototype.html line ~4906).
 * The prototype's dark `premium` variant is intentionally omitted (premium
 * screens are out of scope for this pass).
 */
export const MOOD_THEMES: Record<Mood, ThemeTokens> = {
  romantic: {
    bg: "#fff5f2",
    ink: "#2c1520",
    inkSoft: "#7a4a55",
    inkFaint: "#c4909a",
    accent: "#d4848c",
    accentDeep: "#b05660",
    line: "#f0d0d4",
    lineSoft: "#f8e8ea",
    coverBg: "linear-gradient(180deg, #fff5f2 0%, #f8d4d8 100%)",
  },
  modern: {
    bg: "#e8e8ec",
    ink: "#111111",
    inkSoft: "#555558",
    inkFaint: "#9898a0",
    accent: "#9898a8",
    accentDeep: "#505058",
    line: "#d4d4da",
    lineSoft: "#ebebf0",
    coverBg: "linear-gradient(180deg, #e8e8ec 0%, #d4d4dc 100%)",
  },
  classic: {
    bg: "#f8f3e8",
    ink: "#1e1a10",
    inkSoft: "#5a4f38",
    inkFaint: "#9c8e6c",
    accent: "#8a7040",
    accentDeep: "#5c4a20",
    line: "#ddd0b0",
    lineSoft: "#ede4cc",
    coverBg: "linear-gradient(180deg, #f8f3e8 0%, #e8d8a8 100%)",
  },
  vintage: {
    bg: "#ede0cc",
    ink: "#2a1e10",
    inkSoft: "#6a5038",
    inkFaint: "#a8906c",
    accent: "#7a5c38",
    accentDeep: "#4e3420",
    line: "#c8b090",
    lineSoft: "#ddd0b8",
    coverBg: "linear-gradient(180deg, #ede0cc 0%, #c8a878 100%)",
  },
  vivid: {
    bg: "#fff0fc",
    ink: "#1a0a2a",
    inkSoft: "#6040a0",
    inkFaint: "#b090d0",
    accent: "#e8208a",
    accentDeep: "#a81068",
    line: "#f0c0e8",
    lineSoft: "#f8e0f4",
    coverBg:
      "linear-gradient(135deg, #ff6eb4 0%, #ffb347 30%, #ffee58 55%, #48d1cc 80%, #9b59b6 100%)",
  },
  korean: {
    bg: "#f7edd8",
    ink: "#1c0e08",
    inkSoft: "#6a4828",
    inkFaint: "#b09060",
    accent: "#c43828",
    accentDeep: "#8a2010",
    line: "#c8a060",
    lineSoft: "#e0c898",
    coverBg: "linear-gradient(180deg, #f7edd8 0%, #e8d098 100%)",
  },
};

/**
 * Q4 색감 — Q1의 기본 팔레트 위에 덮어쓰는 오버레이.
 * Ported from `PALETTE_OVERLAYS` (bloomcard_prototype.html line ~4953).
 */
export const PALETTE_OVERLAYS: Record<PaletteId, Partial<ThemeTokens>> = {
  warm: { bg: "#fbf0e6", accent: "#c98870", accentDeep: "#8a4c2c" },
  neutral: { bg: "#f5f4f0", accent: "#888778", accentDeep: "#5a5953" },
  gold: { bg: "#ffffff", accent: "#c8a96a", accentDeep: "#8a7048" },
  deep: {
    bg: "#1a1a2a",
    ink: "#d4c098",
    inkSoft: "rgba(212,192,152,0.7)",
    inkFaint: "rgba(212,192,152,0.4)",
    accent: "#d4c098",
    accentDeep: "#a08868",
    line: "rgba(212,192,152,0.14)",
    lineSoft: "rgba(212,192,152,0.08)",
    coverBg: "linear-gradient(180deg, #1a1a2a 0%, #0a0a1a 100%)",
  },
};

/** 분위기별 표지 샘플 사진 — Unsplash (`COVER_PHOTOS`, line ~5275) */
export const COVER_PHOTOS: Record<Mood, string> = {
  romantic:
    "https://images.unsplash.com/photo-1537633552985-df8429e8048b?w=430&h=760&fit=crop&q=85",
  modern:
    "https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=430&h=760&fit=crop&q=85",
  classic:
    "https://images.unsplash.com/photo-1550005809-91ad75fb315f?w=430&h=760&fit=crop&q=85",
  vintage:
    "https://images.unsplash.com/photo-1523438885200-e635ba2c371e?w=430&h=760&fit=crop&q=85",
  vivid:
    "https://images.unsplash.com/photo-1529636798458-92182e662485?w=430&h=760&fit=crop&q=85",
  korean:
    "https://images.unsplash.com/photo-1529636798458-92182e662485?w=430&h=760&fit=crop&q=85",
};

/** Q1 분위기 영문 라벨 (`MOOD_LABEL`, line ~5063) */
export const MOOD_LABEL: Record<Mood, string> = {
  romantic: "ROMANTIC",
  modern: "MODERN MINIMAL",
  classic: "CLASSIC ELEGANT",
  vintage: "VINTAGE",
  vivid: "VIVID",
  korean: "KOREAN TRADITIONAL",
};

/** Q1 분위기 + Q4 색감을 합성한 최종 테마 토큰 (`computeTheme`, line ~5265) */
export function computeTheme(mood: Mood, palette?: PaletteId): ThemeTokens {
  const base = MOOD_THEMES[mood] ?? MOOD_THEMES.modern;
  const overlay = palette ? PALETTE_OVERLAYS[palette] : undefined;
  return overlay ? { ...base, ...overlay } : { ...base };
}
