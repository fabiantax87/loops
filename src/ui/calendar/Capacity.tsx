import type { Block, BlockContent, DayCapacity } from "../../domain/calendar";
import { dayLabel } from "../../domain/calendar";
import {
  type Booking,
  type CapacityLine,
  DAY_CAPACITY_MINUTES,
  bookingLabel,
  hoursLabel,
  totalLabel,
} from "../../domain/capacity";
import { Linkified, openExternal } from "../notes";
import { useEscape } from "./MeetingDetail";

/* The capacity strip: the committed day as one bar. Bookings hatch, meetings
   fill grey, timed tasks fill green, and the bar clips at eight hours — only
   the label and the summary line say when the day runs over. */

const FILL: Record<CapacityLine["kind"], string> = {
  booking: "hatch",
  meeting: "bg-sleeping",
  task: "bg-[#2f7a5e]",
};

function pct(minutes: number): string {
  return `${(minutes / DAY_CAPACITY_MINUTES) * 100}%`;
}

/** The bar itself, shared by the day strip and the week header. */
export function CapacityBar({
  capacity,
  height,
  onSegment,
}: {
  capacity: DayCapacity;
  height: number;
  onSegment?: (line: CapacityLine) => void;
}) {
  return (
    <div className="relative flex-1" style={{ height }}>
      <div
        className="absolute inset-0 flex gap-0.5 overflow-hidden bg-hairline"
        style={{ borderRadius: height >= 10 ? 3 : 2 }}
      >
        {capacity.lines.map((line, index) => {
          const key = line.kind === "booking" ? line.booking.id : line.block.key;
          const clickable = onSegment !== undefined;
          return (
            <span
              key={`${key}-${index}`}
              role={clickable ? "button" : undefined}
              onClick={clickable ? () => onSegment(line) : undefined}
              className={`flex-none ${FILL[line.kind]} ${clickable ? "cursor-pointer" : ""}`}
              style={{ width: pct(line.minutes) }}
            />
          );
        })}
        {capacity.bookingsUnavailable && capacity.totalMinutes < DAY_CAPACITY_MINUTES && (
          <span className="flex-1 rounded-r-[3px] border border-dashed border-[#4a524e]" />
        )}
      </div>
    </div>
  );
}

function Swatch({ kind }: { kind: CapacityLine["kind"] | "unsynced" }) {
  if (kind === "unsynced") {
    return (
      <span className="h-2 w-3.5 flex-none rounded-[2px] border border-dashed border-sleeping" />
    );
  }
  return <span className={`h-2 w-3.5 flex-none rounded-[2px] ${FILL[kind]}`} />;
}

/** The day view's strip with its legend. */
export function CapacityStrip({
  capacity,
  onOpenBooking,
  onOpenTotal,
  onOpenBlock,
}: {
  capacity: DayCapacity;
  onOpenBooking: (booking: Booking) => void;
  onOpenTotal: () => void;
  onOpenBlock: (content: BlockContent) => void;
}) {
  const over = capacity.overMinutes > 0;
  const onSegment = (line: CapacityLine) => {
    if (line.kind === "booking") onOpenBooking(line.booking);
    else onOpenBlock(line.block.content);
  };
  return (
    <div className="flex flex-col gap-2.5 pt-2.5 pb-6">
      <div className="flex items-center gap-4">
        <CapacityBar capacity={capacity} height={10} onSegment={onSegment} />
        <button
          type="button"
          onClick={onOpenTotal}
          className={`fact whitespace-nowrap underline decoration-dotted decoration-[#4a524e] underline-offset-4 transition-colors hover:text-text ${
            over ? "font-semibold text-amber" : "text-soft"
          }`}
        >
          {totalLabel(capacity)}
        </button>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {capacity.bookings.map((booking) => (
          <button
            key={booking.id}
            type="button"
            onClick={() => onOpenBooking(booking)}
            className="flex items-center gap-2 text-[13px] text-soft transition-colors hover:text-text"
          >
            <Swatch kind="booking" />
            {bookingLabel(booking)}
            <span className="fact text-[11px] text-muted">{hoursLabel(booking.minutesPerDay)}</span>
          </button>
        ))}
        {capacity.meetingMinutes > 0 && (
          <span className="flex items-center gap-2 text-[13px] text-soft">
            <Swatch kind="meeting" />
            Meetings
            <span className="fact text-[11px] text-muted">{hoursLabel(capacity.meetingMinutes)}</span>
          </span>
        )}
        {capacity.taskMinutes > 0 && (
          <span className="flex items-center gap-2 text-[13px] text-soft">
            <Swatch kind="task" />
            Timed tasks
            <span className="fact text-[11px] text-muted">{hoursLabel(capacity.taskMinutes)}</span>
          </span>
        )}
        {capacity.bookingsUnavailable && (
          <span className="flex items-center gap-2 text-[13px] text-muted">
            <Swatch kind="unsynced" />
            Bookings not synced, not counted
          </span>
        )}
      </div>
    </div>
  );
}

/** The week header's smaller strip: the bar, the total, the projects. */
export function WeekCapacity({ capacity }: { capacity: DayCapacity }) {
  if (capacity.totalMinutes === 0) return null;
  const over = capacity.overMinutes > 0;
  return (
    <>
      <div className="mt-2 flex items-center gap-2">
        <CapacityBar capacity={capacity} height={6} />
        <span className={`fact text-[10px] ${over ? "text-amber" : "text-muted"}`}>
          {hoursLabel(capacity.totalMinutes)}
        </span>
      </div>
      {capacity.bookings.length > 0 && (
        <div className="mt-1 flex flex-col gap-px">
          {capacity.bookings.map((booking) => (
            <span key={booking.id} className="truncate text-[12px] text-muted">
              {booking.project}{" "}
              <span className="fact text-[10px]">{hoursLabel(booking.minutesPerDay)}</span>
            </span>
          ))}
        </div>
      )}
    </>
  );
}

