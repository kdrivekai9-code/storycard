"use client";

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

function dateToInputValue(stored: string): string {
  const m = stored.match(/^(\d{4})[.\-\s]+(\d{1,2})[.\-\s]+(\d{1,2})/);
  if (!m) return "";
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function dateFromInputValue(iso: string): string {
  if (!iso) return "";
  const [y, mo, d] = iso.split("-").map(Number);
  const weekday = WEEKDAY_KO[new Date(y, mo - 1, d).getDay()];
  return `${y}.${String(mo).padStart(2, "0")}.${String(d).padStart(2, "0")} (${weekday})`;
}

/** 날짜 입력 — 네이티브 달력 picker, 저장 형식: "2026.10.18 (토)" */
export function WeddingDatePicker({
  value,
  onChange,
  sample,
  invalid,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  sample?: boolean;
  invalid?: boolean;
  id?: string;
}) {
  const cls = ["wedding-date-input", sample ? "is-sample" : null, invalid ? "is-invalid" : null]
    .filter(Boolean)
    .join(" ");
  return (
    <input
      id={id}
      type="date"
      className={cls}
      value={dateToInputValue(value)}
      onChange={(e) => onChange(dateFromInputValue(e.target.value))}
    />
  );
}

function parseStoredTime(stored: string): { ampm: "오전" | "오후"; hour: number; minute: number } {
  const m = stored.match(/^(오전|오후)\s*(\d{1,2}):(\d{2})$/);
  if (!m) return { ampm: "오전", hour: 12, minute: 0 };
  const hour = Number(m[2]);
  const minute = Number(m[3]);
  return {
    ampm: m[1] as "오전" | "오후",
    hour: HOURS.includes(hour) ? hour : 12,
    minute: MINUTES.includes(minute) ? minute : 0,
  };
}

/** 시각 입력 — 오전/오후 · 1~12시 · 5분 단위 select 3종, 저장 형식: "오후 1:30" */
export function WeddingTimePicker({
  value,
  onChange,
  sample,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  sample?: boolean;
  invalid?: boolean;
}) {
  const { ampm, hour, minute } = parseStoredTime(value);

  const commit = (next: { ampm?: string; hour?: number; minute?: number }) => {
    const nextAmpm = next.ampm ?? ampm;
    const nextHour = next.hour ?? hour;
    const nextMinute = next.minute ?? minute;
    onChange(`${nextAmpm} ${nextHour}:${String(nextMinute).padStart(2, "0")}`);
  };

  const wrapCls = ["wedding-time-picker", sample ? "is-sample" : null, invalid ? "is-invalid" : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={wrapCls}>
      <select value={ampm} onChange={(e) => commit({ ampm: e.target.value })}>
        <option value="오전">오전</option>
        <option value="오후">오후</option>
      </select>
      <select value={hour} onChange={(e) => commit({ hour: Number(e.target.value) })}>
        {HOURS.map((h) => (
          <option key={h} value={h}>{h}시</option>
        ))}
      </select>
      <select value={minute} onChange={(e) => commit({ minute: Number(e.target.value) })}>
        {MINUTES.map((m) => (
          <option key={m} value={m}>{String(m).padStart(2, "0")}분</option>
        ))}
      </select>
    </div>
  );
}
