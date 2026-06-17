import Link from "next/link";
import { PcMaster } from "@/components/pc/PcMaster";
import { createClient } from "@/lib/supabase/server";

export default async function LandingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <>
    <div className="pc-master">
      <PcMaster />
    </div>
    <main className="mobile-master min-h-screen bg-[var(--bg-stage)] flex justify-center">
      <div className="w-full max-w-md min-h-screen bg-white flex flex-col">
        <header className="flex items-center justify-between px-6 py-5">
          <span className="font-serif text-lg tracking-[0.3em]">
            BLOOM<em className="not-italic text-[var(--accent-deep)]">CARD</em>
          </span>
          {user ? (
            <Link href="/my" className="text-xs text-[var(--ink-soft)]">
              마이페이지
            </Link>
          ) : (
            <Link href="/login" className="text-xs text-[var(--ink-soft)]">
              로그인
            </Link>
          )}
        </header>

        <section className="px-6 pt-6 pb-8 text-center">
          <p className="text-xs tracking-[0.3em] text-[var(--accent-deep)]">FOR YOUR SPECIAL DAY</p>
          <h1 className="font-serif text-3xl font-light mt-4 leading-snug">
            가장 닮은
            <br />
            <em className="italic">청첩장을 짓다.</em>
          </h1>
          <p className="text-sm text-[var(--ink-soft)] mt-4 leading-relaxed">
            30가지 옵션을 고르지 마세요.
            <br />
            7개의 질문에 답하면 끝납니다.
          </p>
        </section>

        <section className="px-6 flex flex-col gap-4">
          <Link
            href="/create/step-1"
            className="block rounded-2xl border border-[var(--line)] p-6 hover:border-[var(--ink)] transition-colors"
          >
            <span className="inline-block text-[10px] tracking-[0.3em] px-2 py-1 rounded-full bg-[var(--bg-soft)] text-[var(--ink-soft)]">
              FREE
            </span>
            <div className="mt-3 text-lg font-medium">무료 청첩장</div>
            <p className="text-sm text-[var(--ink-soft)] mt-1">7개 질문 · 15분이면 완성</p>
            <div className="mt-4 font-serif text-2xl">
              ₩0<span className="text-xs ml-2 tracking-[0.2em] text-[var(--ink-faint)]">FOREVER</span>
            </div>
            <ul className="mt-4 space-y-1.5 text-sm text-[var(--ink-soft)]">
              <li>기본 템플릿 12종 · 무제한 수정</li>
              <li>스타일 질문 Q1~Q7 자동 조립</li>
              <li>카카오톡 공유 · QR · 짧은 URL</li>
              <li>RSVP · 방명록 · 계좌번호</li>
            </ul>
            <div className="mt-5 h-12 rounded-full bg-[var(--ink)] text-white flex items-center justify-center text-sm tracking-[0.15em]">
              무료로 시작 →
            </div>
          </Link>

          <div className="rounded-2xl border border-[var(--line)] p-6 opacity-60">
            <span className="inline-block text-[10px] tracking-[0.3em] px-2 py-1 rounded-full bg-[var(--bg-soft)] text-[var(--ink-soft)]">
              PREMIUM
            </span>
            <div className="mt-3 text-lg font-medium">
              <em className="italic">Bloom</em> Premium
            </div>
            <p className="text-sm text-[var(--ink-soft)] mt-1">단 하루를 위한 한정 청첩장</p>
            <div className="mt-4 font-serif text-2xl">
              FROM ₩59,000<span className="text-xs ml-2 tracking-[0.2em] text-[var(--ink-faint)]">SINGLE USE</span>
            </div>
            <ul className="mt-4 space-y-1.5 text-sm text-[var(--ink-soft)]">
              <li>AI 영상 청첩장 (사진 → 1분 무비)</li>
              <li>디자이너 1:1 컨설팅 · 시안 3안 제안</li>
              <li>프리미엄 템플릿 · 한정 폰트 라이선스</li>
              <li>화환 · 답례품 마켓 연동 (수익 5%)</li>
            </ul>
            <div className="mt-5 h-12 rounded-full border border-[var(--line)] flex items-center justify-center text-sm tracking-[0.15em] text-[var(--ink-soft)]">
              준비 중입니다
            </div>
          </div>
        </section>

        <section className="grid grid-cols-3 text-center mt-10 px-6">
          <div>
            <div className="font-serif text-2xl">7</div>
            <div className="text-xs text-[var(--ink-soft)] mt-1">질문</div>
          </div>
          <div>
            <div className="font-serif text-2xl">
              15<span className="text-sm">분</span>
            </div>
            <div className="text-xs text-[var(--ink-soft)] mt-1">소요</div>
          </div>
          <div>
            <div className="font-serif text-2xl">∞</div>
            <div className="text-xs text-[var(--ink-soft)] mt-1">수정</div>
          </div>
        </section>

        <div className="px-6 mt-8 mb-12">
          <Link
            href="/create/preview"
            className="block h-12 rounded-full border border-[var(--line)] flex items-center justify-center text-sm tracking-[0.15em] text-[var(--ink-soft)] hover:border-[var(--ink)] hover:text-[var(--ink)] transition-colors"
          >
            샘플 청첩장 둘러보기
          </Link>
        </div>
      </div>
    </main>
    </>
  );
}
