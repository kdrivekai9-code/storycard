import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface NaverTokenResponse {
  access_token?: string;
  error?: string;
}

interface NaverProfileResponse {
  resultcode: string;
  response?: {
    id: string;
    email?: string;
    name?: string;
    mobile?: string;
  };
}

/** 네이버 OAuth 콜백 — 토큰 교환 후 프로필을 조회하고 Supabase 세션을 발급합니다. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const next = searchParams.get("next") ?? "/";

  const cookieStore = await cookies();
  const savedState = cookieStore.get("naver_oauth_state")?.value;

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(`${origin}/auth/error`);
  }

  try {
    const tokenParams = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.NEXT_PUBLIC_NAVER_CLIENT_ID ?? "",
      client_secret: process.env.NAVER_CLIENT_SECRET ?? "",
      code,
      state,
    });
    const tokenRes = await fetch(`https://nid.naver.com/oauth2.0/token?${tokenParams.toString()}`);
    const tokenData: NaverTokenResponse = await tokenRes.json();
    if (!tokenData.access_token) throw new Error("네이버 토큰 발급에 실패했습니다.");

    const profileRes = await fetch("https://openapi.naver.com/v1/nid/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profileData: NaverProfileResponse = await profileRes.json();
    const naverUser = profileData.response;
    if (!naverUser?.id) throw new Error("네이버 프로필 조회에 실패했습니다.");

    // 이메일이 없으면 placeholder로 대체 (complete-profile 페이지에서 수집)
    const hasRealEmail = !!naverUser.email;
    const email = naverUser.email || `naver_${naverUser.id}@storycard.placeholder`;

    const admin = createAdminClient();
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        data: {
          provider: "naver",
          naver_id: naverUser.id,
          full_name: naverUser.name,
          phone: naverUser.mobile ?? null,
        },
      },
    });
    if (linkError || !linkData) throw linkError ?? new Error("로그인 토큰 생성에 실패했습니다.");

    const supabase = await createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    });
    if (verifyError) throw verifyError;

    // 온보딩 완료 여부 확인
    const { data: { user: sessionUser } } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_done, role, phone")
      .eq("id", sessionUser?.id ?? "")
      .single();

    // 네이버에서 받은 전화번호를 프로필에 저장 (아직 없는 경우)
    if (sessionUser && naverUser.mobile && !profile?.phone) {
      await supabase
        .from("profiles")
        .update({ phone: naverUser.mobile })
        .eq("id", sessionUser.id);
    }

    // 관리자 계정은 스토리카드 메인 로그인 불가 — 세션 해제 후 차단 안내
    if (profile?.role === "admin") {
      await supabase.auth.signOut();
      const res = NextResponse.redirect(`${origin}/login?blocked=admin`);
      res.cookies.delete("naver_oauth_state");
      return res;
    }

    const needsOnboarding = !profile?.onboarding_done || !hasRealEmail;

    const response = NextResponse.redirect(
      needsOnboarding
        ? `${origin}/auth/complete-profile?next=${encodeURIComponent(next)}`
        : `${origin}${next}`,
    );
    response.cookies.delete("naver_oauth_state");
    return response;
  } catch (err) {
    console.error("Naver login error:", err);
    return NextResponse.redirect(`${origin}/auth/error`);
  }
}
