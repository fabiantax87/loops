import { useState } from "react";
import { items } from "../../db/repo";
import { parseDate } from "../../domain/capture";
import { DEFAULT_TASK_MINUTES, type TaskEntry } from "../../domain/calendar";
import { niceDay } from "../../domain/today";
import { useClock } from "../../lib/ClockContext";
import type { Day } from "../../lib/time";
import { useStore } from "../../state/store";

/* The calendar's task editor: everything about the item's place in the day —
   title, notes, the day itself, a moment, and how long it takes. Meetings get
   none of this; they are edited in Google or not at all. */

type Unit = "min" | "h";

const UNITS: { value: Unit; label: string }[] = [
  { value: "min", label: "minutes" },
  { value: "h", label: "hours" },
];

/** The app draws its own controls, so the native chevron goes and ⌄ stands in. */
function Select({
  value,
  choices,
  onChange,
  label,
}: {
  value: string;
  choices: { value: string; label: string }[];
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-md border border-outline bg-[#212624] py-2 pr-8 pl-3 text-[14px] text-text outline-none focus:border-outline-hover"
      >
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-[calc(50%+3px)] text-sm leading-none text-faint">
        ⌄
      </span>
    </div>
  );
}

/** Minutes as typed in the chosen unit — "0.75" reads better than "45/60". */
function amountOf(minutes: number, unit: Unit): string {
  const value = unit === "h" ? minutes / 60 : minutes;
  return String(Number(value.toFixed(2)));
}

/** What the typed amount is worth in minutes; NaN when it can't be read. */
function minutesOf(amount: string, unit: Unit): number {
  const value = Number(amount.trim());
  if (amount.trim() === "" || !Number.isFinite(value) || value < 0) return NaN;
  return Math.round(unit === "h" ? value * 60 : value);
}

function normalisedTime(text: string): string | null | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return undefined; // unusable
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  if (hour > 23 || minute > 59) return undefined;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function TaskEditor({ task, onClose }: { task: TaskEntry; onClose: () => void }) {
  const { act } = useStore();
  const clock = useClock();
  const item = task.item;
  const checkin = task.kind === "checkin";

  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [dayText, setDayText] = useState("");
  const [timeText, setTimeText] = useState(
    (checkin ? item.checkinTime : item.deadlineTime) ?? "",
  );
  // Hours only when the stored length divides evenly into them; otherwise the
  // number would read as an awkward fraction the moment the sheet opens.
  const stored = item.durationMinutes ?? DEFAULT_TASK_MINUTES;
  const [unit, setUnit] = useState<Unit>(stored >= 60 && stored % 60 === 0 ? "h" : "min");
  const [amount, setAmount] = useState(() =>
    amountOf(stored, stored >= 60 && stored % 60 === 0 ? "h" : "min"),
  );

  const currentDay: Day | null = checkin ? item.checkinOn : item.deadline;
  const dayGuess = /^\d{4}-\d{2}-\d{2}$/.test(dayText.trim())
    ? { day: dayText.trim(), phrase: dayText.trim() }
    : parseDate(dayText, clock);
  const pickedDay = dayText.trim() === "" ? currentDay : (dayGuess?.day ?? null);
  const time = normalisedTime(timeText);
  const minutes = minutesOf(amount, unit);
  const valid =
    title.trim() !== "" &&
    pickedDay !== null &&
    time !== undefined &&
    Number.isFinite(minutes) &&
    minutes > 0;

  /** Changing the unit restates the same length, it doesn't change it. */
  const changeUnit = (next: Unit) => {
    if (next === unit) return;
    if (Number.isFinite(minutes)) setAmount(amountOf(minutes, next));
    setUnit(next);
  };

  const save = () => {
    if (!valid || pickedDay === null) return;
    const duration = minutes === DEFAULT_TASK_MINUTES ? null : minutes;
    void act(async (db, c) => {
      await items.edit(db, c, item.id, { title, notes: notes.trim() || null });
      if (checkin) {
        await items.setCheckinSchedule(db, c, item.id, {
          checkinOn: pickedDay,
          checkinTime: time ?? null,
          durationMinutes: duration,
        });
      } else {
        await items.setSchedule(db, c, item.id, {
          deadline: pickedDay,
          deadlineTime: time ?? null,
          durationMinutes: duration,
        });
      }
    }).then(onClose);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/70 pt-[16vh]"
      onMouseDown={onClose}
    >
      <div
        className="flex w-[560px] flex-col gap-4 rounded-xl border border-[#313734] bg-hover p-6 shadow-[0_22px_55px_rgba(0,0,0,.55)]"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
        }}
      >
        <div className="flex items-baseline gap-3">
          <span className="label flex-1 text-faint">
            {checkin ? "Edit check-in" : "Edit task"}
          </span>
          <span className="fact text-[11px] text-faint">{task.where}</span>
        </div>

        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="w-full rounded-lg border border-outline bg-[#212624] px-3.5 py-3 text-[17px] text-text outline-none placeholder:text-faint focus:border-outline-hover"
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes — context, links, whatever the title can't carry"
          rows={3}
          className="w-full resize-y rounded-lg border border-outline bg-[#212624] px-3.5 py-3 text-[14px] leading-[1.55] text-text outline-none placeholder:text-faint focus:border-outline-hover"
        />

        <div className="flex items-end gap-5">
          <div className="flex flex-col gap-1.5">
            <span className="label text-[10px] tracking-[.12em] text-faint">
              {checkin ? "Check-in day" : "Deadline"}
            </span>
            <input
              value={dayText}
              onChange={(e) => setDayText(e.target.value)}
              placeholder={currentDay ? niceDay(currentDay) : "mon · in 3 days · 12 sep"}
              className="w-44 rounded-md border border-outline bg-[#212624] px-3 py-2 text-[14px] text-text outline-none placeholder:text-faint focus:border-outline-hover"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label text-[10px] tracking-[.12em] text-faint">Time</span>
            <input
              value={timeText}
              onChange={(e) => setTimeText(e.target.value)}
              placeholder="15:00 · empty = all day"
              className="w-40 rounded-md border border-outline bg-[#212624] px-3 py-2 text-[14px] text-text outline-none placeholder:text-faint focus:border-outline-hover"
            />
          </div>
          <span className="fact pb-2.5 text-[11px] text-faint">
            {dayText.trim() !== "" &&
              (dayGuess ? `${niceDay(dayGuess.day)} ⏎` : "?")}
            {dayText.trim() === "" && currentDay && niceDay(currentDay)}
            {time === undefined && " · time?"}
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="label text-[10px] tracking-[.12em] text-faint">Takes</span>
          <div className="flex items-center gap-2.5">
            <input
              aria-label="How long"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              className="w-20 rounded-md border border-outline bg-[#212624] px-3 py-2 text-[14px] text-text outline-none focus:border-outline-hover"
            />
            <Select label="Unit" value={unit} choices={UNITS} onChange={(u) => changeUnit(u as Unit)} />
            {unit === "h" && Number.isFinite(minutes) && minutes % 60 !== 0 && (
              <span className="fact text-[11px] text-faint">{minutes} min</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 pt-1">
          <button
            type="button"
            onClick={save}
            disabled={!valid}
            className="rounded-lg bg-green px-4 py-2 text-sm text-ink transition-colors hover:bg-green-hover disabled:opacity-40"
          >
            Save
          </button>
          <span className="fact text-[11px] text-faint">⌘⏎ save · esc dismiss</span>
        </div>
      </div>
    </div>
  );
}
