"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Status = "checking" | "ready" | "invalid" | "done";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setStatus("ready");
    });

    // 코드 교환이 이미 끝나 세션이 존재하는 경우도 확인
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setStatus((s) => (s === "checking" ? "ready" : s));
    });

    // 5초 내 PASSWORD_RECOVERY 이벤트도, 세션도 없으면 만료/잘못된 링크로 처리
    const timeout = setTimeout(() => {
      setStatus((s) => (s === "checking" ? "invalid" : s));
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (password !== confirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError("비밀번호 변경에 실패했습니다. 다시 시도해주세요.");
      return;
    }

    setStatus("done");
    setTimeout(() => router.push("/login"), 1800);
  }

  return (
    <main className="login-page">
      <div className="login-card" style={{ maxWidth: 400 }}>
        <Link href="/" className="login-logo">
          STORY<em>CARD</em>
        </Link>
        <p className="login-subtitle">비밀번호 재설정</p>

        {status === "checking" && (
          <p style={{ textAlign: "center", color: "var(--ink-soft)", fontSize: 13, marginTop: 16 }}>
            링크 확인 중...
          </p>
        )}

        {status === "invalid" && (
          <>
            <p style={{ textAlign: "center", color: "var(--danger)", fontSize: 13, marginTop: 16, lineHeight: 1.6 }}>
              유효하지 않거나 만료된 링크입니다.<br />
              비밀번호 재설정을 다시 요청해주세요.
            </p>
            <Link href="/login" className="login-back" style={{ marginTop: 16 }}>
              ← 로그인으로 돌아가기
            </Link>
          </>
        )}

        {status === "done" && (
          <p style={{ textAlign: "center", color: "var(--ink)", fontSize: 13, marginTop: 16, lineHeight: 1.6 }}>
            비밀번호가 변경되었습니다.<br />
            로그인 페이지로 이동합니다...
          </p>
        )}

        {status === "ready" && (
          <form className="admin-login-form" onSubmit={handleSubmit} style={{ marginTop: 12 }}>
            <div>
              <label htmlFor="rp-password">새 비밀번호</label>
              <input
                id="rp-password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="8자 이상"
              />
            </div>
            <div>
              <label htmlFor="rp-confirm">비밀번호 확인</label>
              <input
                id="rp-confirm"
                type="password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            {error && <p className="admin-login-error">{error}</p>}

            <button type="submit" className="admin-btn" disabled={loading}>
              {loading ? "변경 중..." : "비밀번호 변경"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
