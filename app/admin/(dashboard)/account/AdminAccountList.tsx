"use client";

import { useState, useTransition } from "react";
import { PasswordInput } from "@/components/admin/PasswordInput";
import { updateAdminNickname, resetAdminPassword, deleteAdminAccount } from "./actions";

type AdminAccount = {
  id: string;
  email: string | null;
  nickname: string | null;
  created_at: string;
  last_seen_at: string | null;
};

type LoginLog = {
  id: string;
  user_id: string;
  ip_address: string | null;
  logged_in_at: string;
  last_seen_at: string;
  logged_out_at: string | null;
};

const ONLINE_THRESHOLD_MS = 3 * 60 * 1000; // 3분 이내 = 온라인

function isOnline(lastSeenAt: string | null) {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < ONLINE_THRESHOLD_MS;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(startIso: string, endIso: string | null) {
  const end = endIso ? new Date(endIso) : new Date();
  const ms = end.getTime() - new Date(startIso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
}

function LogHistoryRows({ logs }: { logs: LoginLog[] }) {
  if (logs.length === 0) {
    return (
      <tr>
        <td colSpan={5} style={{ padding: "8px 16px", color: "var(--ink-soft)", fontSize: 12 }}>
          접속 기록이 없습니다.
        </td>
      </tr>
    );
  }
  return (
    <>
      <tr style={{ background: "var(--bg-soft)" }}>
        <td colSpan={5} style={{ padding: "4px 16px 0" }}>
          <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "var(--ink-soft)" }}>
                <th style={{ textAlign: "left", padding: "4px 8px 4px 0", fontWeight: 500 }}>접속 IP</th>
                <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 500 }}>로그인 시간</th>
                <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 500 }}>사용 시간</th>
                <th style={{ textAlign: "left", padding: "4px 8px", fontWeight: 500 }}>로그아웃</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} style={{ borderTop: "1px solid var(--line-soft)" }}>
                  <td style={{ padding: "5px 8px 5px 0" }}>{log.ip_address ?? "-"}</td>
                  <td style={{ padding: "5px 8px" }}>{formatDateTime(log.logged_in_at)}</td>
                  <td style={{ padding: "5px 8px" }}>{formatDuration(log.logged_in_at, log.logged_out_at)}</td>
                  <td style={{ padding: "5px 8px", color: log.logged_out_at ? "var(--ink)" : "var(--accent)" }}>
                    {log.logged_out_at ? formatDateTime(log.logged_out_at) : "접속 중"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </td>
      </tr>
    </>
  );
}

function AdminAccountRow({
  admin,
  isSelf,
  logs,
}: {
  admin: AdminAccount;
  isSelf: boolean;
  logs: LoginLog[];
}) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [nickname, setNickname] = useState(admin.nickname ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const online = isOnline(admin.last_seen_at);

  function handleSave() {
    setMsg(null);
    startTransition(async () => {
      try {
        await updateAdminNickname(admin.id, nickname);
        if (newPassword) {
          if (newPassword.length < 8) {
            setMsg({ type: "error", text: "비밀번호는 8자 이상이어야 합니다." });
            return;
          }
          await resetAdminPassword(admin.id, newPassword);
        }
        setNewPassword("");
        setEditing(false);
        setMsg({ type: "ok", text: "저장됐습니다." });
      } catch (e) {
        setMsg({ type: "error", text: e instanceof Error ? e.message : "저장 실패" });
      }
    });
  }

  function handleDelete() {
    if (!confirm(`"${admin.email}" 관리자를 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.`)) return;
    startTransition(async () => {
      try {
        await deleteAdminAccount(admin.id);
      } catch (e) {
        setMsg({ type: "error", text: e instanceof Error ? e.message : "삭제 실패" });
      }
    });
  }

  if (editing) {
    return (
      <>
        <tr>
          <td>
            {admin.email ?? "-"}
            {isSelf && <span className="admin-badge admin-badge--accent" style={{ marginLeft: 6, fontSize: 10 }}>나</span>}
          </td>
          <td>
            <input
              className="admin-inline-input"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="닉네임"
              disabled={isPending}
              style={{ width: 120 }}
            />
          </td>
          <td>
            <PasswordInput
              name="_pw_reset"
              autoComplete="new-password"
              placeholder="새 비밀번호 (선택)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={isPending}
              className="admin-inline-input"
              style={{ width: 160 }}
            />
          </td>
          <td>{new Date(admin.created_at).toLocaleDateString("ko-KR")}</td>
          <td>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {msg && (
                <span className={msg.type === "error" ? "admin-login-error" : "admin-login-ok"} style={{ fontSize: 12 }}>
                  {msg.text}
                </span>
              )}
              <button type="button" className="admin-btn" style={{ height: 30, padding: "0 12px", fontSize: 11 }}
                onClick={handleSave} disabled={isPending}>
                {isPending ? "저장 중…" : "저장"}
              </button>
              <button type="button" className="admin-btn admin-btn--ghost" style={{ height: 30, padding: "0 12px", fontSize: 11 }}
                onClick={() => { setEditing(false); setMsg(null); setNewPassword(""); setNickname(admin.nickname ?? ""); }}
                disabled={isPending}>
                취소
              </button>
            </div>
          </td>
        </tr>
      </>
    );
  }

  return (
    <>
      <tr style={{ cursor: "pointer" }}>
        <td onClick={() => setExpanded((v) => !v)}>
          {admin.email ?? "-"}
          {isSelf && <span className="admin-badge admin-badge--accent" style={{ marginLeft: 6, fontSize: 10 }}>나</span>}
        </td>
        <td onClick={() => setExpanded((v) => !v)}>{admin.nickname ?? <span style={{ color: "var(--ink-faint)" }}>-</span>}</td>
        <td onClick={() => setExpanded((v) => !v)}>
          <span
            className={online ? "admin-badge admin-badge--ok" : "admin-badge admin-badge--muted"}
            style={{ fontSize: 10, padding: "2px 7px" }}
          >
            {online ? "온라인" : "오프라인"}
          </span>
        </td>
        <td onClick={() => setExpanded((v) => !v)}>{new Date(admin.created_at).toLocaleDateString("ko-KR")}</td>
        <td>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {msg && (
              <span className={msg.type === "error" ? "admin-login-error" : "admin-login-ok"} style={{ fontSize: 12 }}>
                {msg.text}
              </span>
            )}
            <button type="button" className="admin-btn admin-btn--ghost"
              style={{ height: 30, padding: "0 12px", fontSize: 11 }}
              onClick={() => { setEditing(true); setMsg(null); }}
              disabled={isPending}>
              수정
            </button>
            {!isSelf && (
              <button type="button" className="admin-btn admin-btn--danger"
                style={{ height: 30, padding: "0 12px", fontSize: 11 }}
                onClick={handleDelete} disabled={isPending}>
                삭제
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && <LogHistoryRows logs={logs} />}
    </>
  );
}

export function AdminAccountList({
  admins,
  loginLogs,
  currentUserId,
}: {
  admins: AdminAccount[];
  loginLogs: LoginLog[];
  currentUserId: string;
}) {
  if (admins.length === 0) {
    return (
      <tr>
        <td colSpan={5} style={{ color: "var(--ink-soft)" }}>등록된 관리자가 없습니다.</td>
      </tr>
    );
  }
  return (
    <>
      {admins.map((a) => (
        <AdminAccountRow
          key={a.id}
          admin={a}
          isSelf={a.id === currentUserId}
          logs={loginLogs.filter((l) => l.user_id === a.id)}
        />
      ))}
    </>
  );
}
