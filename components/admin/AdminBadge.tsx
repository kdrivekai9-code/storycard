import type { ReactNode } from "react";

type Variant = "accent" | "danger" | "ok" | "muted";

export function AdminBadge({ children, variant = "muted" }: { children: ReactNode; variant?: Variant }) {
  return <span className={`admin-badge admin-badge--${variant}`}>{children}</span>;
}

export const CARD_TYPE_LABELS: Record<string, string> = {
  wedding: "청첩장",
  obituary: "부고장",
  first_birthday: "돌잔치초대장",
  general: "일반초대장",
};

export const TIER_LABELS: Record<string, string> = {
  standard: "일반",
  premium: "프리미엄",
};

export const STATUS_LABELS: Record<string, string> = {
  draft: "작성중",
  published: "게시됨",
};

export const PROVIDER_LABELS: Record<string, string> = {
  kakao: "카카오",
  naver: "네이버",
  email: "이메일",
};

export function CardTypeBadge({ value }: { value: string }) {
  return <AdminBadge variant="muted">{CARD_TYPE_LABELS[value] ?? value}</AdminBadge>;
}

export function TierBadge({ value }: { value: string }) {
  return <AdminBadge variant={value === "premium" ? "accent" : "muted"}>{TIER_LABELS[value] ?? value}</AdminBadge>;
}

export function StatusBadge({ value }: { value: string }) {
  return <AdminBadge variant={value === "published" ? "ok" : "muted"}>{STATUS_LABELS[value] ?? value}</AdminBadge>;
}

export function ProviderBadge({ value }: { value: string }) {
  const variant = value === "kakao" ? "accent" : value === "naver" ? "ok" : "muted";
  return <AdminBadge variant={variant}>{PROVIDER_LABELS[value] ?? value}</AdminBadge>;
}
