import { buildDateBig, buildTimeBig, calcDday, parseEventDate } from "@/lib/invitation/derive";
import type { UserData } from "@/lib/invitation/types";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

interface CalCell {
  date: number;
  muted: boolean;
  isTarget: boolean;
}

function buildCalendarWeeks(target: Date): CalCell[][] {
  const year = target.getFullYear();
  const month = target.getMonth();
  const startOffset = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells: CalCell[] = [];
  for (let i = startOffset - 1; i >= 0; i--) {
    cells.push({ date: daysInPrevMonth - i, muted: true, isTarget: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: d, muted: false, isTarget: d === target.getDate() });
  }
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ date: nextDay++, muted: true, isTarget: false });
  }

  const weeks: CalCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

export function WhenSection({ userData }: { userData: UserData }) {
  const target = parseEventDate(userData.dateInput, userData.timeInput);
  const dday = calcDday(userData.dateInput, userData.timeInput);
  const ddayLabel = dday > 0 ? `D-${dday}` : dday === 0 ? "D-DAY" : `D+${-dday}`;
  const weeks = target ? buildCalendarWeeks(target) : [];

  return (
    <section className="inv-section inv-when">
      <div className="eyebrow">When</div>
      <h2 className="heading">예식일</h2>
      <div className="big-date">{buildDateBig(userData.dateInput)}</div>
      <div className="time">{buildTimeBig(userData.dateInput, userData.timeInput)}</div>

      {weeks.length > 0 && (
        <div className="calendar">
          <div className="cal-row head">
            {WEEKDAY_LABELS.map((label, i) => (
              <div key={i}>{label}</div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div className="cal-row" key={wi}>
              {week.map((cell, di) => (
                <div
                  key={di}
                  className={`d${cell.muted ? " muted" : ""}${cell.isTarget ? " mark" : ""}`}
                >
                  {cell.date}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="dday">
        D-DAY · <strong>{ddayLabel}</strong>
      </div>
    </section>
  );
}
