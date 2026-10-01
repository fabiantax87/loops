import { useEffect, useMemo, useState } from "react";
import { items, meta } from "../../db/repo";
import {
  type BlockContent,
  type Booking,
  type CalendarView,
  type Meeting,
  type TaskEntry,
  buildCalendar,
  rescheduleWrite,
} from "../../domain/calendar";
import { showsStrip } from "../../domain/capacity";
import { useClock } from "../../lib/ClockContext";
import {
  type Day,
  type Instant,
  addDays,
  addMonths,
  daysAgo,
  today,
} from "../../lib/time";
import { type SyncPhase, useCalendar } from "../../state/calendarSync";
import { useProductive } from "../../state/productiveSync";
import { useSnapshot, useStore } from "../../state/store";
import type { Clock } from "../../lib/clock";
import { BookingDetail, CapacityStrip, DayTotalDetail } from "./Capacity";
import { AllDayShelf } from "./DayView";
import { CalendarSettingsSheet, ConnectSheet } from "./ConnectGoogle";
import { ConnectProductiveSheet, ProductiveSettingsSheet } from "./ConnectProductive";
import {
  DAY_PX_PER_HOUR,
  DayColumn,
  HourGutter,
  WEEK_PX_PER_HOUR,
} from "./HourGrid";
import { useBlockDrag } from "./useBlockDrag";
import { MeetingDetail } from "./MeetingDetail";
import { TaskDetail } from "./TaskDetail";
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

/** "Sat" · "14 Sep" — when the bookings stopped being trustworthy. */
function sinceLabel(instant: Instant, clock: Clock): string {
  const days = daysAgo(instant, clock);
  const at = new Date(instant);
  if (days === 0) return "today";
  if (days < 7) return new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(at);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(at);
}

/** The footer's status words, shared by both connections. */
function phaseLabel(
  phase: SyncPhase,
  lastSync: Instant | null,
  clock: Clock,
  service: string,
): string {
  if (phase === "syncing") return "syncing…";
  if (phase === "error") return `couldn't reach ${service}`;
  return lastSync ? agoLabel(lastSync, clock) : "";
}

