import type { ToneId } from "./types";

/**
 * Q7 말투 → 인사말 본문. Ported from `GREETING_TONE`
 * (bloomcard_prototype.html line ~5057).
 */
export const GREETING_TONE: Record<ToneId, string> = {
  formal:
    "바쁘신 가운데 귀한 걸음 하시어,\n저희 두 사람이 시작하는 자리에\n축복으로 함께해 주시면 감사하겠습니다.",
  warm: "서로 다른 길을 걷던 두 사람이\n이제 같은 곳을 바라보려 합니다.\n저희의 시작에 함께해 주세요.",
  witty: "드디어 결혼합니다.\n오랫동안 미뤄둔 이 자리에,\n꼭 같이 와 주세요 :)",
};

export function buildGreeting(tone?: ToneId): string {
  return GREETING_TONE[tone ?? "warm"];
}
