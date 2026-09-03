import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { items } from "../db/repo";
import { parseDate } from "../domain/capture";
import { niceDay, type TimeFact } from "../domain/today";
import type { Item } from "../domain/types";
import { useClock } from "../lib/ClockContext";
import { type Day, addDays, today } from "../lib/time";
import { useStore } from "../state/store";
import { Fact, InlineVerb, RowMenu, type MenuItem } from "./primitives";

/* The rows. Every kind of item renders as a sentence with its verbs beside it:
   a todo carries its check, a waiting-on carries Chase and They replied, an
   idea carries Do it today. The ⋯ holds only what is rare. */

/** The always-there done affordance — never in the menu. */
export function CheckCircle({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Done"
      onClick={onClick}
      className="flex h-5 w-5 flex-none items-center justify-center rounded-full border-[1.5px] border-green text-xs text-green transition-colors hover:bg-green hover:text-ink"
    >
      ✓
    </button>
  );
}

/**
 * A small anchored panel, opened by a row verb. Like the row menu, it flips
 * upward near the foot of the page rather than running off the screen.
 */
export function Popover({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [above, setAbove] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!panel.current?.parentElement?.contains(event.target as Node)) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open, onClose]);

  useLayoutEffect(() => {
    if (!open || !panel.current) return;
    const box = panel.current.getBoundingClientRect();
    setAbove(box.bottom > window.innerHeight - 12);
  }, [open]);

  if (!open) return null;
  return (
    <div
      ref={panel}
      className={`absolute right-0 z-30 w-[320px] rounded-[11px] border border-[#313734] bg-hover p-3.5 shadow-[0_20px_50px_rgba(0,0,0,.55)] ${
        above ? "bottom-full mb-1.5" : "top-full mt-1.5"
      }`}
    >
      {children}
    </div>
  );
}

function PopoverOption({
  label,
  hint,
  onClick,
  dim,
}: {
  label: string;
  hint?: string;
  onClick: () => void;
  dim?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[7px] px-3 py-[9px] text-left transition-colors hover:bg-[#212624]"
    >
      <span className={`flex-1 text-[15px] ${dim ? "text-soft" : "text-text"}`}>{label}</span>
      {hint && <span className="fact text-[11px] text-faint">{hint}</span>}
    </button>
  );
}

/**
 * A one-line day field: type "mon", "in 3 days" or "12 sep" and the resolved
 * day shows beside it; ⏎ takes it.
 */
export function DayField({
  autoFocus,
  onPick,
  placeholder = "mon · in 3 days · 12 sep",
}: {
  autoFocus?: boolean;
  onPick: (day: Day) => void;
  placeholder?: string;
}) {
  const clock = useClock();
  const [text, setText] = useState("");
  const guess = /^\d{4}-\d{2}-\d{2}$/.test(text.trim())
    ? { day: text.trim(), phrase: text.trim() }
    : parseDate(text, clock);

  return (
    <div className="flex items-center gap-2.5">
      <input
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && guess) {
            e.preventDefault();
            e.stopPropagation();
            onPick(guess.day);
          }
        }}
        placeholder={placeholder}
        className="w-40 rounded-md border border-outline bg-[#212624] px-3 py-1.5 text-[14px] text-text outline-none placeholder:text-faint focus:border-outline-hover"
      />
      {guess ? (
        <button
          type="button"
          onClick={() => onPick(guess.day)}
          className="fact text-[11px] text-green transition-colors hover:text-green-hover"
        >
          {niceDay(guess.day)} ⏎
        </button>
      ) : (
        text.trim() !== "" && <span className="fact text-[11px] text-faint">?</span>
      )}
    </div>
  );
}

/** The next Monday that isn't today. */
function nextMonday(now: Day): Day {
  const dow = new Date(`${now}T12:00:00`).getDay();
  return addDays(now, ((1 - dow + 7) % 7) || 7);
}

/**
 * The way out of critical — and the only place a todo's date changes. "It's
 * done" lives here too, so the popover answers the whole question the red row
 * asks.
 */
export function ReschedulePopover({
  item,
  open,
  onClose,
}: {
  item: Item;
  open: boolean;
  onClose: () => void;
}) {
  const clock = useClock();
  const { act } = useStore();
  const [picking, setPicking] = useState(false);
  const now = today(clock);

  useEffect(() => {
    if (!open) setPicking(false);
  }, [open]);

  const move = (day: Day) => {
    onClose();
    void act((db, c) => items.reschedule(db, c, item.id, day));
  };

  return (
    <Popover open={open} onClose={onClose}>
      <div className="flex flex-col gap-0.5">
        <PopoverOption label="Today" hint={niceDay(now).slice(4)} onClick={() => move(now)} />
        <PopoverOption
          label="Tomorrow"
          hint={niceDay(addDays(now, 1)).slice(4)}
          onClick={() => move(addDays(now, 1))}
        />
        <PopoverOption
          label="Monday"
          hint={niceDay(nextMonday(now)).slice(4)}
          onClick={() => move(nextMonday(now))}
        />
        {picking ? (
          <div className="px-3 py-2">
            <DayField autoFocus onPick={move} />
          </div>
        ) : (
          <PopoverOption label="Pick a date…" onClick={() => setPicking(true)} />
        )}
        <div className="my-1.5 h-px bg-[#242927]" />
        <PopoverOption
          label="It's done"
          hint="⏎"
          dim
          onClick={() => {
            onClose();
            void act((db, c) => items.close(db, c, item.id, "done"));
          }}
        />
        <PopoverOption
          label="Turn it into an idea"
          hint="drops the date"
          dim
          onClick={() => {
            onClose();
            void act((db, c) => items.demote(db, c, item.id));
          }}
        />
      </div>
    </Popover>
  );
}

