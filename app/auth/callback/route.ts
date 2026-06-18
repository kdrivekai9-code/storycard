import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { isPlaceholderEmail } from "@/lib/supabase/profile-utils";

interface KakaoShippingAddress {
  id: number;
  name?: string;
  is_default: boolean;
  base_address?: string;
  detail_address?: string;
  receiver_name?: string;
  receiver_phone_number1?: string;
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

async function fetchKakaoShippingAddress(providerToken: string): Promise<KakaoShippingResult> {
  const empty = { shipping_address: null, shipping_detail: null, receiver_name: null };
  try {
    const res = await fetch("https://kapi.kakao.com/v1/user/shipping_address", {
      headers: { Authorization: `Bearer ${providerToken}` },
    });
    if (!res.ok) return empty;

    const data: KakaoShippingResponse = await res.json();
    if (data.shipping_addresses_needs_agreement || !data.shipping_addresses?.length) return empty;

    const addr =
      data.shipping_addresses.find((a) => a.is_default) ?? data.shipping_addresses[0];

    const baseParts = [
      addr.zone_code ? `(${addr.zone_code})` : null,
      addr.base_address,
    ].filter(Boolean);

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
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: { user } } = await supabase.auth.getUser();

      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_done, role, phone, shipping_address, receiver_name")
        .eq("id", user?.id ?? "")
        .single();

      if (profile?.role === "admin") {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?blocked=admin`);
      }

      const providerToken = session?.provider_token ?? null;
      const profileUpdates: Record<string, string> = {};

      // 전화번호 — user_metadata에서 추출
      const kakaoPhone =
        (user?.user_metadata?.phone_number as string | undefined) ??
        (user?.user_metadata?.phone as string | undefined) ??
        null;
      if (kakaoPhone && !profile?.phone) {
        profileUpdates.phone = kakaoPhone;
      }

      // 배송지 — 카카오 배송지 API (기본주소, 상세주소, 받는분 이름 분리 저장)
      if (providerToken && !profile?.shipping_address) {
        const shipping = await fetchKakaoShippingAddress(providerToken);
        if (shipping.shipping_address) profileUpdates.shipping_address = shipping.shipping_address;
        if (shipping.shipping_detail) profileUpdates.shipping_detail = shipping.shipping_detail;
        if (shipping.receiver_name && !profile?.receiver_name) {
          profileUpdates.receiver_name = shipping.receiver_name;
        }
      }

      if (user && Object.keys(profileUpdates).length > 0) {
        await supabase.from("profiles").update(profileUpdates).eq("id", user.id);
      }

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
