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
  receiver_name: string | null;
  shipping_address: string | null;
  shipping_detail: string | null;
  provider: string;
  role: string;
  created_at: string;
};

export function MemberRow({ m }: { m: Member }) {
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState(m.nickname ?? "");
  const [phone, setPhone] = useState(m.phone ?? "");
  const [ci, setCi] = useState(m.ci ?? "");
  const [receiverName, setReceiverName] = useState(m.receiver_name ?? "");
  const [shippingAddress, setShippingAddress] = useState(m.shipping_address ?? "");
  const [shippingDetail, setShippingDetail] = useState(m.shipping_detail ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      await updateMember(m.id, nickname, phone, ci, receiverName, shippingAddress, shippingDetail);
      setEditing(false);
    });
  }

  function handleCancel() {
    setNickname(m.nickname ?? "");
    setPhone(m.phone ?? "");
    setCi(m.ci ?? "");
    setReceiverName(m.receiver_name ?? "");
    setShippingAddress(m.shipping_address ?? "");
    setShippingDetail(m.shipping_detail ?? "");
    setEditing(false);
  }

  function handleDelete() {
    if (!confirm(`"${m.email ?? m.nickname ?? m.id}" 회원을 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.`)) return;
    startTransition(async () => {
      await deleteMember(m.id);
    });
  }

  const inlineInput = (value: string, onChange: (v: string) => void, placeholder: string, minWidth = 100) => (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ width: "100%", minWidth }}
      className="admin-inline-input"
      disabled={isPending}
    />
  );

  const actionBtns = editing ? (
    <div style={{ display: "flex", gap: 6 }}>
      <button type="button" className="admin-btn" style={{ height: 30, padding: "0 12px", fontSize: 11 }} onClick={handleSave} disabled={isPending}>
        {isPending ? "저장중…" : "저장"}
      </button>
      <button type="button" className="admin-btn admin-btn--ghost" style={{ height: 30, padding: "0 12px", fontSize: 11 }} onClick={handleCancel} disabled={isPending}>
        취소
      </button>
    </div>
  ) : (
    <div style={{ display: "flex", gap: 6 }}>
      <button type="button" className="admin-btn admin-btn--ghost" style={{ height: 30, padding: "0 12px", fontSize: 11 }} onClick={() => setEditing(true)} disabled={isPending}>
        수정
      </button>
      <button type="button" className="admin-btn admin-btn--danger" style={{ height: 30, padding: "0 12px", fontSize: 11 }} onClick={handleDelete} disabled={isPending}>
        삭제
      </button>
    </div>
  );

  if (editing) {
    return (
      <tr>
        <td>{m.email ?? "-"}</td>
        <td>{inlineInput(nickname, setNickname, "닉네임", 90)}</td>
        <td>{inlineInput(phone, setPhone, "010-0000-0000", 120)}</td>
        <td>{inlineInput(ci, setCi, "CI 값", 140)}</td>
        <td>{inlineInput(receiverName, setReceiverName, "홍길동", 90)}</td>
        <td>{inlineInput(shippingAddress, setShippingAddress, "(우편번호) 기본주소", 160)}</td>
        <td>{inlineInput(shippingDetail, setShippingDetail, "동·호수, 층", 120)}</td>
        <td><ProviderBadge value={m.provider} /></td>
        <td>{m.role === "admin" ? "관리자" : "일반회원"}</td>
        <td>{new Date(m.created_at).toLocaleDateString("ko-KR")}</td>
        <td>{actionBtns}</td>
      </tr>
    );
  }

  const ellipsis: React.CSSProperties = { maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

  return (
    <tr>
      <td>{m.email ?? "-"}</td>
      <td>{m.nickname ?? "-"}</td>
      <td style={{ whiteSpace: "nowrap" }}>{m.phone ?? "-"}</td>
      <td style={{ ...ellipsis, fontSize: 11, color: m.ci ? "var(--ink)" : "var(--ink-faint)" }}>{m.ci ?? "-"}</td>
      <td>{m.receiver_name ?? "-"}</td>
      <td style={ellipsis}>{m.shipping_address ?? "-"}</td>
      <td style={ellipsis}>{m.shipping_detail ?? "-"}</td>
      <td><ProviderBadge value={m.provider} /></td>
      <td>
        <AdminInlineSelect id={m.id} field="role" value={m.role} options={ROLE_OPTIONS} action={toggleRole} />
      </td>
      <td>{new Date(m.created_at).toLocaleDateString("ko-KR")}</td>
      <td>{actionBtns}</td>
    </tr>
  );
}