/**
 * "They replied" is good news either way: the loop closes, or the move is
 * yours — and then it asks for the deadline a real todo requires.
 */
export function TheyRepliedPopover({
  item,
  open,
  onClose,
}: {
  item: Item;
  open: boolean;
  onClose: () => void;
}) {
  const { act } = useStore();
  const [myMove, setMyMove] = useState(false);

  useEffect(() => {
    if (!open) setMyMove(false);
  }, [open]);

  return (
    <Popover open={open} onClose={onClose}>
      {!myMove ? (
        <div className="flex flex-col gap-0.5">
          <span className="label px-3 pt-1 pb-2 text-[10px] tracking-[.12em] text-faint">
            What did they say?
          </span>
          <PopoverOption
            label="That settles it"
            hint="closes the waiting-on"
            onClick={() => {
              onClose();
              void act((db, c) => items.settled(db, c, item.id));
            }}
          />
          <PopoverOption
            label="Now it's my move"
            hint="becomes a todo"
            onClick={() => setMyMove(true)}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-1 py-1">
          <span className="label text-[10px] tracking-[.12em] text-faint">
            Deadline · required
          </span>
          <DayField
            autoFocus
            onPick={(day) => {
              onClose();
              void act((db, c) => items.myMove(db, c, item.id, day));
            }}
          />
          <span className="fact text-[11px] text-faint">⏎ make it a todo · esc keep waiting</span>
        </div>
      )}
    </Popover>
  );
}

/** A green pill saying where a promoted todo came from. */
export function PickedUpBadge({ today: isToday }: { today: boolean }) {
  return (
    <span className="fact rounded-[5px] border border-[#244f3f] px-[9px] py-[3px] text-[11px] whitespace-nowrap text-green">
      {isToday ? "picked up today" : "picked up"}
    </span>
  );
}

export function WasInProgressBadge() {
  return (
    <span className="fact rounded-[5px] border border-outline-hover px-[9px] py-[3px] text-[11px] whitespace-nowrap text-muted">
      was in progress
    </span>
  );
}

/* ---- Whole rows ------------------------------------------------------- */

interface RowShellProps {
  title: string;
  where: string;
  onOpen?: () => void;
  last?: boolean;
  children?: ReactNode;
  lead?: ReactNode;
}

function RowShell({ title, where, onOpen, last, lead, children }: RowShellProps) {
  return (
    <div
      className={`flex items-center gap-4 border-t border-hairline py-[17px] ${
        last ? "border-b" : ""
      }`}
    >
      {lead}
      <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
        <span
          onClick={onOpen}
          className={`text-[17px] leading-[1.4] text-text ${onOpen ? "cursor-pointer" : ""}`}
        >
          {title}
        </span>
        {where && <span className="fact truncate text-faint">{where}</span>}
      </div>
      {children}
    </div>
  );
}

/**
 * A todo before its deadline. The check is always there, never in the menu; a
 * promoted todo says where it came from and offers the way back down.
 */
export function TodoRow({
  item,
  where,
  fact,
  promoted,
  last,
  onOpen,
}: {
  item: Item;
  where: string;
  fact: TimeFact | null;
  promoted: boolean;
  last?: boolean;
  onOpen?: () => void;
}) {
  const { act } = useStore();
  const [rescheduling, setRescheduling] = useState(false);

  return (
    <RowShell
      title={item.title}
      where={where}
      last={last}
      onOpen={onOpen}
      lead={<CheckCircle onClick={() => act((db, c) => items.close(db, c, item.id, "done"))} />}
    >
      {promoted ? (
        <>
          <PickedUpBadge today={true} />
          <button
            type="button"
            onClick={() => act((db, c) => items.demote(db, c, item.id))}
            className="rounded-[7px] px-[11px] py-1.5 text-[13px] text-sleeping transition-colors hover:bg-hover hover:text-soft"
          >
            Back to an idea
          </button>
        </>
      ) : (
        fact && <Fact tone={fact.tone}>{fact.text}</Fact>
      )}
      <div className="relative">
        <RowMenu items={todoMenu(item, act, () => setRescheduling(true))} />
        <ReschedulePopover
          item={item}
          open={rescheduling}
          onClose={() => setRescheduling(false)}
        />
      </div>
    </RowShell>
  );
}

