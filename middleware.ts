import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function makeClient(request: NextRequest, storageKey?: string) {
  let res = NextResponse.next({ request });

  const client = createServerClient(
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
          res = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  return { client, getRes: () => res };
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAdminPath = pathname.startsWith("/admin");
  const isAdminLogin = pathname.startsWith("/admin/login");

  if (isAdminPath && !isAdminLogin) {
    // 어드민 경로: sb-admin 쿠키로 세션 확인
    const { client, getRes } = makeClient(request, "sb-admin");
    const { data: { user } } = await client.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    return getRes();
  }

  // 일반 경로: 기본 쿠키로 세션 갱신만
  const { client, getRes } = makeClient(request);
  await client.auth.getUser();
  return getRes();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
