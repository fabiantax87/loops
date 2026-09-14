import { useEffect } from "react";
import type { Meeting } from "../../domain/calendar";
import { dayStart } from "../../lib/time";
import { Linkified, openExternal } from "../notes";

/** Sheets without an input never hold focus, so Escape listens document-wide. */
export function useEscape(onClose: () => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
}

/* A meeting, read only. Google owns this data; the app shows it whole and
   offers exactly two doors — the call, and the event in Google Calendar. */

function timeSpan(meeting: Meeting): string {
  if (meeting.allDay) {
    const format = (day: string) =>
      new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(
        dayStart(day),
      );
    const lastDay = meeting.endDay
      ? new Date(dayStart(meeting.endDay).getTime() - 86_400_000)
      : null;
    const last = lastDay
      ? new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(lastDay)
      : null;
    const first = format(meeting.startDay as string);
    return last && last !== first ? `${first} – ${last} · all day` : `${first} · all day`;
  }
  const start = new Date(meeting.start as string);
  const end = new Date(meeting.end as string);
  const day = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(start);
  const hhmm = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${day} · ${hhmm(start)} – ${hhmm(end)}`;
}

const RESPONSE_GLYPH: Record<string, { glyph: string; tone: string }> = {
  accepted: { glyph: "✓", tone: "text-green" },
  declined: { glyph: "✕", tone: "text-red" },
  tentative: { glyph: "?", tone: "text-amber" },
  needsAction: { glyph: "·", tone: "text-faint" },
};

export function MeetingDetail({
  meeting,
  onClose,
}: {
  meeting: Meeting;
  onClose: () => void;
}) {
  const others = meeting.attendees.filter((a) => !a.self);
  useEscape(onClose);
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/70 pt-[18vh]"
      onMouseDown={onClose}
    >
      <div
        className="flex w-[560px] flex-col gap-4 rounded-xl border border-[#313734] bg-hover p-6 shadow-[0_22px_55px_rgba(0,0,0,.55)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className="label text-faint">Meeting · Google Calendar</span>

        <div className="flex flex-col gap-1.5">
          <span className="text-[19px] leading-[1.35] text-text">{meeting.title}</span>
          <span className="fact text-[12px] text-muted">{timeSpan(meeting)}</span>
          {meeting.location && (
            <span className="fact text-[12px] text-faint">{meeting.location}</span>
          )}
        </div>

        {others.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="label text-[10px] tracking-[.12em] text-faint">With</span>
            {others.map((attendee) => {
              const response = RESPONSE_GLYPH[attendee.response ?? "needsAction"] ??
                RESPONSE_GLYPH.needsAction;
              return (
                <div key={attendee.email} className="flex items-center gap-2.5">
                  <span className={`fact w-3 text-[12px] ${response.tone}`}>{response.glyph}</span>
                  <span className="text-[14px] text-soft">
                    {attendee.name ?? attendee.email}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {meeting.description && (
          <p className="m-0 max-h-44 overflow-y-auto text-[13px] leading-[1.55] whitespace-pre-wrap text-soft">
            <Linkified text={meeting.description.replace(/<[^>]+>/g, "")} />
          </p>
        )}

        {(meeting.meetUrl || meeting.htmlLink) && (
          <div className="flex items-center gap-3 pt-1">
            {meeting.meetUrl && (
              <button
                type="button"
                onClick={() => openExternal(meeting.meetUrl as string)}
                className="rounded-lg bg-green px-4 py-2 text-sm text-ink transition-colors hover:bg-green-hover"
              >
                Join the call
              </button>
            )}
            {meeting.htmlLink && (
              <button
                type="button"
                onClick={() => openExternal(meeting.htmlLink as string)}
                className="rounded-[7px] border border-outline px-[13px] py-1.5 text-[13px] text-soft transition-colors hover:border-outline-hover hover:text-text"
              >
                Open in Google Calendar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