/** The critical card — a todo past its deadline, and the only red in the app. */
export function CriticalRow({
  item,
  where,
  fact,
}: {
  item: Item;
  where: string;
  fact: TimeFact;
}) {
  const { act } = useStore();
  const [rescheduling, setRescheduling] = useState(false);

  return (
    <div className="mb-1.5 flex items-center gap-[18px] rounded-[10px] border border-[#40251f] bg-[#1a1210] px-[22px] py-[19px]">
      <span className="w-[3px] flex-none self-stretch rounded-sm bg-red" />
      <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
        <span className="text-lg leading-[1.4] text-[#f0d9d3]">{item.title}</span>
        <span className="fact truncate text-[#a8837a]">{where}</span>
      </div>
      <span className="fact whitespace-nowrap text-[#e08b74]">{fact.text}</span>
      <div className="relative">
        <button
          type="button"
          onClick={() => setRescheduling(true)}
          className="rounded-[7px] border border-[#6b3a2f] px-[13px] py-1.5 text-[13px] text-[#f0d9d3] transition-colors hover:bg-[#2a1a16]"
        >
          Reschedule
        </button>
        <ReschedulePopover
          item={item}
          open={rescheduling}
          onClose={() => setRescheduling(false)}
        />
      </div>
      <RowMenu
        items={[
          {
            label: "It's done",
            onSelect: () => act((db, c) => items.close(db, c, item.id, "done")),
          },
          {
            label: "Turn it into an idea",
            onSelect: () => act((db, c) => items.demote(db, c, item.id)),
          },
          {
            label: "Drop it — not happening",
            terminal: true,
            onSelect: () => act((db, c) => items.close(db, c, item.id, "dropped")),
          },
        ]}
      />
    </div>
  );
}

/** A waiting-on: Chase buys another wait; They replied is the good news. */
export function WaitingRow({
  item,
  where,
  fact,
  last,
  onOpen,
}: {
  item: Item;
  where: string;
  fact: TimeFact | null;
  last?: boolean;
  onOpen?: () => void;
}) {
  const { act } = useStore();
  const [replied, setReplied] = useState(false);
  const [checkin, setCheckin] = useState(false);

  return (
    <RowShell title={item.title} where={where} last={last} onOpen={onOpen}>
      {fact && <Fact tone={fact.tone}>{fact.text}</Fact>}
      <InlineVerb onClick={() => act((db, c) => items.chase(db, c, item.id))}>
        Chase
      </InlineVerb>
      <div className="relative">
        <button
          type="button"
          onClick={() => setReplied(true)}
          className="rounded-[7px] border border-outline-hover bg-[#212624] px-[13px] py-1.5 text-[13px] text-text transition-colors hover:border-muted"
        >
          They replied
        </button>
        <TheyRepliedPopover item={item} open={replied} onClose={() => setReplied(false)} />
      </div>
      <div className="relative">
        <RowMenu
          items={[
            { label: "Set a check-in…", onSelect: () => setCheckin(true) },
            {
              label: "Drop it — it won't come",
              terminal: true,
              onSelect: () => act((db, c) => items.close(db, c, item.id, "dropped")),
            },
          ]}
        />
        <Popover open={checkin} onClose={() => setCheckin(false)}>
          <div className="flex flex-col gap-3 px-1 py-1">
            <span className="label text-[10px] tracking-[.12em] text-faint">Check in when?</span>
            <DayField
              autoFocus
              onPick={(day) => {
                setCheckin(false);
                void act((db, c) => items.setCheckin(db, c, item.id, day));
              }}
            />
          </div>
        </Popover>
      </div>
    </RowShell>
  );
}

/** An idea, surfaced or listed: pick it up, or let it go for good. */
export function IdeaRow({
  item,
  where,
  wasInProgress,
  last,
  onOpen,
}: {
  item: Item;
  where: string;
  wasInProgress: boolean;
  last?: boolean;
  onOpen?: () => void;
}) {
  const { act } = useStore();
  return (
    <RowShell title={item.title} where={where} last={last} onOpen={onOpen}>
      {wasInProgress && <WasInProgressBadge />}
      <button
        type="button"
        onClick={() => act((db, c) => items.promote(db, c, item.id))}
        className="rounded-[7px] bg-green px-3.5 py-[7px] text-[13px] text-ink transition-colors hover:bg-green-hover"
      >
        Do it today
      </button>
      <button
        type="button"
        onClick={() => act((db, c) => items.close(db, c, item.id, "dropped"))}
        className="rounded-[7px] px-2.5 py-1.5 text-[13px] text-sleeping transition-colors hover:text-soft"
      >
        Not relevant
      </button>
    </RowShell>
  );
}

function todoMenu(item: Item, act: ReturnType<typeof useStore>["act"], reschedule: () => void): MenuItem[] {
  return [
    {
      label: item.deadline === null ? "Give it a deadline…" : "Reschedule…",
      onSelect: reschedule,
    },
    {
      label: "Turn it into an idea",
      onSelect: () => act((db, c) => items.demote(db, c, item.id)),
    },
    {
      label: "Drop it — not happening",
      terminal: true,
      onSelect: () => act((db, c) => items.close(db, c, item.id, "dropped")),
    },
  ];
}
