import type { BlockContent, TaskEntry, WeekDayModel } from "../../domain/calendar";
import { pillLabel } from "../../domain/calendar";
import { dayStart } from "../../lib/time";
import { DayColumn, HourGutter, WEEK_PX_PER_HOUR as PX_PER_HOUR } from "./HourGrid";
import type { BlockDrag } from "./useBlockDrag";

/* The work week: five columns, a tasks lane on top, the hour grid below. */

function DayHeader({ model }: { model: WeekDayModel }) {
  const date = dayStart(model.day);
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(date);
  return (
    <div className="flex flex-col gap-0.5 pb-3">
      <span
        className={`label text-[10px] tracking-[.12em] ${
          model.isToday ? "text-green" : "text-faint"
        }`}
      >
        {weekday}
      </span>
      <span className={`text-[20px] ${model.isToday ? "text-text" : "text-muted"}`}>
        {date.getDate()}
      </span>
    </div>
  );
}

function TasksLaneCell({
  model,
  onEdit,
  onOpen,
}: {
  model: WeekDayModel;
  onEdit: (task: TaskEntry) => void;
  onOpen: (content: BlockContent) => void;
}) {
  const pill = model.pill;
  return (
    <div className="flex min-h-[44px] flex-col gap-1 border-b border-hairline pb-3.5">
      {model.entries.allDayMeetings.map((meeting) => (
        <button
          key={`${meeting.calendarId}-${meeting.id}`}
          type="button"
          onClick={() => onOpen({ type: "meeting", meeting })}
          className="flex w-full items-center gap-2 rounded-[7px] border border-frame bg-[#161918] px-2.5 py-2 text-left transition-colors hover:bg-[#1b1f1d]"
        >
          <span className="h-[5px] w-[5px] flex-none rounded-full bg-sleeping" />
          <span className="truncate text-[13px] text-text">{meeting.title}</span>
        </button>
      ))}
      {pill && (
        <button
          type="button"
          onClick={() => {
            // A single task edits directly; a group belongs to its day view.
            if (pill.kind === "single") onEdit(model.entries.untimedTasks[0]);
          }}
          className={`flex w-full items-center gap-2 rounded-[7px] border px-2.5 py-2 text-left transition-colors ${
            pill.lateCount > 0
              ? "border-[#40251f] bg-[#1a1210] hover:bg-[#201613]"
              : "border-frame bg-[#161918] hover:bg-[#1b1f1d]"
          }`}
        >
          <span
            className={`h-[5px] w-[5px] flex-none rounded-full ${
              pill.lateCount > 0 ? "bg-red" : "bg-green"
            }`}
          />
          <span
            className={`truncate text-[13px] ${
              pill.lateCount > 0 ? "text-[#f0d9d3]" : "text-text"
            }`}
          >
            {pill.kind === "single" ? pill.title : pillLabel(pill)}
          </span>
        </button>
      )}
    </div>
  );
}

export function WeekView({
  days,
  startHour,
  endHour,
  onOpen,
  onEditTask,
  onOpenDay,
  drag,
}: {
  days: WeekDayModel[];
  startHour: number;
  endHour: number;
  onOpen: (content: BlockContent) => void;
  onEditTask: (task: TaskEntry) => void;
  onOpenDay: (day: string) => void;
  drag: BlockDrag;
}) {
  return (
    <div className="grid grid-cols-[52px_repeat(5,1fr)] gap-x-2">
      <span />
      {days.map((model) => (
        <button
          key={model.day}
          type="button"
          onClick={() => onOpenDay(model.day)}
          className="text-left"
        >
          <DayHeader model={model} />
        </button>
      ))}

      <span className="fact pt-2 pr-1.5 text-right text-[10px] text-faint">tasks</span>
      {days.map((model) => (
        <TasksLaneCell key={model.day} model={model} onEdit={onEditTask} onOpen={onOpen} />
      ))}

      <HourGutter startHour={startHour} endHour={endHour} pxPerHour={PX_PER_HOUR} />
      {days.map((model) => (
        <DayColumn
          key={model.day}
          blocks={model.entries.blocks}
          day={model.day}
          drag={drag}
          startHour={startHour}
          endHour={endHour}
          pxPerHour={PX_PER_HOUR}
          nowMinutes={model.nowMinutes}
          compact
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}
