import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const logId = body?.logId as string | undefined;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    // 로그인 로그 종료 기록
    if (logId) {
      await supabase
        .from("admin_login_logs")
        .update({ logged_out_at: new Date().toISOString() })
        .eq("id", logId)
        .eq("user_id", user.id);
    }

    // Supabase 서버에서 세션 만료 — 탭 닫은 후에도 토큰 재사용 불가
    await supabase.auth.signOut();

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
