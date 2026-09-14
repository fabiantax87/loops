import { useState } from "react";
import { items } from "../../db/repo";
import {
  type BlockContent,
  type DayEntries,
  type Meeting,
  type TaskEntry,
  pillLabel,
  weekPill,
} from "../../domain/calendar";
import { useStore } from "../../state/store";
import { CheckCircle } from "../rows";

/* The day: an "all day" shelf where dateless-but-due work gathers, then the
   hour grid. Tasks with no time group into one pill, exactly the way Google
   Calendar folds its all-day rows. */

function AllDayMeetingRow({
  meeting,
  onOpen,
}: {
  meeting: Meeting;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3.5 rounded-[9px] border border-frame bg-[#161918] px-4 py-3 text-left transition-colors hover:bg-[#1b1f1d]"
    >
      <span className="h-1.5 w-1.5 flex-none rounded-full bg-sleeping" />
      <span className="flex-1 truncate text-[15px] text-text">{meeting.title}</span>
      <span className="fact text-[11px] text-faint">all day</span>
    </button>
  );
}

function TaskLine({ task }: { task: TaskEntry }) {
  const { act } = useStore();
  const done = () =>
    act((db, c) =>
      items.close(db, c, task.item.id, task.kind === "checkin" ? "replied" : "done"),
    );
  return (
    <div className="flex items-center gap-3.5 border-t border-hairline py-2.5">
      <CheckCircle onClick={done} />
      <span className={`flex-1 truncate text-[15px] ${task.late ? "text-[#f0d9d3]" : "text-text"}`}>
        {task.item.title}
      </span>
      {task.late && <span className="fact text-[11px] text-red">late</span>}
      {task.kind === "checkin" && (
        <span className="fact text-[11px] text-amber">check-in</span>
      )}
      <span className="fact truncate text-[11px] text-faint">{task.where}</span>
    </div>
  );
}

/**
 * The pill and what it unfolds into. Opens itself when everything it holds is
 * on time and few; stays closed when it is just a count to acknowledge.
 */
export function TaskShelf({
  entries,
  dueToday,
  onEdit,
}: {
  entries: DayEntries;
  dueToday: boolean;
  onEdit: (task: TaskEntry) => void;
}) {
  const [open, setOpen] = useState(false);
  const pill = weekPill(entries);
  if (!pill) return null;
  const late = pill.lateCount > 0;

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-3.5 rounded-[9px] border px-4 py-3 text-left transition-colors ${
          late
            ? "border-[#40251f] bg-[#1a1210] hover:bg-[#201613]"
            : "border-frame bg-[#161918] hover:bg-[#1b1f1d]"
        }`}
      >
        <span className={`h-1.5 w-1.5 flex-none rounded-full ${late ? "bg-red" : "bg-green"}`} />
        <span className={`flex-1 text-[15px] ${late ? "text-[#f0d9d3]" : "text-text"}`}>
          {pill.kind === "single" ? pill.title : pillLabel(pill, { dueToday })}
        </span>
        <span className="flex h-4 w-4 items-center justify-center text-sm leading-none text-faint">
          {open ? "⌃" : "⌄"}
        </span>
      </button>
      {open && (
        <div className="flex flex-col pl-[30px]">
          {entries.untimedTasks.map((task) => (
            <div
              key={task.item.id}
              className="group flex items-stretch"
              onDoubleClick={() => onEdit(task)}
            >
              <div className="flex-1">
                <TaskLine task={task} />
              </div>
              <button
                type="button"
                onClick={() => onEdit(task)}
                className="fact self-center pl-3 text-[11px] text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-text"
              >
                edit
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AllDayShelf({
  entries,
  dueToday,
  onOpenMeeting,
  onEdit,
}: {
  entries: DayEntries;
  dueToday: boolean;
  onOpenMeeting: (content: BlockContent) => void;
  onEdit: (task: TaskEntry) => void;
}) {
  if (entries.allDayMeetings.length === 0 && entries.untimedTasks.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 border-b border-hairline pb-5">
      {entries.allDayMeetings.map((meeting) => (
        <AllDayMeetingRow
          key={`${meeting.calendarId}-${meeting.id}`}
          meeting={meeting}
          onOpen={() => onOpenMeeting({ type: "meeting", meeting })}
        />
      ))}
      <TaskShelf entries={entries} dueToday={dueToday} onEdit={onEdit} />
    </div>
  );
}
