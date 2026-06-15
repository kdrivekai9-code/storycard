import type { StyleAnswers } from "./types";

export interface QuestionOption {
  id: string;
  name: string;
  desc: string;
  letters: string;
}

export interface Question {
  key: keyof StyleAnswers;
  meta: string;
  text: string;
  hint: string;
  multi: boolean;
  options: QuestionOption[];
}

/**
 * Q1~Q7 — ported from `QUESTIONS` in bloomcard_prototype.html (line ~4966).
 * Q1 adds a 6th option (`korean`) so all moods defined in `themes.ts` are
 * reachable from the wizard. Q5's "방명록" option uses `guestbook` (matching
 * the invitation section's `data-section`, rather than the prototype's
 * inconsistent `book` id).
 */
export const QUESTIONS: Question[] = [
  {
    key: "mood",
    meta: "Q1 · 분위기",
    text: "어떤 분위기의 청첩장을 원하세요?",
    hint: "답변 하나로 템플릿·폰트·색감이 함께 정해집니다.",
    multi: false,
    options: [
      { id: "romantic", name: "로맨틱", desc: "플로럴 일러스트와 따뜻한 색감", letters: "A" },
      { id: "modern", name: "모던 미니멀", desc: "화이트 · 세리프 · 충분한 여백", letters: "B" },
      { id: "classic", name: "클래식 우아", desc: "골드 프레임 · 격식 있는 호텔 톤", letters: "C" },
      { id: "vintage", name: "감성 빈티지", desc: "세피아 · 일러스트 · 잔잔한 무드", letters: "D" },
      { id: "vivid", name: "발랄 컬러풀", desc: "생기 있는 컬러 · 활기찬 분위기", letters: "E" },
      { id: "korean", name: "한국적", desc: "단청 문양 · 자연스러운 색감", letters: "F" },
    ],
  },
  {
    key: "photoDensity",
    meta: "Q2 · 사진 비중",
    text: "사진을 얼마나 보여주고 싶으세요?",
    hint: "답변에 따라 갤러리 섹션과 입력칸이 자동으로 조절됩니다.",
    multi: false,
    options: [
      { id: "many", name: "많이 (갤러리 중심)", desc: "커플 갤러리 섹션이 메인", letters: "多" },
      { id: "some", name: "적당히 (대표 1~2장)", desc: "대표 사진과 본문 균형", letters: "適" },
      { id: "none", name: "사진 없이 (글·일러스트)", desc: "타이포그래피와 일러스트 중심", letters: "無" },
    ],
  },
  {
    key: "cover",
    meta: "Q3 · 표지",
    text: "메인(표지)은 어떤 인상이면 좋겠어요?",
    hint: "청첩장을 열었을 때 가장 먼저 보이는 화면입니다.",
    multi: false,
    options: [
      { id: "full", name: "큰 사진 풀페이지", desc: "대표 사진이 화면 전체", letters: "IMG" },
      { id: "frame", name: "액자형", desc: "사진을 감싸는 우아한 프레임", letters: "❀" },
      { id: "split", name: "상하분할", desc: "사진과 텍스트 영역을 분리", letters: "⬓" },
      { id: "mosaic", name: "모자이크", desc: "여러 장의 사진을 조합", letters: "▦" },
      { id: "overlay", name: "중앙텍스트", desc: "사진 위에 이름을 크게 배치", letters: "A&B" },
    ],
  },
  {
    key: "palette",
    meta: "Q4 · 색감",
    text: "색감은 어떤 톤이 좋으세요?",
    hint: "Q1의 기본 팔레트를 덮어쓰는 미세 조정 단계입니다.",
    multi: false,
    options: [
      { id: "warm", name: "따뜻한 톤", desc: "베이지 · 살구 · 부드러운 빛", letters: "W" },
      { id: "neutral", name: "차분한 뉴트럴", desc: "그레이 · 베이지 · 화이트", letters: "N" },
      { id: "gold", name: "화이트 & 골드", desc: "순수한 화이트에 골드 액센트", letters: "G" },
      { id: "deep", name: "딥 & 무드", desc: "네이비·딥그린에 골드 자수", letters: "D" },
    ],
  },
  {
    key: "sections",
    meta: "Q5 · 담을 내용 (복수 선택)",
    text: "청첩장에 담고 싶은 내용은?",
    hint: "선택한 섹션의 입력칸만 다음 단계에서 보입니다.",
    multi: true,
    options: [
      { id: "greeting", name: "인사말", desc: "두 사람의 메시지", letters: "EN" },
      { id: "timeline", name: "러브스토리", desc: "타임라인으로 함께한 시간", letters: "YR" },
      { id: "gallery", name: "갤러리", desc: "스튜디오 사진", letters: "IMG" },
      { id: "video", name: "영상", desc: "YouTube 청첩 영상", letters: "▶" },
      { id: "map", name: "오시는 길", desc: "지도와 길찾기", letters: "MAP" },
      { id: "rsvp", name: "참석여부 (RSVP)", desc: "식사 준비용 응답", letters: "R" },
      { id: "account", name: "마음 전하실 곳", desc: "계좌번호 안내", letters: "₩" },
      { id: "guestbook", name: "방명록", desc: "하객 축하 메시지", letters: "✎" },
    ],
  },
  {
    key: "motion",
    meta: "Q6 · 움직임",
    text: "움직임(연출)은 어느 정도가 좋으세요?",
    hint: "파티클, 등장 효과, 전환 강도가 함께 결정됩니다.",
    multi: false,
    options: [
      { id: "vivid", name: "화려하게", desc: "꽃잎 · 파티클 · 등장 애니메이션", letters: "∿" },
      { id: "soft", name: "잔잔하게", desc: "부드러운 페이드 인 정도만", letters: "⁓" },
      { id: "still", name: "정적으로", desc: "움직임 없이 활자만으로", letters: "—" },
    ],
  },
  {
    key: "tone",
    meta: "Q7 · 말투",
    text: "인사말 말투는 어떤 느낌이 좋으세요?",
    hint: "추천 문구의 톤이 정해집니다. 그대로 쓰거나 수정할 수 있어요.",
    multi: false,
    options: [
      { id: "formal", name: "정중하게", desc: "바쁘신 가운데 귀한 걸음 하시어…", letters: "敬" },
      { id: "warm", name: "다정하게", desc: "서로 다른 길을 걷던 두 사람이…", letters: "♡" },
      { id: "witty", name: "위트 있게", desc: "드디어 결혼합니다. 같이 와주세요!", letters: "✺" },
    ],
  },
];
