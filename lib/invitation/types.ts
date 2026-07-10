// Core types for the BloomCard/CardStory invitation builder.
// Ported from the prototype's `state`, `QUESTIONS`, `MOOD_THEMES`,
// `PALETTE_OVERLAYS` and `GREETING_TONE` (bloomcard_prototype.html).

export type Mood =
  | "romantic"
  | "modern"
  | "classic"
  | "vintage"
  | "vivid"
  | "korean";

export type CoverType = "full" | "frame" | "split" | "mosaic" | "overlay";

export type PhotoDensity = "many" | "some" | "none";

export type MainImpression = "photo" | "floral" | "typo";

export type PaletteId = "warm" | "neutral" | "gold" | "deep";

export type SectionId =
  | "greeting"
  | "timeline"
  | "gallery"
  | "video"
  | "map"
  | "rsvp"
  | "account"
  | "guestbook";

export type MotionId =
  | "vivid"
  | "soft"
  | "still"
  | "lovely"
  | "bubble"
  | "snow"
  | "autumn"
  | "summer"
  | "lettering";

export type ToneId = "formal" | "warm" | "witty";

/** 사실 정보 — STEP 1 입력 */
export interface UserData {
  groom: string;
  bride: string;
  dateInput: string; // "2026.10.18 (토)"
  timeInput: string; // "오후 1:30"
  venue: string;
  address: string;
  groomFather: string;
  groomMother: string;
  brideFather: string;
  brideMother: string;
}

/** Q1~Q7 답변 — STEP 2 */
export interface StyleAnswers {
  mood?: Mood; // Q1
  photoDensity?: PhotoDensity; // Q2
  cover?: CoverType; // Q3
  palette?: PaletteId; // Q4
  sections?: SectionId[]; // Q5
  motion?: MotionId; // Q6
  tone?: ToneId; // Q7
  coverTextColor?: string; // PC LIVE EDITOR Q4 · 표지 텍스트 컬러
  coverTextFont?: string;  // 표지 텍스트 폰트 ID
  coverTextSize?: number;  // 표지 텍스트 폰트 사이즈 (px)
  coverTextBgColor?: string;   // 표지 텍스트 배경색 (hex)
  coverTextBgOpacity?: number; // 표지 텍스트 배경 투명도 (0-100)
  letteringText?: string; // 움직임="레터링" 선택 시 표지 상단에 타이핑되는 문구
  letteringFont?: string; // 레터링 폰트 ID (cormorant | dancing | great-vibes | pinyon | parisienne)
  letteringSize?: number; // 레터링 폰트 사이즈 (px)
  letteringColor?: string; // 레터링 텍스트 컬러 (hex)
}

/** 분위기/색감이 결정하는 색상 토큰 */
export interface ThemeTokens {
  bg: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  accent: string;
  accentDeep: string;
  line: string;
  lineSoft: string;
  coverBg: string;
}

/** 답변을 머지한 최종 렌더링 설정 */
export interface InvitationConfig {
  mood: Mood;
  cover: CoverType;
  photoDensity: PhotoDensity;
  palette?: PaletteId;
  sections: SectionId[];
  motion: MotionId;
  tone: ToneId;
  coverTextColor?: string;
  coverTextFont?: string;
  coverTextSize?: number;
  coverTextBgColor?: string;
  coverTextBgOpacity?: number;
  letteringText?: string;
  letteringFont?: string;
  letteringSize?: number;
  letteringColor?: string;
  theme: ThemeTokens;
  greeting: string;
}

/** 화면에 바인딩되는 파생 텍스트 데이터 (applyInvitationData 대응) */
export interface BoundInvitationData extends UserData {
  groomShort: string;
  brideShort: string;
  groomEn: string;
  brideEn: string;
  namesKo: string;
  venueShort: string;
  dateLong: string;
  dateDot: string;
  timeDot: string;
  datePeriod: string;
  dayTime: string;
  dateBig: string;
  timeBig: string;
  groomParents: string;
  brideParents: string;
  greeting: string;
  signature: string;
  slug: string;
}
