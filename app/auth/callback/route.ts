import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { isPlaceholderEmail } from "@/lib/supabase/profile-utils";

interface KakaoAccount {
  phone_number?: string;
  phone_number_needs_agreement?: boolean;
  email?: string;
  name?: string;
  name_needs_agreement?: boolean;
}

interface KakaoMeResponse {
  id?: number;
  kakao_account?: KakaoAccount;
}

interface KakaoShippingAddress {
  is_default: boolean;
  base_address?: string;
  detail_address?: string;
  receiver_name?: string;
  zone_code?: string;
}

interface KakaoShippingResponse {
  shipping_addresses_needs_agreement?: boolean;
  shipping_addresses?: KakaoShippingAddress[];
}

interface KakaoShippingResult {
  shipping_address: string | null;
  shipping_detail: string | null;
  receiver_name: string | null;
}

async function fetchKakaoProfile(providerToken: string): Promise<{ phone: string | null; name: string | null }> {
  try {
    const res = await fetch("https://kapi.kakao.com/v2/user/me", {
      headers: { Authorization: `Bearer ${providerToken}` },
    });
    if (!res.ok) return { phone: null, name: null };
    const data: KakaoMeResponse = await res.json();
    const account = data.kakao_account;
    return {
      phone: (!account?.phone_number_needs_agreement && account?.phone_number) ? account.phone_number : null,
      name:  (!account?.name_needs_agreement && account?.name) ? account.name : null,
    };
  } catch {
    return { phone: null, name: null };
  }
}

async function fetchKakaoShippingAddress(providerToken: string): Promise<KakaoShippingResult> {
  const empty: KakaoShippingResult = { shipping_address: null, shipping_detail: null, receiver_name: null };
  try {
    const res = await fetch("https://kapi.kakao.com/v1/user/shipping_address", {
      headers: { Authorization: `Bearer ${providerToken}` },
    });
    if (!res.ok) return empty;
    const data: KakaoShippingResponse = await res.json();
    if (data.shipping_addresses_needs_agreement || !data.shipping_addresses?.length) return empty;

    const addr = data.shipping_addresses.find((a) => a.is_default) ?? data.shipping_addresses[0];
    const baseParts = [addr.zone_code ? `(${addr.zone_code})` : null, addr.base_address].filter(Boolean);

    return {
      shipping_address: baseParts.join(" ") || null,
      shipping_detail: addr.detail_address ?? null,
      receiver_name: addr.receiver_name ?? null,
    };
  } catch {
    return empty;
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();

    // exchangeCodeForSession 반환값에서 바로 provider_token 추출
    const { data: exchangeData, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const providerToken = exchangeData.session?.provider_token ?? null;
      const user = exchangeData.user;

      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_done, role, phone, nickname, shipping_address, receiver_name")
        .eq("id", user?.id ?? "")
        .single();

      if (profile?.role === "admin") {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?blocked=admin`);
      }

      const profileUpdates: Record<string, string | boolean> = {};

      if (providerToken) {
        // 카카오 프로필 API로 전화번호·이름 수집
        const kakaoProfile = await fetchKakaoProfile(providerToken);
        if (kakaoProfile.phone && !profile?.phone) profileUpdates.phone = kakaoProfile.phone;
        if (kakaoProfile.name && !profile?.nickname) profileUpdates.nickname = kakaoProfile.name;

        // 배송지 API로 주소 수집
        if (!profile?.shipping_address) {
          const shipping = await fetchKakaoShippingAddress(providerToken);
          if (shipping.shipping_address) profileUpdates.shipping_address = shipping.shipping_address;
          if (shipping.shipping_detail) profileUpdates.shipping_detail = shipping.shipping_detail;
          if (shipping.receiver_name && !profile?.receiver_name) {
            profileUpdates.receiver_name = shipping.receiver_name;
          }
        }
      }

      // 필수 정보(이름·휴대전화·이메일)가 이미 모두 있으면 회원가입 페이지를 건너뜀
      const effectivePhone = (profileUpdates.phone as string | undefined) ?? profile?.phone ?? null;
      const effectiveName  = (profileUpdates.nickname as string | undefined) ?? profile?.nickname ?? null;
      const hasRealEmail = !isPlaceholderEmail(user?.email);

      const needsOnboarding = !effectiveName || !effectivePhone || !hasRealEmail;

      if (!needsOnboarding && !profile?.onboarding_done) {
        profileUpdates.onboarding_done = true;
      }

      if (user && Object.keys(profileUpdates).length > 0) {
        await supabase.from("profiles").update(profileUpdates).eq("id", user.id);
      }

      return NextResponse.redirect(
        needsOnboarding
          ? `${origin}/auth/complete-profile?next=${encodeURIComponent(next)}`
          : `${origin}${next}`,
      );
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`);
}
