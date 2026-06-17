"use client";

import { useState, useTransition } from "react";
import { AdminInlineSelect } from "@/components/admin/AdminInlineSelect";
import { ProviderBadge } from "@/components/admin/AdminBadge";
import { toggleRole, updateMember, deleteMember } from "./actions";

const ROLE_OPTIONS = [
  { value: "user", label: "일반회원" },
  { value: "admin", label: "관리자" },
];

type Member = {
  id: string;
  email: string | null;
  nickname: string | null;
  phone: string | null;
  ci: string | null;
  shipping_address: string | null;
  provider: string;
  role: string;
  created_at: string;
};

export function MemberRow({ m }: { m: Member }) {
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState(m.nickname ?? "");
  const [phone, setPhone] = useState(m.phone ?? "");
  const [ci, setCi] = useState(m.ci ?? "");
  const [shippingAddress, setShippingAddress] = useState(m.shipping_address ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      await updateMember(m.id, nickname, phone, ci, shippingAddress);
      setEditing(false);
    });
  }

  function handleDelete() {
    if (!confirm(`"${m.email ?? m.nickname ?? m.id}" 회원을 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.`)) return;
    startTransition(async () => {
      await deleteMember(m.id);
    });
  }

  if (editing) {
    return (
      <tr>
        <td>{m.email ?? "-"}</td>
        <td>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="닉네임"
            style={{ width: "100%", minWidth: 90 }}
            className="admin-inline-input"
            disabled={isPending}
          />
        </td>
        <td>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="010-0000-0000"
            style={{ width: "100%", minWidth: 120 }}
            className="admin-inline-input"
            disabled={isPending}
          />
        </td>
        <td>
          <input
            value={ci}
            onChange={(e) => setCi(e.target.value)}
            placeholder="CI 값"
            style={{ width: "100%", minWidth: 140 }}
            className="admin-inline-input"
            disabled={isPending}
          />
        </td>
        <td>
          <input
            value={shippingAddress}
            onChange={(e) => setShippingAddress(e.target.value)}
            placeholder="배송지 주소"
            style={{ width: "100%", minWidth: 180 }}
            className="admin-inline-input"
            disabled={isPending}
          />
        </td>
        <td>
          <ProviderBadge value={m.provider} />
        </td>
        <td>{m.role === "admin" ? "관리자" : "일반회원"}</td>
        <td>{new Date(m.created_at).toLocaleDateString("ko-KR")}</td>
        <td>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              className="admin-btn"
              style={{ height: 30, padding: "0 12px", fontSize: 11 }}
              onClick={handleSave}
              disabled={isPending}
            >
              {isPending ? "저장중…" : "저장"}
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--ghost"
              style={{ height: 30, padding: "0 12px", fontSize: 11 }}
              onClick={() => {
                setNickname(m.nickname ?? "");
                setPhone(m.phone ?? "");
                setCi(m.ci ?? "");
                setShippingAddress(m.shipping_address ?? "");
                setEditing(false);
              }}
              disabled={isPending}
            >
              취소
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>{m.email ?? "-"}</td>
      <td>{m.nickname ?? "-"}</td>
      <td style={{ whiteSpace: "nowrap" }}>{m.phone ?? "-"}</td>
      <td style={{ fontSize: 11, color: m.ci ? "var(--ink)" : "var(--ink-faint)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {m.ci ?? "-"}
      </td>
      <td style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {m.shipping_address ?? "-"}
      </td>
      <td>
        <ProviderBadge value={m.provider} />
      </td>
      <td>
        <AdminInlineSelect
          id={m.id}
          field="role"
          value={m.role}
          options={ROLE_OPTIONS}
          action={toggleRole}
        />
      </td>
      <td>{new Date(m.created_at).toLocaleDateString("ko-KR")}</td>
      <td>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            style={{ height: 30, padding: "0 12px", fontSize: 11 }}
            onClick={() => setEditing(true)}
            disabled={isPending}
          >
            수정
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--danger"
            style={{ height: 30, padding: "0 12px", fontSize: 11 }}
            onClick={handleDelete}
            disabled={isPending}
          >
            삭제
          </button>
        </div>
      </td>
    </tr>
  );
}
