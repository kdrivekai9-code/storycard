import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/** 서비스 롤 키를 사용하는 관리자 클라이언트 — 서버 환경(Route Handler 등)에서만 사용합니다. */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
