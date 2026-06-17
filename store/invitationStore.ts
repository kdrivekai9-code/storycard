import { create } from "zustand";
import type { StyleAnswers, UserData } from "@/lib/invitation/types";

/** 기본 사용자 입력 — 프로토타입 `state.userData` (bloomcard_prototype.html line ~4886) */
export const DEFAULT_USER_DATA: UserData = {
  groom: "이준호",
  bride: "김서연",
  dateInput: "2026.10.18 (토)",
  timeInput: "오후 1:30",
  venue: "그랜드하얏트 그랜드볼룸",
  address: "서울 용산구 소월로 322",
  groomFather: "이성훈",
  groomMother: "박혜진",
  brideFather: "김재현",
  brideMother: "정수영",
};

interface InvitationStore {
  userData: UserData;
  answers: StyleAnswers;
  photos: string[];
  setUserData: (patch: Partial<UserData>) => void;
  setAnswer: <K extends keyof StyleAnswers>(key: K, value: StyleAnswers[K]) => void;
  setPhotos: (photos: string[]) => void;
  reset: () => void;
}

export const useInvitationStore = create<InvitationStore>((set) => ({
  userData: { ...DEFAULT_USER_DATA },
  answers: {},
  photos: [],

  setUserData: (patch) =>
    set((state) => ({ userData: { ...state.userData, ...patch } })),

  setAnswer: (key, value) =>
    set((state) => ({ answers: { ...state.answers, [key]: value } })),

  setPhotos: (photos) => set({ photos }),

  reset: () => set({ userData: { ...DEFAULT_USER_DATA }, answers: {}, photos: [] }),
}));
