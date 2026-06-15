"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { QUESTIONS } from "@/lib/invitation/questions";
import { useInvitationStore } from "@/store/invitationStore";

export default function Step2Page() {
  return (
    <Suspense>
      <Step2Wizard />
    </Suspense>
  );
}

function Step2Wizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = Number(searchParams.get("q"));
  const [qIndex, setQIndex] = useState(
    Number.isInteger(initialQ) && initialQ >= 0 && initialQ < QUESTIONS.length ? initialQ : 0,
  );
  const answers = useInvitationStore((s) => s.answers);
  const setAnswer = useInvitationStore((s) => s.setAnswer);

  const question = QUESTIONS[qIndex];
  const progress = ((qIndex + 1) / QUESTIONS.length) * 100;
  const currentValue = answers[question.key];
  const selectedIds: string[] = question.multi
    ? ((currentValue as string[] | undefined) ?? [])
    : currentValue
      ? [currentValue as string]
      : [];

  const isAnswered = question.multi ? selectedIds.length > 0 : selectedIds.length === 1;

  function selectOption(optionId: string) {
    if (question.multi) {
      const next = selectedIds.includes(optionId)
        ? selectedIds.filter((id) => id !== optionId)
        : [...selectedIds, optionId];
      setAnswer(question.key, next as never);
    } else {
      setAnswer(question.key, optionId as never);
    }
  }

  function handlePrev() {
    if (qIndex === 0) {
      router.push("/create/step-1");
    } else {
      setQIndex((i) => i - 1);
    }
  }

  function handleNext() {
    if (qIndex === QUESTIONS.length - 1) {
      router.push("/create/preview");
    } else {
      setQIndex((i) => i + 1);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--bg-stage)] flex justify-center">
      <div className="w-full max-w-md min-h-screen bg-white flex flex-col">
        <header className="flex items-center gap-3 px-6 py-5">
          <button onClick={handlePrev} className="text-xl text-[var(--ink-soft)]">
            ‹
          </button>
          <div className="flex-1 h-1 rounded-full bg-[var(--line)] overflow-hidden">
            <div
              className="h-full bg-[var(--ink)] transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-xs text-[var(--ink-soft)] tracking-[0.1em]">
            {String(qIndex + 1).padStart(2, "0")} / {String(QUESTIONS.length).padStart(2, "0")}
          </div>
        </header>

        <div className="flex-1 px-6 pb-28">
          <div className="text-xs tracking-[0.2em] text-[var(--accent-deep)] uppercase">{question.meta}</div>
          <h2 className="font-serif text-2xl leading-snug mt-3">{question.text}</h2>
          <p className="text-sm text-[var(--ink-soft)] mt-2">{question.hint}</p>

          <div className="mt-6 flex flex-col gap-2.5">
            {question.options.map((option) => {
              const active = selectedIds.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => selectOption(option.id)}
                  className={`flex items-center gap-4 text-left rounded-2xl border px-4 py-3.5 transition-colors ${
                    active
                      ? "border-[var(--ink)] bg-[var(--bg-soft)]"
                      : "border-[var(--line)] hover:border-[var(--ink-faint)]"
                  }`}
                >
                  <span
                    className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-xs font-serif ${
                      active ? "bg-[var(--ink)] text-white" : "bg-[var(--bg-soft)] text-[var(--ink-soft)]"
                    }`}
                  >
                    {option.letters}
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-medium text-[var(--ink)]">{option.name}</span>
                    <span className="block text-xs text-[var(--ink-soft)] mt-0.5">{option.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 flex justify-center px-6 pb-6 pt-3 bg-gradient-to-t from-white via-white/95 to-transparent">
          <div className="w-full max-w-md flex gap-3">
            <button
              onClick={handlePrev}
              className="h-12 px-6 rounded-full border border-[var(--line)] text-sm tracking-[0.15em] text-[var(--ink-soft)]"
            >
              이전
            </button>
            <button
              onClick={handleNext}
              disabled={!isAnswered}
              className="flex-1 h-12 rounded-full bg-[var(--ink)] text-white text-sm tracking-[0.15em] disabled:opacity-30"
            >
              다음 →
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
