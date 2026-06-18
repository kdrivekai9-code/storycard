import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function makeSupabaseClient(request: NextRequest, storageKey?: string) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(storageKey ? { auth: { storageKey } } : {}),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  return { supabase, getResponse: () => supabaseResponse };
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAdminPath = pathname.startsWith("/admin");
  const isAdminLogin = pathname.startsWith("/admin/login");

  if (isAdminPath && !isAdminLogin) {
    // 어드민 경로: sb-admin 쿠키로 세션 확인
    const { supabase, getResponse } = makeSupabaseClient(request, "sb-admin");
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    return getResponse();
  }

  // 일반 경로: 기본 쿠키로 세션 갱신
  const { supabase, getResponse } = makeSupabaseClient(request);
  await supabase.auth.getUser();
  return getResponse();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