/* ---- Sheets --------------------------------------------------------------- */

function Sheet({
  width,
  onClose,
  children,
}: {
  width: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEscape(onClose);
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/70 pt-[18vh]"
      onMouseDown={onClose}
    >
      <div
        style={{ width }}
        className="flex flex-col gap-4 rounded-xl border border-[#313734] bg-hover p-6 shadow-[0_22px_55px_rgba(0,0,0,.55)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

/** A booking, read only. Productive owns it; the one door leads there. */
export function BookingDetail({
  booking,
  day,
  onClose,
}: {
  booking: Booking;
  day: string;
  onClose: () => void;
}) {
  const span =
    booking.startDay === booking.endDay
      ? dayLabel(day)
      : `${dayLabel(day)} · ${niceDay(booking.startDay)} – ${niceDay(booking.endDay)}`;
  return (
    <Sheet width={440} onClose={onClose}>
      <div className="flex flex-col gap-1">
        <span className="label text-faint">
          Productive booking{booking.draft ? " · draft" : ""}
        </span>
        <span className="text-[19px] leading-[1.35] text-text">{booking.project}</span>
        {booking.client && <span className="text-[14px] text-muted">{booking.client}</span>}
      </div>
      <div className="grid grid-cols-[64px_1fr] gap-x-3.5 gap-y-2.5">
        <span className="fact pt-0.5 text-[11px] text-faint">when</span>
        <span className="text-[14px] leading-[1.5] text-soft">{span}</span>
        <span className="fact pt-0.5 text-[11px] text-faint">hours</span>
        <span className="text-[14px] leading-[1.5] text-soft">
          {hoursLabel(booking.minutesPerDay)} · no set time
        </span>
        {booking.note && (
          <>
            <span className="fact pt-0.5 text-[11px] text-faint">note</span>
            <span className="text-[14px] leading-[1.5] whitespace-pre-wrap text-soft">
              <Linkified text={booking.note} />
            </span>
          </>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-frame pt-3.5">
        {booking.url ? (
          <button
            type="button"
            onClick={() => openExternal(booking.url as string)}
            className="text-[14px] text-green transition-colors hover:text-green-hover"
          >
            Open in Productive ↗
          </button>
        ) : (
          <span />
        )}
        <span className="fact text-[11px] text-faint">read-only</span>
      </div>
    </Sheet>
  );
}

function niceDay(day: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(
    new Date(`${day}T00:00:00`),
  );
}

function lineTitle(line: CapacityLine): string {
  if (line.kind === "booking") return bookingLabel(line.booking);
  const content = line.block.content;
  return content.type === "meeting" ? content.meeting.title : content.task.item.title;
}

function lineMeta(line: CapacityLine): string {
  if (line.kind === "booking") return "Productive · no set time";
  return (line.block as Block).timeLabel;
}

/** Everything the total is made of, so a move can be decided on. */
export function DayTotalDetail({
  capacity,
  day,
  onOpenBooking,
  onOpenBlock,
  onClose,
}: {
  capacity: DayCapacity;
  day: string;
  onOpenBooking: (booking: Booking) => void;
  onOpenBlock: (content: BlockContent) => void;
  onClose: () => void;
}) {
  const over = capacity.overMinutes > 0;
  const spare = DAY_CAPACITY_MINUTES - capacity.totalMinutes;
  const open = (line: CapacityLine) => {
    onClose();
    if (line.kind === "booking") onOpenBooking(line.booking);
    else onOpenBlock(line.block.content);
  };
  return (
    <Sheet width={500} onClose={onClose}>
      <div className="flex flex-col gap-1">
        <span className="label text-faint">Day total</span>
        <span className="text-[19px] leading-[1.35] text-text">
          {hoursLabel(capacity.totalMinutes)} of {DAY_CAPACITY_MINUTES / 60}
        </span>
        <span className="text-[14px] text-muted">
          {over ? (
            <span className="text-amber">{hoursLabel(capacity.overMinutes)} over</span>
          ) : spare > 0 ? (
            <span>{hoursLabel(spare)} to spare</span>
          ) : (
            <span>exactly full</span>
          )}{" "}
          · {dayLabel(day)}
        </span>
      </div>
      <div className="grid grid-cols-[86px_1fr_auto] items-start gap-x-3.5 gap-y-3">
        {capacity.lines.map((line, index) => (
          <button
            key={index}
            type="button"
            onClick={() => open(line)}
            className="contents text-left"
          >
            <span className="fact flex items-center gap-2 text-[11px] text-faint">
              <Swatch kind={line.kind} />
              {line.kind}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[14px] text-text">{lineTitle(line)}</span>
              <span className="fact text-[11px] text-faint">{lineMeta(line)}</span>
            </span>
            <span className="fact text-right text-[12px] text-soft">{hoursLabel(line.minutes)}</span>
          </button>
        ))}
        <span className="fact text-[11px] text-faint">total</span>
        <span className="text-[14px] text-muted">of an {DAY_CAPACITY_MINUTES / 60}h day</span>
        <span className={`fact text-right text-[12px] ${over ? "text-amber" : "text-text"}`}>
          {hoursLabel(capacity.totalMinutes)}
        </span>
      </div>
      {capacity.bookingsUnavailable && (
        <span className="fact text-[11px] text-muted">
          Productive isn't syncing, so bookings are not in this total.
        </span>
      )}
      <span className="fact text-[11px] text-faint">
        Tasks in the all-day shelf have no time and aren't counted.
      </span>
    </Sheet>
  );
}
