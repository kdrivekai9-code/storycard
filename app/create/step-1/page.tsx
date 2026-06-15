"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useInvitationStore } from "@/store/invitationStore";

const schema = z.object({
  groom: z.string().min(1, "신랑의 이름을 입력해주세요."),
  bride: z.string().min(1, "신부의 이름을 입력해주세요."),
  dateInput: z.string().min(1, "예식 날짜를 입력해주세요."),
  timeInput: z.string().min(1, "예식 시각을 입력해주세요."),
  venue: z.string().min(1, "예식장 이름을 입력해주세요."),
  address: z.string().min(1, "주소를 입력해주세요."),
  groomFather: z.string().min(1, "신랑 부 이름을 입력해주세요."),
  groomMother: z.string().min(1, "신랑 모 이름을 입력해주세요."),
  brideFather: z.string().min(1, "신부 부 이름을 입력해주세요."),
  brideMother: z.string().min(1, "신부 모 이름을 입력해주세요."),
});

type FormValues = z.infer<typeof schema>;

export default function Step1Page() {
  const router = useRouter();
  const userData = useInvitationStore((s) => s.userData);
  const setUserData = useInvitationStore((s) => s.setUserData);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: userData,
  });

  const onSubmit = (data: FormValues) => {
    setUserData(data);
    router.push("/create/step-2");
  };

  return (
    <main className="min-h-screen bg-[var(--bg-stage)] flex justify-center">
      <div className="w-full max-w-md min-h-screen bg-white flex flex-col">
        <header className="flex items-center gap-3 px-6 py-5">
          <Link href="/" className="text-xl text-[var(--ink-soft)]">
            ‹
          </Link>
          <div className="flex-1 h-1 rounded-full bg-[var(--line)] overflow-hidden">
            <div className="h-full bg-[var(--ink)]" style={{ width: "33%" }} />
          </div>
          <div className="text-xs text-[var(--ink-soft)] tracking-[0.1em]">01 / 03</div>
        </header>

        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 flex flex-col px-6 pb-28">
          <h2 className="font-serif text-2xl leading-snug mt-2">
            두 분의 이야기를
            <br />
            들려주세요.
          </h2>
          <p className="text-sm text-[var(--ink-soft)] mt-2">
            사실 정보만 받습니다. 디자인 결정은 잠시 후 함께 합니다.
          </p>

          <SectionTitle>신랑 · 신부</SectionTitle>
          <FieldRow>
            <Field label="신랑" error={errors.groom?.message}>
              <input {...register("groom")} type="text" className={inputClass} />
            </Field>
            <Field label="신부" error={errors.bride?.message}>
              <input {...register("bride")} type="text" className={inputClass} />
            </Field>
          </FieldRow>

          <SectionTitle>예식 일시</SectionTitle>
          <FieldRow>
            <Field label="날짜" error={errors.dateInput?.message}>
              <input {...register("dateInput")} type="text" className={inputClass} />
            </Field>
            <Field label="시각" error={errors.timeInput?.message}>
              <input {...register("timeInput")} type="text" className={inputClass} />
            </Field>
          </FieldRow>

          <SectionTitle>예식장</SectionTitle>
          <Field label="예식장 이름" error={errors.venue?.message}>
            <input {...register("venue")} type="text" className={inputClass} />
          </Field>
          <Field label="주소" error={errors.address?.message}>
            <input {...register("address")} type="text" className={inputClass} />
          </Field>

          <SectionTitle>양가 혼주</SectionTitle>
          <FieldRow>
            <Field label="신랑 부" error={errors.groomFather?.message}>
              <input {...register("groomFather")} type="text" className={inputClass} />
            </Field>
            <Field label="신랑 모" error={errors.groomMother?.message}>
              <input {...register("groomMother")} type="text" className={inputClass} />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="신부 부" error={errors.brideFather?.message}>
              <input {...register("brideFather")} type="text" className={inputClass} />
            </Field>
            <Field label="신부 모" error={errors.brideMother?.message}>
              <input {...register("brideMother")} type="text" className={inputClass} />
            </Field>
          </FieldRow>

          <div className="fixed bottom-0 left-0 right-0 flex justify-center px-6 pb-6 pt-3 bg-gradient-to-t from-white via-white/95 to-transparent">
            <div className="w-full max-w-md">
              <button
                type="submit"
                className="w-full h-12 rounded-full bg-[var(--ink)] text-white text-sm tracking-[0.15em]"
              >
                스타일 질문 시작 →
              </button>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}

const inputClass =
  "w-full h-12 rounded-xl border border-[var(--line)] px-4 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--ink)]";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-7 mb-3 text-sm font-medium tracking-[0.2em] text-[var(--ink-soft)] uppercase">
      {children}
    </div>
  );
}

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block mb-3">
      <span className="block text-xs text-[var(--ink-soft)] mb-1.5">{label}</span>
      {children}
      {error && <span className="block text-xs text-[var(--danger)] mt-1">{error}</span>}
    </label>
  );
}
