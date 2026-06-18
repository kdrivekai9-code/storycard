import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** 어드민 전용 서버 클라이언트
 *  storageKey "sb-admin" → 일반 사용자 세션과 쿠키가 완전 분리됨 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { storageKey: "sb-admin" },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component — middleware가 세션 갱신 처리
          }
        },
      },
    },
  );
}
