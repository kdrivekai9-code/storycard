import { buildGreeting } from "./greetings";
import { computeTheme } from "./themes";
import type { InvitationConfig, SectionId, StyleAnswers } from "./types";

/** Q5 기본 선택 섹션 — 프로토타입 STEP2 기본 chip-btn.active (line ~2846) */
export const DEFAULT_SECTIONS: SectionId[] = [
  "greeting",
  "gallery",
  "map",
  "rsvp",
  "account",
  "guestbook",
];

/**
 * Q1~Q7 답변을 렌더링용 설정으로 합성.
 * Ported from `computeTheme`/`buildGreeting` + the various
 * `state.answers[n] || <default>` fallbacks (line ~5265, 5408, 5469, 5893, 5905).
 */
export function mergeConfig(answers: StyleAnswers): InvitationConfig {
  const mood = answers.mood ?? "modern";
  const cover = answers.cover ?? "full";
  const photoDensity = answers.photoDensity ?? "some";
  const motion = answers.motion ?? "soft";
  const tone = answers.tone ?? "warm";
  const sections = answers.sections ?? DEFAULT_SECTIONS;

  return {
    mood,
    cover,
    photoDensity,
    palette: answers.palette,
    sections,
    motion,
    tone,
    coverTextColor: answers.coverTextColor,
    theme: computeTheme(mood, answers.palette),
    greeting: buildGreeting(tone),
  };
}
