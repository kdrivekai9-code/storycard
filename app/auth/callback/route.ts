import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { isPlaceholderEmail } from "@/lib/supabase/profile-utils";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_done, role")
        .eq("id", user?.id ?? "")
        .single();

      // 관리자 계정은 스토리카드 메인 로그인 불가 — 세션 해제 후 차단 안내
      if (profile?.role === "admin") {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?blocked=admin`);
      }

      // 온보딩 미완 또는 이메일 placeholder → 프로필 완성 페이지로
      const needsOnboarding = !profile?.onboarding_done || isPlaceholderEmail(user?.email);

      return NextResponse.redirect(
        needsOnboarding
          ? `${origin}/auth/complete-profile?next=${encodeURIComponent(next)}`
          : `${origin}${next}`,
      );
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`);
}
