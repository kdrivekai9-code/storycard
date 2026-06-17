const KR_DAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** ISO timestamptz → "2026.10.18 (토)" */
export function isoToDateInput(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const dow = KR_DAYS[d.getDay()];
  return `${y}.${m}.${day} (${dow})`;
}

/** ISO timestamptz → "오후 1:30" */
export function isoToTimeInput(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const min = String(d.getMinutes()).padStart(2, "0");
  const ampm = h < 12 ? "오전" : "오후";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${ampm} ${h12}:${min}`;
}
