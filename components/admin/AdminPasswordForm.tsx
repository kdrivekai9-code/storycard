"use client";

import { useState } from "react";
import { createAdminBrowserClient } from "@/lib/supabase/admin-client";
import { PasswordInput } from "./PasswordInput";

export function AdminPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<{ type: "error" | "ok"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (password.length < 8) {
      setMessage({ type: "error", text: "비밀번호는 8자 이상이어야 합니다." });
      return;
    }
    if (password !== confirm) {
      setMessage({ type: "error", text: "비밀번호가 일치하지 않습니다." });
      return;
    }

    setLoading(true);
    const supabase = createAdminBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setMessage({ type: "error", text: "비밀번호 변경에 실패했습니다." });
      return;
    }

    setPassword("");
    setConfirm("");
    setMessage({ type: "ok", text: "비밀번호가 변경되었습니다." });
  }

  return (
    <form className="admin-form" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="new-password">새 비밀번호</label>
        <PasswordInput
          id="new-password"
          name="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      <div>
        <label htmlFor="confirm-password">새 비밀번호 확인</label>
        <PasswordInput
          id="confirm-password"
          name="confirm-password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
      </div>

      {message && (
        <p className={message.type === "error" ? "admin-login-error" : "admin-login-ok"}>
          {message.text}
        </p>
      )}

      <button type="submit" className="admin-btn" disabled={loading}>
        {loading ? "변경 중..." : "비밀번호 변경"}
      </button>
    </form>
  );
}
