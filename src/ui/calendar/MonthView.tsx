import type { MonthCell } from "../../domain/calendar";
import { dayStart } from "../../lib/time";
import { countOf } from "../../domain/words";

/* The month at arm's length: counts, not titles. Weekends dim, the spill-over
   from neighbouring months fades, today carries the only green. */

const WEEKDAY_HEADS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function Cell({ cell, onOpenDay }: { cell: MonthCell; onOpenDay: (day: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpenDay(cell.day)}
      className={`flex min-h-[108px] flex-col items-start gap-1.5 px-3 py-2.5 text-left transition-colors hover:bg-hover ${
        cell.isToday
          ? "bg-[#131615] shadow-[inset_0_2px_0_var(--color-green)]"
          : cell.isWeekend
            ? "bg-rail"
            : "bg-panel"
      } ${cell.inMonth ? "" : "opacity-45"}`}
    >
      <span
        className={`text-[13px] ${
          cell.isToday ? "text-green" : cell.isWeekend ? "text-faint" : "text-muted"
        }`}
      >
        {dayStart(cell.day).getDate()}
      </span>
      {cell.lateCount > 0 && (
        <span className="flex items-center gap-1.5 text-[12px] text-[#e08b74]">
          <span className="h-[5px] w-[5px] rounded-full bg-red" />
          {countOf(cell.lateCount, "late", "late")}
        </span>
      )}
      {cell.taskCount > 0 && (
        <span className="flex items-center gap-1.5 text-[12px] text-text">
          <span className="h-[5px] w-[5px] rounded-full bg-green" />
          {countOf(cell.taskCount, "task")}
        </span>
      )}
      {cell.meetingCount > 0 && (
        <span className="text-[12px] text-muted">
          · {countOf(cell.meetingCount, "meeting")}
        </span>
      )}
    </button>
  );
}

export function MonthView({
  weeks,
  onOpenDay,
}: {
  weeks: MonthCell[][];
  onOpenDay: (day: string) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-[10px] border border-hairline bg-hairline">
      {WEEKDAY_HEADS.map((head) => (
        <span
          key={head}
          className="label bg-[#131615] px-3 py-2.5 text-[10px] tracking-[.12em] text-faint"
        >
          {head}
        </span>
      ))}
      {weeks.flat().map((cell) => (
        <Cell key={cell.day} cell={cell} onOpenDay={onOpenDay} />
      ))}
    </div>
  );
}
