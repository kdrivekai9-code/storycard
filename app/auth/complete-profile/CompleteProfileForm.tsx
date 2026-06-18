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
  defaultAddress,
  defaultAddressDetail,
  defaultReceiverName,
  provider,
}: {
  nextPath: string;
  defaultName: string;
  defaultEmail: string;
  defaultPhone: string;
  defaultAddress: string;
  defaultAddressDetail: string;
  defaultReceiverName: string;
  provider: string;
}) {
  const [state, formAction, pending] = useActionState(completeProfile, INITIAL);

  const providerLabel =
    provider === "kakao" ? "카카오" : provider === "naver" ? "네이버" : "";

  return (
    <form action={formAction} className="admin-login-form cp-form">
      <input type="hidden" name="next" value={nextPath} />

      {/* ── 필수 정보 섹션 ── */}
      <div className="cp-section cp-section--required">
        <div className="cp-section-header">
          <span className="cp-section-label">필수 정보</span>
          <span className="cp-section-required-mark">* 필수 입력</span>
        </div>

        <div className="cp-field">
          <label htmlFor="cp-name">
            이름 <span className="cp-required">*</span>
          </label>
          <input
            id="cp-name"
            name="name"
            type="text"
            placeholder="홍길동"
            defaultValue={defaultName}
            autoComplete="name"
            required
          />
        </div>

        <div className="cp-field">
          <label htmlFor="cp-phone">
            휴대전화 <span className="cp-required">*</span>
          </label>
          <input
            id="cp-phone"
            name="phone"
            type="tel"
            placeholder="010-0000-0000"
            defaultValue={defaultPhone}
            autoComplete="tel"
            required
          />
        </div>

        <div className="cp-field">
          <label htmlFor="cp-email">
            이메일 <span className="cp-required">*</span>
          </label>
          <input
            id="cp-email"
            name="email"
            type="email"
            placeholder="example@email.com"
            defaultValue={defaultEmail}
            autoComplete="email"
            required
          />
          {providerLabel && !defaultEmail && (
            <p className="cp-field-hint">
              {providerLabel} 계정에 이메일 정보가 없어 직접 입력이 필요합니다.
            </p>
          )}
        </div>
      </div>

      {/* ── 선택 정보 섹션 ── */}
      <div className="cp-section cp-section--optional">
        <div className="cp-section-header">
          <span className="cp-section-label">배송지 정보</span>
          <span className="cp-section-optional-mark">입력하지 않아도 됩니다</span>
        </div>

        <div className="cp-field">
          <label htmlFor="cp-receiver">받는 분 이름</label>
          <input
            id="cp-receiver"
            name="receiver_name"
            type="text"
            placeholder="홍길동"
            defaultValue={defaultReceiverName}
            autoComplete="name"
          />
        </div>

        <div className="cp-field">
          <label htmlFor="cp-address">주소</label>
          <input
            id="cp-address"
            name="shipping_address"
            type="text"
            placeholder="(우편번호) 기본주소"
            defaultValue={defaultAddress}
            autoComplete="address-line1"
          />
        </div>

        <div className="cp-field">
          <label htmlFor="cp-address-detail">상세주소</label>
          <input
            id="cp-address-detail"
            name="shipping_detail"
            type="text"
            placeholder="동·호수, 층 등"
            defaultValue={defaultAddressDetail}
            autoComplete="address-line2"
          />
        </div>
      </div>

      {state && !state.ok && (
        <p className="admin-login-error">{state.message}</p>
      )}

      <button type="submit" className="admin-btn" disabled={pending}>
        {pending ? "저장 중..." : "가입 완료"}
      </button>
    </form>
  );
}
