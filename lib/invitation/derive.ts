import type { BoundInvitationData, ToneId, UserData } from "./types";
import { buildGreeting } from "./greetings";

/* ── 한글 로마자 변환 (국립국어원 표준 로마자 표기법) ──
 * Ported from `romanizeHangul`/`romanize` (bloomcard_prototype.html line ~5161). */

const ONSET = [
  "g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj",
  "ch", "k", "t", "p", "h",
];
const NUCLEUS = [
  "a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo",
  "u", "wo", "we", "wi", "yu", "eu", "ui", "i",
];
const CODA = [
  "", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "p", "l", "l", "p",
  "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "t",
];

export function romanizeHangul(str: string): string {
  if (!str) return "";
  let result = "";
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const offset = code - 0xac00;
      const coda = offset % 28;
      const nucleus = Math.floor(offset / 28) % 21;
      const onset = Math.floor(offset / 28 / 21);
      result += ONSET[onset] + NUCLEUS[nucleus] + CODA[coda];
    } else {
      result += str[i];
    }
  }
  return result;
}

/** 성 제외 이름 부분만 영문으로 (3자 → 뒤2자, 2자 → 뒤1자) */
export function romanize(fullName: string): string {
  if (!fullName) return "";
  const isHangul = /[가-힣]/.test(fullName);
  if (!isHangul) return fullName.toUpperCase();
  const givenName =
    fullName.length >= 3
      ? fullName.slice(1)
      : fullName.slice(1) || fullName;
  const romanized = romanizeHangul(givenName);
  return romanized.charAt(0).toUpperCase() + romanized.slice(1).toLowerCase();
}

/* ── 날짜/시간 포맷 — line ~5233 ── */

const DAY_EN: Record<string, string> = {
  일: "SUN",
  월: "MON",
  화: "TUE",
  수: "WED",
  목: "THU",
  금: "FRI",
  토: "SAT",
};

const DAY_EN_LONG: Record<string, string> = {
  일: "SUNDAY",
  월: "MONDAY",
  화: "TUESDAY",
  수: "WEDNESDAY",
  목: "THURSDAY",
  금: "FRIDAY",
  토: "SATURDAY",
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December",
];

/** "오후 1:30" → "1:30 PM" */
export function parseTime(t: string): string {
  if (!t) return "";
  const isPM = /오후|PM|pm/.test(t);
  const m = t.match(/(\d{1,2}):(\d{2})/);
  if (!m) return t;
  return `${m[1]}:${m[2]} ${isPM ? "PM" : "AM"}`;
}

/** "2026.10.18 (토)" + "오후 1:30" → "2026 · 10 · 18 · SAT · 1:30 PM" */
export function buildDateLong(date: string, time: string): string {
  const m = (date || "").match(/(\d{4})[.\-\s]*(\d{1,2})[.\-\s]*(\d{1,2})/);
  const day = (date || "").match(/\(([^)]+)\)/)?.[1] || "";
  const dayEn = DAY_EN[day] || "";
  const t = parseTime(time);
  if (!m) return `${date} · ${time}`;
  return `${m[1]} · ${m[2].padStart(2, "0")} · ${m[3].padStart(2, "0")} · ${dayEn} · ${t}`;
}

/** "2026.10.18 (토)" → "October 18, 2026" */
export function buildDateBig(date: string): string {
  const m = (date || "").match(/(\d{4})[.\-\s]*(\d{1,2})[.\-\s]*(\d{1,2})/);
  if (!m) return date || "";
  return `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}`;
}

/** "2026.10.18 (토)" + "오후 1:30" → "SATURDAY · 1:30 PM" */
export function buildTimeBig(date: string, time: string): string {
  const day = (date || "").match(/\(([^)]+)\)/)?.[1] || "";
  const dayEn = DAY_EN_LONG[day] || "";
  return `${dayEn} · ${parseTime(time)}`;
}

/** 날짜 문자열에서 JS Date 추출 (D-day 계산용) */
export function parseEventDate(date: string, time: string): Date | null {
  const m = (date || "").match(/(\d{4})[.\-\s]*(\d{1,2})[.\-\s]*(\d{1,2})/);
  if (!m) return null;
  const tm = (time || "").match(/(\d{1,2}):(\d{2})/);
  const isPM = /오후|PM|pm/.test(time || "");
  let hour = tm ? parseInt(tm[1], 10) : 0;
  if (isPM && hour < 12) hour += 12;
  const minute = tm ? parseInt(tm[2], 10) : 0;
  return new Date(+m[1], +m[2] - 1, +m[3], hour, minute);
}

/** 오늘부터 행사일까지 D-day (행사일이 지났으면 음수) */
export function calcDday(date: string, time: string): number {
  const target = parseEventDate(date, time);
  if (!target) return 0;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((startOfTarget.getTime() - startOfToday.getTime()) / 86400000);
}

/* ── 화면 바인딩용 파생 데이터 — `applyInvitationData` (line ~5193) ── */
export function deriveInvitationData(
  d: UserData,
  tone?: ToneId,
): BoundInvitationData {
  const groomShort = d.groom?.length >= 3 ? d.groom.slice(1) : d.groom?.slice(1) || d.groom;
  const brideShort = d.bride?.length >= 3 ? d.bride.slice(1) : d.bride?.slice(1) || d.bride;
  const groomEn = romanize(d.groom);
  const brideEn = romanize(d.bride);
  const slug = `${groomEn.toLowerCase()}-${brideEn.toLowerCase()}`;

  return {
    ...d,
    groomShort,
    brideShort,
    groomEn,
    brideEn,
    namesKo: `${d.groom} · ${d.bride}`,
    venueShort:
      (d.venue || "").replace(/그랜드볼룸|볼룸|홀.*$/, "").trim().toUpperCase() ||
      "VENUE",
    dateLong: buildDateLong(d.dateInput, d.timeInput),
    dateBig: buildDateBig(d.dateInput),
    timeBig: buildTimeBig(d.dateInput, d.timeInput),
    groomParents: `${d.groomFather} · ${d.groomMother}`,
    brideParents: `${d.brideFather} · ${d.brideMother}`,
    greeting: buildGreeting(tone),
    signature: `${d.groom} · ${d.bride} 드림`,
    slug,
  };
}
