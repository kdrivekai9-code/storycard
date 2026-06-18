"use client";

import Link from "next/link";
import { useTransition } from "react";
import { AdminInlineSelect } from "@/components/admin/AdminInlineSelect";
import { ProviderBadge } from "@/components/admin/AdminBadge";
import { toggleRole, deleteMember } from "./actions";

const ROLE_OPTIONS = [
  { value: "user", label: "일반회원" },
  { value: "admin", label: "관리자" },
];

type Member = {
  id: string;
  email: string | null;
  nickname: string | null;
  phone: string | null;
  provider: string;
  role: string;
  created_at: string;
};

export function MemberRow({ m }: { m: Member }) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`"${m.email ?? m.nickname ?? m.id}" 회원을 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.`)) return;
    startTransition(async () => {
      await deleteMember(m.id);
    });
  }

  return (
    <tr>
      <td>{m.email ?? "-"}</td>
      <td>{m.nickname ?? "-"}</td>
      <td style={{ whiteSpace: "nowrap" }}>{m.phone ?? "-"}</td>
      <td>
        <ProviderBadge value={m.provider} />
      </td>
      <td>
        <AdminInlineSelect id={m.id} field="role" value={m.role} options={ROLE_OPTIONS} action={toggleRole} />
      </td>
      <td>{new Date(m.created_at).toLocaleDateString("ko-KR")}</td>
      <td>
        <div style={{ display: "flex", gap: 6 }}>
          <Link
            href={`/admin/members/${m.id}`}
            className="admin-btn admin-btn--ghost"
            style={{ height: 30, padding: "0 12px", fontSize: 11, display: "inline-flex", alignItems: "center" }}
          >
            상세보기
          </Link>
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
