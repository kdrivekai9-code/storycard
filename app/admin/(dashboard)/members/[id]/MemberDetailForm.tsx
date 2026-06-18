"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProviderBadge } from "@/components/admin/AdminBadge";
import { updateMember, deleteMember, sendMemberPasswordReset } from "../actions";

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

export function MemberDetailForm({ member }: { member: Member }) {
  const router = useRouter();
  const [nickname, setNickname] = useState(member.nickname ?? "");
  const [phone, setPhone] = useState(member.phone ?? "");
  const [ci, setCi] = useState(member.ci ?? "");
  const [receiverName, setReceiverName] = useState(member.receiver_name ?? "");
  const [shippingAddress, setShippingAddress] = useState(member.shipping_address ?? "");
  const [shippingDetail, setShippingDetail] = useState(member.shipping_detail ?? "");
  const [msg, setMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [resetSending, setResetSending] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setMsg(null);
    startTransition(async () => {
      try {
        await updateMember(member.id, nickname, phone, ci, receiverName, shippingAddress, shippingDetail);
        setMsg({ type: "ok", text: "저장됐습니다." });
      } catch (e) {
        setMsg({ type: "error", text: e instanceof Error ? e.message : "저장 실패" });
      }
    });
  }

  function handlePasswordReset() {
    if (!member.email) {
      setMsg({ type: "error", text: "등록된 이메일이 없습니다." });
      return;
    }
    if (!confirm(`"${member.email}"로 비밀번호 재설정 링크를 전송하시겠습니까?`)) return;

    setMsg(null);
    setResetSending(true);
    startTransition(async () => {
      try {
        await sendMemberPasswordReset(member.email!);
        setMsg({ type: "ok", text: "비밀번호 재설정 이메일을 전송했습니다." });
      } catch (e) {
        setMsg({ type: "error", text: e instanceof Error ? e.message : "전송 실패" });
      } finally {
        setResetSending(false);
      }
    });
  }

  function handleDelete() {
    if (!confirm(`"${member.email ?? member.nickname ?? member.id}" 회원을 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.`)) return;
    startTransition(async () => {
      await deleteMember(member.id);
      router.push("/admin/members");
    });
  }

  return (
    <div className="admin-form" style={{ maxWidth: 480 }}>
      <div>
        <label>이메일</label>
        <input value={member.email ?? ""} disabled />
      </div>

      <div>
        <label>채널 / 가입일</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center", height: 38 }}>
          <ProviderBadge value={member.provider} />
          <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>
            {new Date(member.created_at).toLocaleString("ko-KR")}
          </span>
        </div>
      </div>

      <div>
        <label htmlFor="md-nickname">닉네임</label>
        <input
          id="md-nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          disabled={isPending}
        />
      </div>

      <div>
        <label htmlFor="md-phone">휴대폰</label>
        <input
          id="md-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="010-0000-0000"
          disabled={isPending}
        />
      </div>

      <div>
        <label htmlFor="md-ci">CI (본인인증 연계정보)</label>
        <input
          id="md-ci"
          value={ci}
          onChange={(e) => setCi(e.target.value)}
          disabled={isPending}
        />
      </div>

      <div>
        <label htmlFor="md-receiver">받는 분</label>
        <input
          id="md-receiver"
          value={receiverName}
          onChange={(e) => setReceiverName(e.target.value)}
          disabled={isPending}
        />
      </div>

      <div>
        <label htmlFor="md-address">주소</label>
        <input
          id="md-address"
          value={shippingAddress}
          onChange={(e) => setShippingAddress(e.target.value)}
          placeholder="(우편번호) 기본주소"
          disabled={isPending}
        />
      </div>

      <div>
        <label htmlFor="md-address-detail">상세주소</label>
        <input
          id="md-address-detail"
          value={shippingDetail}
          onChange={(e) => setShippingDetail(e.target.value)}
          placeholder="동·호수, 층 등"
          disabled={isPending}
        />
      </div>

      {msg && (
        <p className={msg.type === "error" ? "admin-login-error" : "admin-login-ok"}>{msg.text}</p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="admin-btn" onClick={handleSave} disabled={isPending}>
          {isPending ? "처리 중…" : "저장"}
        </button>
        <button
          type="button"
          className="admin-btn admin-btn--ghost"
          onClick={handlePasswordReset}
          disabled={isPending || resetSending}
        >
          {resetSending ? "전송 중…" : "비밀번호 초기화"}
        </button>
        <button type="button" className="admin-btn admin-btn--danger" onClick={handleDelete} disabled={isPending}>
          회원 삭제
        </button>
      </div>
    </div>
  );
}
