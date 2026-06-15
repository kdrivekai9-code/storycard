"use client";

import { useMemo } from "react";
import Link from "next/link";
import { InvitationRenderer } from "@/components/invitation/InvitationRenderer";
import { useInvitationStore } from "@/store/invitationStore";
import { deriveInvitationData } from "@/lib/invitation/derive";
import { mergeConfig } from "@/lib/invitation/mergeConfig";

const EDIT_CHIPS = [
  { label: "분위기 바꾸기", q: 0 },
  { label: "표지 바꾸기", q: 2 },
  { label: "색감 바꾸기", q: 3 },
  { label: "담은 내용", q: 4 },
  { label: "움직임", q: 5 },
];

export default function PreviewPage() {
  const userData = useInvitationStore((s) => s.userData);
  const answers = useInvitationStore((s) => s.answers);
  const config = useMemo(() => mergeConfig(answers), [answers]);
  const bound = useMemo(() => deriveInvitationData(userData, answers.tone), [userData, answers.tone]);

  return (
    <main className="min-h-screen bg-[var(--bg-stage)] flex justify-center">
      <div className="w-full max-w-md min-h-screen bg-white flex flex-col">
        <header className="flex items-center justify-between px-6 py-5">
          <span className="text-xs tracking-[0.2em] text-[var(--ink-soft)]">PREVIEW</span>
          <Link href="/create/step-2" className="text-sm text-[var(--ink-soft)]">
            수정
          </Link>
        </header>

        <InvitationRenderer config={config} userData={userData} bound={bound} />

        <div className="px-6 py-6 border-t border-[var(--line)]">
          <div className="text-xs tracking-[0.2em] text-[var(--ink-faint)] uppercase mb-3">
            질문 단위 재수정
          </div>
          <div className="flex flex-wrap gap-2">
            {EDIT_CHIPS.map((chip) => (
              <Link
                key={chip.q}
                href={`/create/step-2?q=${chip.q}`}
                className="text-xs px-3 py-2 rounded-full border border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--ink)] hover:text-[var(--ink)] transition-colors"
              >
                {chip.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="px-6 pb-8 flex gap-3">
          <Link
            href="/create/step-2"
            className="h-12 px-6 rounded-full border border-[var(--line)] flex items-center justify-center text-sm tracking-[0.15em] text-[var(--ink-soft)]"
          >
            수정
          </Link>
          <div className="flex-1 h-12 rounded-full bg-[var(--ink)] text-white flex items-center justify-center text-sm tracking-[0.15em] opacity-50">
            발급 · 공유 →
          </div>
        </div>
      </div>
    </main>
  );
}
