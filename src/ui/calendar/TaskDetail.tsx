import { useState } from "react";
import { items } from "../../db/repo";
import { DEFAULT_TASK_MINUTES, type TaskEntry } from "../../domain/calendar";
import { niceDay } from "../../domain/today";
import { useStore } from "../../state/store";
import { Linkified } from "../notes";
import { InlineVerb } from "../primitives";
import { CheckCircle, ReschedulePopover, TheyRepliedPopover } from "../rows";
import { useEscape } from "./MeetingDetail";

/* A task, read first. Clicking a block opens this sheet; it carries the same
   verbs the Today rows do — done, reschedule, chase, they replied, drop — so a
   task can be finished from the calendar without walking back to Today. The
   pencil is the one door into the editor, so a stray click never lands in a
   form. */

function lengthLabel(minutes: number): string {
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  if (minutes > 60) return `${Number((minutes / 60).toFixed(2))} h`;
  return `${minutes} min`;
}

function whenLabel(task: TaskEntry): string {
  const item = task.item;
  const day = task.kind === "checkin" ? item.checkinOn : item.deadline;
  const time = task.kind === "checkin" ? item.checkinTime : item.deadlineTime;
  const parts: string[] = [];
  if (day) parts.push(niceDay(day));
  parts.push(time ?? "all day");
  parts.push(lengthLabel(item.durationMinutes ?? DEFAULT_TASK_MINUTES));
  return parts.join(" · ");
}

export function TaskDetail({
  task,
  onEdit,
  onClose,
}: {
  task: TaskEntry;
  onEdit: () => void;
  onClose: () => void;
}) {
  const { act } = useStore();
  const [rescheduling, setRescheduling] = useState(false);
  const [replied, setReplied] = useState(false);
  const popoverOpen = rescheduling || replied;

  // With a popover up, Escape closes that first; the popover's own listener
  // takes care of itself, this one only has to stay out of the way.
  useEscape(() => {
    if (!popoverOpen) onClose();
  });

  const item = task.item;
  const checkin = task.kind === "checkin";
  const notes = item.notes?.trim();

  /** A write from here is the end of the sheet: the task it showed has moved on. */
  const write = (fn: Parameters<typeof act>[0]) => void act(fn).then(onClose);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/70 pt-[18vh]"
      onMouseDown={onClose}
    >
      <div
        className="flex w-[560px] flex-col gap-4 rounded-xl border border-[#313734] bg-hover p-6 shadow-[0_22px_55px_rgba(0,0,0,.55)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline gap-3">
          <span className="label flex-1 text-faint">
            {checkin ? "Check-in" : "Task"}
            {task.late ? " · overdue" : ""}
          </span>
          <span className="fact text-[11px] text-faint">{task.where}</span>
        </div>

        <div className="flex items-start gap-3.5">
          <div className="pt-1">
            <CheckCircle
              onClick={() =>
                write((db, c) => items.close(db, c, item.id, checkin ? "replied" : "done"))
              }
            />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <span className="text-[19px] leading-[1.35] text-text">{item.title}</span>
            <span className="fact text-[12px] text-muted">{whenLabel(task)}</span>
          </div>
        </div>

        {notes && (
          <p className="m-0 max-h-44 overflow-y-auto text-[13px] leading-[1.55] whitespace-pre-wrap text-soft">
            <Linkified text={notes} />
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          {checkin ? (
            <>
              <InlineVerb onClick={() => write((db, c) => items.chase(db, c, item.id))}>
                Chase
              </InlineVerb>
              <div className="relative">
                <InlineVerb onClick={() => setReplied(true)}>They replied</InlineVerb>
                <TheyRepliedPopover
                  item={item}
                  open={replied}
                  onClose={() => setReplied(false)}
                  afterAct={onClose}
                />
              </div>
            </>
          ) : (
            <>
              <InlineVerb
                onClick={() => write((db, c) => items.close(db, c, item.id, "done"))}
              >
                Done
              </InlineVerb>
              <div className="relative">
                <InlineVerb onClick={() => setRescheduling(true)}>Reschedule</InlineVerb>
                <ReschedulePopover
                  item={item}
                  open={rescheduling}
                  onClose={() => setRescheduling(false)}
                  afterAct={onClose}
                />
              </div>
            </>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-2 rounded-[7px] border border-outline px-[13px] py-1.5 text-[13px] text-soft transition-colors hover:border-outline-hover hover:text-text"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
            Edit
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => write((db, c) => items.close(db, c, item.id, "dropped"))}
            className="rounded-[7px] px-[11px] py-1.5 text-[13px] text-sleeping transition-colors hover:bg-[#212624] hover:text-soft"
          >
            {checkin ? "Drop it — it won't come" : "Drop it"}
          </button>
          <span className="fact text-[11px] text-faint">esc</span>
        </div>
      </div>
    </div>
  );
}
