import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

/** 네이버 간편로그인 시작 — state를 발급하고 네이버 인증 화면으로 이동합니다. */
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const state = randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.NEXT_PUBLIC_NAVER_CLIENT_ID ?? "",
    redirect_uri: `${origin}/auth/naver/callback`,
    state,
  });

  const response = NextResponse.redirect(`https://nid.naver.com/oauth2.0/authorize?${params.toString()}`);
  response.cookies.set("naver_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
