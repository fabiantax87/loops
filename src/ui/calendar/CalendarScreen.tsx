import { useEffect, useMemo, useState } from "react";
import { items, meta } from "../../db/repo";
import {
  type BlockContent,
  type CalendarView,
  type Meeting,
  type TaskEntry,
  buildCalendar,
  rescheduleWrite,
} from "../../domain/calendar";
import { useClock } from "../../lib/ClockContext";
import {
  type Day,
  type Instant,
  addDays,
  addMonths,
  daysAgo,
  today,
} from "../../lib/time";
import { useCalendar } from "../../state/calendarSync";
import { useSnapshot, useStore } from "../../state/store";
import type { Clock } from "../../lib/clock";
import { AllDayShelf } from "./DayView";
import { CalendarSettingsSheet, ConnectSheet } from "./ConnectGoogle";
import {
  DAY_PX_PER_HOUR,
  DayColumn,
  HourGutter,
  WEEK_PX_PER_HOUR,
} from "./HourGrid";
import { useBlockDrag } from "./useBlockDrag";
import { MeetingDetail } from "./MeetingDetail";
import { MonthView } from "./MonthView";
import { TaskEditor } from "./TaskEditor";
import { WeekView } from "./WeekView";

/* The calendar: the day as it will actually be lived — meetings from Google,
   the app's own deadlines and check-ins beside them. Day is home; week and
   month are for looking ahead. */

const VIEW_KEY = "calendar_view";
const VIEWS: CalendarView[] = ["day", "week", "month"];
const HOME_LABEL: Record<CalendarView, string> = {
  day: "Today",
  week: "This week",
  month: "This month",
};

function step(view: CalendarView, anchor: Day, direction: 1 | -1): Day {
  if (view === "day") return addDays(anchor, direction);
  if (view === "week") return addDays(anchor, 7 * direction);
  return addMonths(anchor, direction);
}

/** "synced 4 min ago" — the footer's honesty about how fresh Google's half is. */
function agoLabel(instant: Instant, clock: Clock): string {
  const minutes = Math.max(
    0,
    Math.round((clock.now().getTime() - new Date(instant).getTime()) / 60_000),
  );
  if (minutes < 1) return "synced just now";
  if (minutes < 60) return `synced ${minutes} min ago`;
  const days = daysAgo(instant, clock);
  if (days === 0) return `synced ${Math.round(minutes / 60)} h ago`;
  return days === 1 ? "synced yesterday" : `synced ${days} days ago`;
}

