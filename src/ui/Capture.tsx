import { useEffect, useMemo, useRef, useState } from "react";
import { parseCapture, parseDate, type CaptureGuess } from "../domain/capture";
import { niceDay } from "../domain/today";
import { projectsOf } from "../domain/snapshot";
import type { Client, ItemKind, Project } from "../domain/types";
import { useClock } from "../lib/ClockContext";
import type { Day } from "../lib/time";
import { commitCapture } from "../state/commit";
import { useSnapshot, useStore } from "../state/store";

const KINDS: { kind: ItemKind; label: string; key: string }[] = [
  { kind: "todo", label: "Todo", key: "⌥1" },
  { kind: "idea", label: "Idea", key: "⌥2" },
  { kind: "waiting", label: "Waiting-on", key: "⌥3" },
];

const PLACEHOLDER: Record<ItemKind, string> = {
  todo: "Something you owe…",
  idea: "Something worth doing one day…",
  waiting: "What you're waiting on, and who has it…",
};

export interface CapturePreset {
  kind?: ItemKind;
  client?: Client;
  project?: Project | null;
}

function Chip({
  children,
  hint,
  onClick,
  selected,
}: {
  children: React.ReactNode;
  hint?: string;
  onClick?: () => void;
  selected?: boolean;
}) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={`flex flex-none items-center gap-2 rounded-md border px-[11px] py-1.5 text-[13px] whitespace-nowrap transition-colors ${
        selected === false
          ? "border-outline text-sleeping hover:text-text"
          : "border-[#2f3532] bg-[#212624] text-text"
      }`}
    >
      {children}
      {hint && <span className="fact text-[11px] text-faint">{hint}</span>}
    </Tag>
  );
}

/**
 * Two clients have a John. Rather than picking one and being quietly wrong,
 * the chip becomes the question — and your text stays put while you answer.
 */
function WhichOne({
  ambiguous,
  onPick,
}: {
  ambiguous: NonNullable<CaptureGuess["ambiguous"]>;
  onPick: (patch: Partial<CaptureGuess>) => void;
}) {
  return (
    <span className="flex flex-none items-center gap-2.5 rounded-md border border-[#6f6242] bg-[#1d1a12] py-[5px] pr-2 pl-[11px] text-[13px] whitespace-nowrap">
      <span className="fact text-[11px] text-amber">which {ambiguous.name}?</span>
      {ambiguous.candidates.map(({ contact, client, project }, index) => (
        <button
          key={contact.id}
          type="button"
          onClick={() =>
            onPick({ client, project, contact, ambiguous: null, clientVia: contact.name })
          }
          className="rounded-[5px] border border-outline-hover bg-[#212624] px-[9px] py-[3px] text-[13px] text-text transition-colors hover:border-muted"
        >
          {client.name}{" "}
          <span className="fact text-[10px] text-faint">⌥{index + 1}</span>
        </button>
      ))}
    </span>
  );
}

/**
 * The capture bar. One line in, one item out: the type is a three-way toggle
 * (⌥← → or ⌥1/2/3 without leaving the keyboard), routing comes from the names
 * in the sentence, and the visible fields follow the type — a todo shows the
 * deadline it requires, an idea shows nothing, a waiting-on offers a check-in.
 */
