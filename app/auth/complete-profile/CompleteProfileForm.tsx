"use client";

import { useActionState } from "react";
import { completeProfile } from "@/lib/supabase/profile-actions";
import type { CompleteProfileResult } from "@/lib/supabase/profile-actions";

const INITIAL: CompleteProfileResult = { ok: true };

export function CompleteProfileForm({
  nextPath,
  defaultName,
  defaultEmail,
  defaultPhone,
  provider,
}: {
  nextPath: string;
  defaultName: string;
  defaultEmail: string;
  defaultPhone: string;
  provider: string;
}) {
  const [state, formAction, pending] = useActionState(completeProfile, INITIAL);

  const providerLabel =
    provider === "kakao" ? "카카오" : provider === "naver" ? "네이버" : "";

  return (
    <form action={formAction} className="admin-login-form" style={{ gap: 14 }}>
      <input type="hidden" name="next" value={nextPath} />

      {/* ── 이름 (필수) ── */}
      <div>
        <label htmlFor="cp-name">
          이름 <span style={{ color: "var(--danger)" }}>*</span>
        </label>
        <input
          id="cp-name"
          name="name"
          type="text"
          placeholder="홍길동"
          defaultValue={defaultName}
          autoComplete="name"
          required
          style={{ marginTop: 6 }}
        />
      </div>

      {/* ── 휴대전화 (필수) ── */}
      <div>
        <label htmlFor="cp-phone">
          휴대전화 <span style={{ color: "var(--danger)" }}>*</span>
        </label>
        <input
          id="cp-phone"
          name="phone"
          type="tel"
          placeholder="010-0000-0000"
          defaultValue={defaultPhone}
          autoComplete="tel"
          required
          style={{ marginTop: 6 }}
        />
      </div>

      {/* ── 이메일 (필수) ── */}
      <div>
        <label htmlFor="cp-email">
          이메일 <span style={{ color: "var(--danger)" }}>*</span>
        </label>
        <input
          id="cp-email"
          name="email"
          type="email"
          placeholder="example@email.com"
          defaultValue={defaultEmail}
          autoComplete="email"
          required
          style={{ marginTop: 6 }}
        />
        {providerLabel && !defaultEmail && (
          <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>
            {providerLabel} 계정에 이메일 정보가 없어 직접 입력이 필요합니다.
          </p>
        )}
      </div>

      {/* ── 구분선 ── */}
      <div style={{ borderTop: "1px solid var(--line-soft)", margin: "4px 0" }} />
      <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "-6px 0 2px" }}>
        선택 정보
      </p>

      {/* ── 배송지 (선택) ── */}
      <div>
        <label htmlFor="cp-address">배송지</label>
        <input
          id="cp-address"
          name="shipping_address"
          type="text"
          placeholder="서울시 강남구 테헤란로 123, 101동 101호"
          autoComplete="street-address"
          style={{ marginTop: 6 }}
        />
      </div>

      {/* ── CI (선택) ── */}
      <div>
        <label htmlFor="cp-ci">CI (본인인증 연계정보)</label>
        <input
          id="cp-ci"
          name="ci"
          type="text"
          placeholder="본인인증 후 자동 입력됩니다"
          style={{ marginTop: 6 }}
        />
        <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>
          본인인증 서비스 연동 시 자동으로 저장됩니다.
        </p>
      </div>

      {state && !state.ok && (
        <p className="admin-login-error">{state.message}</p>
      )}

      <button
        type="submit"
        className="admin-btn"
        disabled={pending}
        style={{ marginTop: 4 }}
      >
        {pending ? "저장 중..." : "가입 완료"}
      </button>
    </form>
  );
}