export function CalendarScreen() {
  const snapshot = useSnapshot();
  const clock = useClock();
  const { db } = useStore();

  const [view, setView] = useState<CalendarView>("day");
  const [anchor, setAnchor] = useState<Day>(() => today(clock));
  const [opened, setOpened] = useState<Meeting | null>(null);
  const [editing, setEditing] = useState<TaskEntry | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [settings, setSettings] = useState(false);
  const { act } = useStore();

  const open = (content: BlockContent) => {
    if (content.type === "meeting") setOpened(content.meeting);
    else setEditing(content.task);
  };

  const connection = useCalendar(anchor);
  // Rebuilt on every pointermove otherwise — five days of blocks, re-sorted.
  const model = useMemo(
    () => buildCalendar(snapshot, connection.meetings, clock, view, anchor),
    [snapshot, connection.meetings, clock, view, anchor],
  );

  const hours = model.view === "month" ? null : model;
  const drag = useBlockDrag({
    pxPerHour: view === "week" ? WEEK_PX_PER_HOUR : DAY_PX_PER_HOUR,
    startHour: hours?.startHour ?? 0,
    endHour: hours?.endHour ?? 24,
    crossDay: view === "week",
    onOpen: (content) => open(content),
    onCommit: (task, day, range, mode) => {
      const { time, durationMinutes } = rescheduleWrite(task, range, mode);
      return act((db, c) =>
        task.kind === "checkin"
          ? items.setCheckinSchedule(db, c, task.item.id, {
              checkinOn: day,
              checkinTime: time,
              durationMinutes,
            })
          : items.setSchedule(db, c, task.item.id, {
              deadline: day,
              deadlineTime: time,
              durationMinutes,
            }),
      );
    },
  });

  // The last-used view survives a restart; day stays the default.
  useEffect(() => {
    void meta.get(db, VIEW_KEY).then((stored) => {
      if (stored === "week" || stored === "month") setView(stored);
    });
  }, [db]);
  const switchView = (next: CalendarView) => {
    setView(next);
    void meta.set(db, VIEW_KEY, next);
  };

  const openDay = (day: Day) => {
    setAnchor(day);
    switchView("day");
  };

  // ← → move by the view's unit; T comes home. Never while typing or while a
  // sheet holds the screen.
  const sheetOpen = opened !== null || editing !== null || connecting || settings;
  useEffect(() => {
    if (sheetOpen) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "ArrowLeft") setAnchor((a) => step(view, a, -1));
      if (event.key === "ArrowRight") setAnchor((a) => step(view, a, 1));
      if (event.key.toLowerCase() === "t") setAnchor(today(clock));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [view, clock, sheetOpen]);

  return (
    <div className="flex w-full max-w-[980px] flex-col gap-[30px] py-11">
      <header className="flex items-center gap-5">
        <span className="label flex-1 text-muted">{model.rangeLabel}</span>
        <div className="flex items-center gap-[18px]">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Back"
              onClick={() => setAnchor((a) => step(view, a, -1))}
              className="rounded-md px-2 py-[5px] text-sm text-muted transition-colors hover:bg-hover hover:text-text"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setAnchor(today(clock))}
              className="rounded-md px-2.5 py-[5px] text-[13px] text-soft transition-colors hover:bg-hover hover:text-text"
            >
              {HOME_LABEL[view]}
            </button>
            <button
              type="button"
              aria-label="Forward"
              onClick={() => setAnchor((a) => step(view, a, 1))}
              className="rounded-md px-2 py-[5px] text-sm text-muted transition-colors hover:bg-hover hover:text-text"
            >
              ›
            </button>
          </div>
          <div className="flex gap-0.5 rounded-lg border border-[#1d2120] bg-chrome p-[3px]">
            {VIEWS.map((candidate) => (
              <button
                key={candidate}
                type="button"
                onClick={() => switchView(candidate)}
                className={`rounded-md px-3 py-[5px] text-[13px] capitalize transition-colors ${
                  view === candidate
                    ? "bg-frame text-text"
                    : "text-muted hover:text-text"
                }`}
              >
                {candidate}
              </button>
            ))}
          </div>
        </div>
      </header>

      {model.view === "day" && (
        <div className="grid grid-cols-[64px_1fr] gap-x-[18px]">
          <span className="fact pt-3.5 pr-1.5 text-right text-[11px] text-faint">
            {model.entries.allDayMeetings.length + model.entries.untimedTasks.length > 0
              ? "all day"
              : ""}
          </span>
          <div>
            <AllDayShelf
              entries={model.entries}
              dueToday={anchor === today(clock)}
              onOpenMeeting={open}
              onEdit={setEditing}
            />
          </div>
          <HourGutter
            startHour={model.startHour}
            endHour={model.endHour}
            pxPerHour={DAY_PX_PER_HOUR}
          />
          <DayColumn
            blocks={model.entries.blocks}
            day={anchor}
            drag={drag}
            startHour={model.startHour}
            endHour={model.endHour}
            pxPerHour={DAY_PX_PER_HOUR}
            nowMinutes={model.nowMinutes}
            onOpen={open}
          />
        </div>
      )}

      {model.view === "week" && (
        <WeekView
          days={model.days}
          startHour={model.startHour}
          endHour={model.endHour}
          onOpen={open}
          onEditTask={setEditing}
          onOpenDay={openDay}
          drag={drag}
        />
      )}

      {model.view === "month" && <MonthView weeks={model.weeks} onOpenDay={openDay} />}

      <footer className="flex items-center gap-2.5 border-t border-hairline pt-4">
        <span className="label text-[10px] tracking-[.14em] text-faint">Google Calendar</span>
        {!connection.available ? (
          <span className="fact text-[11px] text-faint">demo data at localhost</span>
        ) : connection.phase === "disconnected" ? (
          <button
            type="button"
            onClick={() => setConnecting(true)}
            className="fact text-[11px] text-green transition-colors hover:text-green-hover"
          >
            connect…
          </button>
        ) : (
          <>
            <span className="fact text-[11px] text-muted">
              {connection.email ?? "connected"}
              {connection.phase === "syncing"
                ? " · syncing…"
                : connection.phase === "error"
                  ? " · couldn't reach Google"
                  : connection.lastSync
                    ? ` · ${agoLabel(connection.lastSync, clock)}`
                    : ""}
            </span>
            <button
              type="button"
              onClick={() => setSettings(true)}
              className="fact text-[11px] text-faint transition-colors hover:text-text"
            >
              settings
            </button>
          </>
        )}
      </footer>

      {opened && <MeetingDetail meeting={opened} onClose={() => setOpened(null)} />}
      {editing && <TaskEditor task={editing} onClose={() => setEditing(null)} />}
      {connecting && <ConnectSheet connection={connection} onClose={() => setConnecting(false)} />}
      {settings && (
        <CalendarSettingsSheet connection={connection} onClose={() => setSettings(false)} />
      )}
    </div>
  );
}