export function Capture({
  onClose,
  preset,
}: {
  onClose: () => void;
  preset?: CapturePreset;
}) {
  const snapshot = useSnapshot();
  const clock = useClock();
  const { act } = useStore();
  const [kind, setKind] = useState<ItemKind>(preset?.kind ?? "todo");
  const [text, setText] = useState("");
  const [overrides, setOverrides] = useState<Partial<CaptureGuess>>({});
  const [dateText, setDateText] = useState("");
  const [reproach, setReproach] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => field.current?.focus(), []);

  const parsed = useMemo(
    () => parseCapture(text, snapshot, clock),
    [text, snapshot, clock],
  );
  const guess: CaptureGuess = {
    ...parsed,
    ...(preset?.client && !parsed.client && !parsed.ambiguous
      ? { client: preset.client, project: preset.project ?? null }
      : {}),
    ...overrides,
  };

  // A fresh sentence starts a fresh guess; your overrides only outlive edits
  // to the fields themselves.
  useEffect(() => {
    setOverrides({});
    setReproach(null);
  }, [text]);

  // The date: an explicit entry in the field wins; failing that, whatever the
  // sentence said.
  const typedDate =
    dateText.trim() === ""
      ? null
      : /^\d{4}-\d{2}-\d{2}$/.test(dateText.trim())
        ? { day: dateText.trim() as Day, phrase: dateText.trim() }
        : parseDate(dateText, clock);
  const effectiveDay: Day | null = typedDate?.day ?? guess.date?.day ?? null;

  const set = (patch: Partial<CaptureGuess>) =>
    setOverrides((current) => ({ ...current, ...patch }));

  const cycleKind = (delta: number) => {
    const index = KINDS.findIndex((k) => k.kind === kind);
    setKind(KINDS[(index + delta + KINDS.length) % KINDS.length].kind);
  };

  const save = () => {
    if (text.trim() === "") return;
    if (guess.ambiguous) {
      setReproach("pick a client to save");
      return;
    }
    if (!guess.client) {
      setReproach("which client is this? name them, or pick below");
      return;
    }
    if (kind === "todo" && effectiveDay === null) {
      setReproach("a todo needs a deadline");
      return;
    }
    void commitCapture(
      {
        kind,
        title: guess.title,
        clientId: guess.client.id,
        projectId: guess.project?.id ?? null,
        contactId: guess.contact?.id ?? null,
        deadline: kind === "todo" ? effectiveDay : null,
        checkinOn: kind === "waiting" ? effectiveDay : null,
      },
      act,
    ).then((saved) => {
      if (saved) onClose();
    });
  };

  const onKeys = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.altKey && e.key === "ArrowRight") {
      e.preventDefault();
      cycleKind(1);
      return;
    }
    if (e.altKey && e.key === "ArrowLeft") {
      e.preventDefault();
      cycleKind(-1);
      return;
    }
    if (e.altKey && ["1", "2", "3", "¡", "€", "£"].includes(e.key)) {
      // ⌥-digit types a symbol on many layouts; the code says which digit.
      const digit = Number(e.code.replace("Digit", ""));
      if (guess.ambiguous && digit >= 1 && digit <= guess.ambiguous.candidates.length) {
        e.preventDefault();
        const { contact, client, project } = guess.ambiguous.candidates[digit - 1];
        set({ client, project, contact, ambiguous: null, clientVia: contact.name });
        return;
      }
      if (digit >= 1 && digit <= 3) {
        e.preventDefault();
        setKind(KINDS[digit - 1].kind);
      }
    }
  };

  const liveProjects = (clientId: number) =>
    projectsOf(snapshot, clientId).filter((p) => p.status !== "done");

  const showFooter = text.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/60 pt-[16vh]"
      onMouseDown={onClose}
    >
      <div
        className="w-[680px] overflow-hidden rounded-xl border border-[#313734] bg-hover shadow-[0_26px_70px_rgba(0,0,0,.6)]"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeys}
      >
        <div className="flex items-center gap-2 border-b border-[#242927] px-5 py-3.5">
          {KINDS.map(({ kind: k, label, key }) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                field.current?.focus();
              }}
              className={`flex items-center gap-2 rounded-[7px] px-[13px] py-1.5 text-[13px] transition-colors ${
                kind === k
                  ? "bg-green text-ink"
                  : "text-muted hover:bg-[#212624] hover:text-text"
              }`}
            >
              {label}
              <span
                className={`fact text-[11px] ${kind === k ? "opacity-60" : "text-faint"}`}
              >
                {key}
              </span>
            </button>
          ))}
          <div className="flex-1" />
          <span className="fact text-[11px] text-faint">⌥← → switches type</span>
        </div>

        <div className="flex items-center gap-3 p-5">
          <span className="fact text-green">›</span>
          <input
            ref={field}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              }
            }}
            placeholder={PLACEHOLDER[kind]}
            className="flex-1 bg-transparent text-[18px] text-text outline-none placeholder:text-faint"
          />
        </div>

        {showFooter && (
          <div className="flex flex-col gap-3.5 border-t border-[#242927] bg-[#141716] px-5 pt-4 pb-4">
            <div className="flex flex-wrap items-center gap-2">
              {guess.ambiguous ? (
                <WhichOne ambiguous={guess.ambiguous} onPick={set} />
              ) : guess.client ? (
                <Chip
                  hint={
                    guess.clientVia
                      ? `from “${guess.clientVia}”`
                      : preset?.client && overrides.client === undefined && !parsed.client
                        ? "this page"
                        : undefined
                  }
                >
                  {guess.client.name}
                </Chip>
              ) : (
                snapshot.clients
                  .filter((c) => c.archivedAt === null)
                  .map((client) => (
                    <Chip
                      key={client.id}
                      selected={false}
                      onClick={() => set({ client, project: null, contact: null })}
                    >
                      {client.name}
                    </Chip>
                  ))
              )}
              {guess.client && guess.project && <Chip>{guess.project.name}</Chip>}
              {guess.client && !guess.project &&
                liveProjects(guess.client.id).length > 0 &&
                liveProjects(guess.client.id).map((project) => (
                  <Chip
                    key={project.id}
                    selected={false}
                    onClick={() => set({ project })}
                  >
                    {project.name}
                  </Chip>
                ))}
              {guess.contact && <Chip>{guess.contact.name}</Chip>}
            </div>

            {kind !== "idea" && (
              <div className="flex items-center gap-3">
                <span className="label w-[78px] text-[11px] tracking-[.08em] text-muted">
                  {kind === "todo" ? "Deadline" : "Check in"}
                </span>
                <input
                  value={dateText}
                  onChange={(e) => setDateText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      save();
                    }
                  }}
                  placeholder={guess.date ? guess.date.phrase : "mon · in 3 days · 12 sep"}
                  className="w-44 rounded-md border border-outline-hover bg-[#212624] px-3 py-1.5 text-[14px] text-text outline-none placeholder:text-faint"
                />
                {effectiveDay ? (
                  <span className="fact text-[12px] text-text">{niceDay(effectiveDay)}</span>
                ) : dateText.trim() !== "" ? (
                  <span className="fact text-[11px] text-faint">?</span>
                ) : null}
                <span className="fact text-[11px] text-faint">
                  {kind === "todo" ? "required · type “mon”, “in 3 days”" : "or leave it open"}
                </span>
              </div>
            )}

            <div className="flex items-center gap-4">
              <span className="fact text-[11px] text-faint">⏎ save</span>
              <span className="fact text-[11px] text-faint">⇥ fields</span>
              <span className="fact text-[11px] text-faint">esc dismiss</span>
              <div className="flex-1" />
              {reproach ? (
                <span className="fact text-[11px] text-amber">{reproach}</span>
              ) : kind === "idea" ? (
                <span className="fact text-[11px] text-faint">
                  no date — it waits for a quiet day
                </span>
              ) : kind === "waiting" && effectiveDay ? (
                <span className="fact text-[11px] text-faint">
                  only resurfaces if nothing comes in
                </span>
              ) : null}
            </div>
          </div>
        )}

        {!showFooter && (
          <div className="flex flex-col gap-2 border-t border-[#242927] bg-[#141716] px-5 pt-3.5 pb-4">
            <span className="text-[13px] leading-[1.6] text-muted">
              {kind === "todo" &&
                "Something you owe, and the day you owe it by. Past that day it goes red and stays on top until it's done or moved."}
              {kind === "idea" &&
                "No dates. It rests until a day with nothing dated anywhere, when the oldest three surface."}
              {kind === "waiting" &&
                "Their move. Add a check-in day and Loops nudges you to chase if nothing has come back by then."}
            </span>
            <span className="fact text-[11px] text-faint">
              naming a person routes it — “send Sanne the agreement by fri”
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
