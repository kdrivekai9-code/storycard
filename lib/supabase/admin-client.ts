import { createBrowserClient } from "@supabase/ssr";

/** 어드민 전용 브라우저 클라이언트 — sessionStorage 사용으로 탭 닫으면 토큰 자동 삭제 */
export function createAdminBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        storage: typeof window !== "undefined" ? window.sessionStorage : undefined,
        storageKey: "sb-admin",
        persistSession: true,
        autoRefreshToken: true,
      },
    },
  );
}
