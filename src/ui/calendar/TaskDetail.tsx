import { DEFAULT_TASK_MINUTES, type TaskEntry } from "../../domain/calendar";
import { niceDay } from "../../domain/today";
import { Linkified } from "../notes";
import { useEscape } from "./MeetingDetail";

/* A task, read first. Clicking a block opens this sheet; the pencil is the
   one door into the editor, so a stray click never lands in a form. */

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
  useEscape(onClose);
  const notes = task.item.notes?.trim();
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
            {task.kind === "checkin" ? "Check-in" : "Task"}
            {task.late ? " · overdue" : ""}
          </span>
          <span className="fact text-[11px] text-faint">{task.where}</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[19px] leading-[1.35] text-text">{task.item.title}</span>
          <span className="fact text-[12px] text-muted">{whenLabel(task)}</span>
        </div>

        {notes && (
          <p className="m-0 max-h-44 overflow-y-auto text-[13px] leading-[1.55] whitespace-pre-wrap text-soft">
            <Linkified text={notes} />
          </p>
        )}

        <div className="flex items-center gap-4 pt-1">
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
          <span className="fact text-[11px] text-faint">esc dismiss</span>
        </div>
      </div>
    </div>
  );
}
