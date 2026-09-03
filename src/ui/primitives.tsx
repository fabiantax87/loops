import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Tone } from "../domain/today";

const TONE: Record<Tone, string> = {
  red: "text-red",
  amber: "text-amber",
  muted: "text-muted",
  grey: "text-faint",
};

/** The uppercase mono heading that names a band. */
export function BandLabel({ children }: { children: ReactNode }) {
  return <span className="label pb-2 text-muted">{children}</span>;
}

/** A fact about time. Its colour is decided by the domain, never by the row. */
export function Fact({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`fact whitespace-nowrap ${TONE[tone]}`}>{children}</span>;
}

/** The single quiet verb a row is allowed, where there is an obvious move. */
export function InlineVerb({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[7px] border border-outline px-[13px] py-1.5 text-[13px] text-soft transition-colors hover:border-outline-hover hover:text-text"
    >
      {children}
    </button>
  );
}

export function PrimaryButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg bg-green px-[18px] py-2.5 text-sm text-ink transition-colors hover:bg-green-hover"
    >
      {children}
    </button>
  );
}

export interface MenuItem {
  label: string;
  onSelect: () => void;
  /** Set apart at the foot of the menu — closing, dropping, deleting. */
  terminal?: boolean;
}

/**
 * The "⋯" every row carries. Everything a loop can become lives in here, which
 * is what lets the row itself stay a sentence.
 */
export function RowMenu({ items, label = "⋯" }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!holder.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  // Menus near the foot of the page open upward rather than off the screen.
  useLayoutEffect(() => {
    if (!open || !panel.current) return;
    const box = panel.current.getBoundingClientRect();
    setAbove(box.bottom > window.innerHeight - 12);
  }, [open]);

  return (
    <div ref={holder} className="relative flex-none">
      <button
        type="button"
        aria-label="More"
        onClick={() => setOpen((o) => !o)}
        className={`rounded-md px-2 py-0.5 text-base transition-colors hover:bg-hover hover:text-text ${
          open ? "bg-hover text-text" : "text-faint"
        }`}
      >
        {label}
      </button>
      {open && (
        <div
          ref={panel}
          className={`absolute right-0 z-30 w-56 rounded-[10px] border border-frame bg-chrome py-1.5 shadow-[0_18px_50px_rgba(0,0,0,.65)] ${
            above ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          {items.map((item, index) => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`block w-full px-3.5 py-2 text-left text-sm text-soft transition-colors hover:bg-hover hover:text-text ${
                item.terminal && index > 0 ? "mt-1.5 border-t border-hairline pt-3" : ""
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One line in a band: what it is, where it lives, one fact about time, and the
 * menu. Bands draw a hairline above every row and close themselves off below
 * the last one.
 */
export function Row({
  title,
  where,
  fact,
  verb,
  menu,
  last,
  onOpen,
}: {
  title: ReactNode;
  where?: ReactNode;
  fact?: ReactNode;
  verb?: ReactNode;
  menu?: ReactNode;
  last?: boolean;
  onOpen?: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-[18px] border-t border-hairline py-[17px] ${
        last ? "border-b" : ""
      }`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
        <span
          onClick={onOpen}
          className={`text-[17px] leading-[1.4] text-text ${onOpen ? "cursor-pointer" : ""}`}
        >
          {title}
        </span>
        {typeof where === "string" ? (
          <span className="fact truncate text-faint">{where}</span>
        ) : (
          where
        )}
      </div>
      {fact}
      {verb}
      {menu}
    </div>
  );
}

/**
 * A hover note. Used where a number stands in for a sentence — the number is
 * what you scan, the sentence is what you actually needed.
 */
export function Tooltip({
  note,
  children,
  align = "right",
}: {
  note: string;
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <span className="group relative flex items-center">
      {children}
      <span
        className={`pointer-events-none absolute bottom-full z-40 mb-2 w-64 rounded-lg border border-frame bg-chrome px-3 py-2.5 text-[13px] leading-[1.5] text-soft opacity-0 shadow-[0_18px_50px_rgba(0,0,0,.65)] transition-opacity group-hover:opacity-100 ${
          align === "right" ? "right-0" : "left-0"
        }`}
      >
        {note}
      </span>
    </span>
  );
}

/** A band renders nothing at all when it is empty — the page gets shorter. */
export function Band({
  label,
  children,
  empty,
}: {
  label: string;
  children: ReactNode;
  empty?: boolean;
}) {
  if (empty) return null;
  return (
    <section className="flex flex-col gap-1.5">
      <BandLabel>{label}</BandLabel>
      {children}
    </section>
  );
}
