import type { Block, BlockContent } from "../../domain/calendar";
import type { Day } from "../../lib/time";
import type { BlockDrag } from "./useBlockDrag";

/* The hour grid: a gutter of times and one absolutely-positioned column per
   day. Everything scales off pxPerHour — 64 in the day view, 52 in the week. */

export const DAY_PX_PER_HOUR = 64;
export const WEEK_PX_PER_HOUR = 52;

export function HourGutter({
  startHour,
  endHour,
  pxPerHour,
}: {
  startHour: number;
  endHour: number;
  pxPerHour: number;
}) {
  const hours = [];
  for (let hour = startHour; hour < endHour; hour++) hours.push(hour);
  return (
    <div className="flex flex-col">
      {hours.map((hour) => (
        <span
          key={hour}
          style={{ height: pxPerHour }}
          className="fact block pt-2 pr-1.5 text-right text-[11px] text-faint"
        >
          {pxPerHour >= 60
            ? `${String(hour).padStart(2, "0")}:00`
            : String(hour).padStart(2, "0")}
        </span>
      ))}
    </div>
  );
}

const ACCENT: Record<string, string> = {
  meeting: "border-l-sleeping",
  task: "border-l-green",
  checkin: "border-l-amber",
  late: "border-l-red",
};

function accentOf(content: BlockContent): string {
  if (content.type === "meeting") return ACCENT.meeting;
  if (content.task.late) return ACCENT.late;
  return ACCENT[content.task.kind === "checkin" ? "checkin" : "task"];
}

export function titleOf(content: BlockContent): string {
  return content.type === "meeting" ? content.meeting.title : content.task.item.title;
}

function blockMeta(content: BlockContent, timeLabel: string): string {
  if (content.type === "meeting") {
    const meeting = content.meeting;
    const parts = [timeLabel];
    if (meeting.meetUrl) parts.push("Meet");
    else if (meeting.location) parts.push(meeting.location);
    const names = meeting.attendees
      .filter((a) => !a.self)
      .map((a) => (a.name ?? a.email).split(" ")[0])
      .slice(0, 3);
    if (names.length > 0) parts.push(names.join(", "));
    return parts.join(" · ");
  }
  return `${timeLabel} · ${content.task.where}`;
}

/**
 * One day's slice of the grid. Blocks are placed by the minute; overlapping
 * ones split the width by the lanes the layout gave them.
 */
export function DayColumn({
  blocks,
  day,
  startHour,
  endHour,
  pxPerHour,
  nowMinutes,
  compact,
  onOpen,
  drag,
}: {
  blocks: Block[];
  day: Day;
  startHour: number;
  endHour: number;
  pxPerHour: number;
  nowMinutes: number | null;
  /** The week view: smaller type, meta only when the block is tall enough. */
  compact?: boolean;
  onOpen: (content: BlockContent) => void;
  /** Absent means the grid is read-only. */
  drag?: BlockDrag;
}) {
  const top = (minutes: number) => ((minutes - startHour * 60) / 60) * pxPerHour;
  const hours = [];
  for (let hour = startHour; hour < endHour; hour++) hours.push(hour);

  // A dragged block leaves its own column and reappears wherever the pointer
  // is, so it is dropped from the list by key and re-added from the preview.
  const preview = drag?.preview;
  const rendered = blocks.filter((block) => block.key !== preview?.key);
  if (preview && preview.day === day) {
    rendered.push({
      ...preview.block,
      startMinutes: preview.startMinutes,
      endMinutes: preview.endMinutes,
      // Only once it has actually lifted: widening under a plain click reads
      // as a glitch, and a lane index means nothing in another day's cluster.
      ...(preview.lifted ? { lane: 0, lanes: 1 } : null),
    });
  }

  return (
    <div
      data-calendar-day={day}
      className="relative"
      style={{ height: (endHour - startHour) * pxPerHour }}
    >
      {hours.map((hour) => (
        <div
          key={hour}
          className="absolute right-0 left-0 border-b border-hairline"
          style={{ top: top((hour + 1) * 60) - 1, height: 1 }}
        />
      ))}

      {rendered.map((block) => {
        const height = Math.max(
          compact ? 20 : 24,
          ((block.endMinutes - block.startMinutes) / 60) * pxPerHour - 4,
        );
        const tall = height >= (compact ? 44 : 40);
        const task = block.content.type === "task";
        const dragging = preview?.key === block.key && preview.lifted;
        return (
          <button
            key={block.key}
            type="button"
            onClick={task && drag ? undefined : () => onOpen(block.content)}
            onPointerDown={
              task && drag ? (e) => drag.begin(e, block, day, "move") : undefined
            }
            style={{
              top: top(block.startMinutes) + 2,
              height,
              left: `${(block.lane / block.lanes) * 100}%`,
              width: `calc(${100 / block.lanes}% - ${block.lane + 1 < block.lanes ? 4 : 0}px)`,
              // Not a Tailwind class: styles.css sets `cursor: pointer` on
              // every button outside a cascade layer, which would win.
              cursor: task && drag ? (dragging ? "grabbing" : "grab") : "pointer",
              touchAction: task && drag ? "none" : undefined,
            }}
            className={`absolute flex flex-col justify-center gap-0.5 overflow-hidden rounded-r-lg border-l-2 bg-[#171b1a] text-left transition-colors hover:bg-[#1c211f] ${
              dragging
                ? "pointer-events-none z-[3] shadow-[0_10px_30px_rgba(0,0,0,.5)]"
                : "z-[1]"
            } ${compact ? "px-2.5" : "px-4"} ${accentOf(block.content)}`}
          >
            <span
              className={`block truncate text-text ${compact ? "text-[13px]" : "text-[15px]"}`}
            >
              {titleOf(block.content)}
            </span>
            {tall && (
              <span className="fact block truncate text-[10px] text-faint">
                {blockMeta(block.content, block.timeLabel)}
              </span>
            )}
            {task && drag && (
              <span
                aria-hidden="true"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  drag.begin(e, block, day, "resize");
                }}
                style={{ cursor: "ns-resize", touchAction: "none" }}
                className="absolute inset-x-0 bottom-0 h-1.5"
              />
            )}
          </button>
        );
      })}

      {nowMinutes !== null && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60 && (
        <div
          className="pointer-events-none absolute right-0 left-0 z-[2]"
          style={{ top: top(nowMinutes) }}
        >
          <div className="h-px bg-green" />
          <span className="absolute -top-[3px] -left-[7px] h-[7px] w-[7px] rounded-full bg-green" />
        </div>
      )}
    </div>
  );
}
