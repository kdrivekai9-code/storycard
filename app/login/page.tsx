"use client";

import Link from "next/link";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PcHeader } from "@/components/pc/PcHeader";
import { PcFooter } from "@/components/pc/PcFooter";

function BlockedAdminNotice() {
  const sp = useSearchParams();
  if (sp.get("blocked") !== "admin") return null;
  return (
    <p style={{
      color: "var(--danger, #c0392b)",
      fontSize: 13,
      textAlign: "center",
      marginBottom: 12,
      padding: "10px 14px",
      background: "#fef0f0",
      borderRadius: 8,
    }}>
      관리자 계정은 스토리카드 로그인에 사용할 수 없습니다.<br />
      관리자 페이지로 이동해 주세요.
    </p>
  );
}

type Provider = "naver" | "kakao";

function NaverIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M16.3 12.7L7.9 4H4v16h4.7v-8.7L16.1 20H20V4h-3.7v8.7z" fill="#fff" />
    </svg>
  );
}

function KakaoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 4C6.96 4 3 7.18 3 11.1c0 2.52 1.66 4.74 4.16 6.02-.18.66-.66 2.42-.76 2.8-.12.46.17.46.36.33.15-.1 2.36-1.6 3.32-2.24.62.09 1.26.13 1.92.13 5.04 0 9-3.18 9-7.04S17.04 4 12 4z"
        fill="#391B1B"
      />
    </svg>
  );
}

export default function LoginPage() {
  const [provider, setProvider] = useState<Provider>("naver");

  async function handleKakaoLogin() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: "profile_nickname profile_image account_email phone_number name",
      },
    });
  }

  function handleNaverLogin() {
    window.location.href = "/auth/naver";
  }

  return (
    <>
      <PcHeader />
      <main className="login-page">
        <div className="login-card">
          <Link href="/" className="login-logo">
            STORY<em>CARD</em>
          </Link>
          <p className="login-subtitle">간편로그인으로 빠르게 시작하세요</p>
          <Suspense><BlockedAdminNotice /></Suspense>

          <div className="login-tabs">
            <button
              type="button"
              className={`login-tab naver${provider === "naver" ? " active naver" : ""}`}
              onClick={() => {
                setProvider("naver");
                handleNaverLogin();
              }}
            >
              네이버 간편로그인
            </button>
            <button
              type="button"
              className={`login-tab kakao${provider === "kakao" ? " active kakao" : ""}`}
              onClick={() => {
                setProvider("kakao");
                handleKakaoLogin();
              }}
            >
              카카오 간편로그인
            </button>
          </div>

          {provider === "naver" ? (
            <div className="login-panel naver">
              <div className="login-panel-icon naver">
                <NaverIcon />
              </div>
              <p className="login-panel-title">네이버 아이디로 로그인</p>
              <p className="login-panel-desc">
                네이버 계정으로 간편하게 로그인하고
                <br />
                STORYCARD를 이용해보세요.
              </p>
              <button type="button" className="login-action-btn naver" onClick={handleNaverLogin}>
                <span style={{ width: 18, height: 18, flexShrink: 0, display: "inline-flex" }}>
                  <NaverIcon />
                </span>
                네이버로 로그인
              </button>
            </div>
          ) : (
            <div className="login-panel kakao">
              <div className="login-panel-icon kakao">
                <KakaoIcon />
              </div>
              <p className="login-panel-title">카카오 계정으로 로그인</p>
              <p className="login-panel-desc">
                카카오 계정으로 간편하게 로그인하고
                <br />
                STORYCARD를 이용해보세요.
              </p>
              <button type="button" className="login-action-btn kakao" onClick={handleKakaoLogin}>
                <span style={{ width: 18, height: 18, flexShrink: 0, display: "inline-flex" }}>
                  <KakaoIcon />
                </span>
                카카오로 로그인
              </button>
            </div>
          )}

          <Link href="/" className="login-back">
            ← 홈으로 돌아가기
          </Link>
        </div>
      </main>
      <div className="pc-main" style={{ paddingTop: 0 }}>
        <PcFooter />
      </div>
    </>
  );
}