export function CalendarScreen() {
  const snapshot = useSnapshot();
  const clock = useClock();
  const { db } = useStore();

  const [view, setView] = useState<CalendarView>("day");
  const [anchor, setAnchor] = useState<Day>(() => today(clock));
  const [opened, setOpened] = useState<Meeting | null>(null);
  const [viewing, setViewing] = useState<TaskEntry | null>(null);
  const [editing, setEditing] = useState<TaskEntry | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [settings, setSettings] = useState(false);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [total, setTotal] = useState(false);
  const [connectingProductive, setConnectingProductive] = useState(false);
  const [productiveSettings, setProductiveSettings] = useState(false);
  const { act } = useStore();

  const open = (content: BlockContent) => {
    if (content.type === "meeting") setOpened(content.meeting);
    else setViewing(content.task);
  };

  const connection = useCalendar(anchor);
  const productive = useProductive(anchor);
  // Bookings only count while Productive is actually syncing; a dropped
  // connection hides them rather than letting them go stale.
  const bookingsSynced = !productive.available || productive.phase !== "disconnected";
  // Rebuilt on every pointermove otherwise — five days of blocks, re-sorted.
  const model = useMemo(
    () =>
      buildCalendar(
        snapshot,
        { meetings: connection.meetings, bookings: productive.bookings, bookingsSynced },
        clock,
        view,
        anchor,
      ),
    [snapshot, connection.meetings, productive.bookings, bookingsSynced, clock, view, anchor],
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
  const sheetOpen =
    opened !== null ||
    viewing !== null ||
    editing !== null ||
    booking !== null ||
    total ||
    connecting ||
    settings ||
    connectingProductive ||
    productiveSettings;
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
      <header className="flex items-end gap-5">
        <div className="flex flex-1 flex-col gap-3">
          <span className="label text-muted">{model.rangeLabel}</span>
          <p className="m-0 text-[22px] leading-[1.5] tracking-[-.01em] text-text text-pretty">
            {model.summary.warning
              ? model.summary.text.slice(0, -model.summary.warning.length)
              : model.summary.text}
            {model.summary.warning && (
              <span className="text-amber">{model.summary.warning}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-[18px] pb-1">
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
          {showsStrip(model.capacity) && (
            <>
              <span className="fact pt-3 pr-1.5 text-right text-[11px] text-faint">day</span>
              <CapacityStrip
                capacity={model.capacity}
                onOpenBooking={setBooking}
                onOpenTotal={() => setTotal(true)}
                onOpenBlock={open}
              />
            </>
          )}
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
              onEdit={setViewing}
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
          onEditTask={setViewing}
          onOpenDay={openDay}
          drag={drag}
        />
      )}

      {model.view === "month" && <MonthView weeks={model.weeks} onOpenDay={openDay} />}

      <footer className="flex flex-col gap-2 border-t border-hairline pt-4">
        <div className="flex items-center gap-2.5">
          <span className="label w-[112px] text-[10px] tracking-[.14em] text-faint">
            Google Calendar
          </span>
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
                {(() => {
                  const status = phaseLabel(connection.phase, connection.lastSync, clock, "Google");
                  return status ? ` · ${status}` : "";
                })()}
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
        </div>
        <div className="flex items-center gap-2.5">
          <span className="label w-[112px] text-[10px] tracking-[.14em] text-faint">
            Productive
          </span>
          {!productive.available ? (
            <span className="fact text-[11px] text-faint">demo data at localhost</span>
          ) : productive.phase === "disconnected" ? (
            productive.wasConnected ? (
              <>
                <span className="fact text-[11px] text-amber">
                  Disconnected · bookings hidden since{" "}
                  {sinceLabel(productive.lastSync as Instant, clock)}
                </span>
                <button
                  type="button"
                  onClick={() => setConnectingProductive(true)}
                  className="fact text-[11px] text-green transition-colors hover:text-green-hover"
                >
                  Reconnect
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConnectingProductive(true)}
                className="fact text-[11px] text-green transition-colors hover:text-green-hover"
              >
                connect…
              </button>
            )
          ) : (
            <>
              <span className="fact text-[11px] text-muted">
                {productive.orgName ?? "connected"}
                {(() => {
                  const status = phaseLabel(
                    productive.phase,
                    productive.lastSync,
                    clock,
                    "Productive",
                  );
                  return status ? ` · ${status}` : "";
                })()}
              </span>
              <button
                type="button"
                onClick={() => setProductiveSettings(true)}
                className="fact text-[11px] text-faint transition-colors hover:text-text"
              >
                settings
              </button>
            </>
          )}
        </div>
      </footer>

      {opened && <MeetingDetail meeting={opened} onClose={() => setOpened(null)} />}
      {viewing && (
        <TaskDetail
          task={viewing}
          onEdit={() => {
            setEditing(viewing);
            setViewing(null);
          }}
          onClose={() => setViewing(null)}
        />
      )}
      {editing && <TaskEditor task={editing} onClose={() => setEditing(null)} />}
      {booking && (
        <BookingDetail booking={booking} day={anchor} onClose={() => setBooking(null)} />
      )}
      {total && model.view === "day" && (
        <DayTotalDetail
          capacity={model.capacity}
          day={anchor}
          onOpenBooking={setBooking}
          onOpenBlock={open}
          onClose={() => setTotal(false)}
        />
      )}
      {connectingProductive && (
        <ConnectProductiveSheet
          connection={productive}
          onClose={() => setConnectingProductive(false)}
        />
      )}
      {productiveSettings && (
        <ProductiveSettingsSheet
          connection={productive}
          onClose={() => setProductiveSettings(false)}
        />
      )}
      {connecting && <ConnectSheet connection={connection} onClose={() => setConnecting(false)} />}
      {settings && (
        <CalendarSettingsSheet connection={connection} onClose={() => setSettings(false)} />
      )}
    </div>
  );
}
