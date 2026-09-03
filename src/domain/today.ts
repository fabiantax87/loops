import type { Clock } from "../lib/clock";
import { type Day, dayStart, daysBetween, today } from "../lib/time";
import { attribution, contactById, openItems, type Snapshot } from "./snapshot";
import type { Item } from "./types";
import { countOf, plural, sentences, spell, spellCapitalised } from "./words";

/**
 * Red is reserved. Only a todo past its deadline is red; a waiting-on whose
 * check-in has arrived is amber; everything informational is grey. Deciding it
 * here rather than in each row is what keeps that promise honest.
 */
export type Tone = "red" | "amber" | "muted" | "grey";

export interface TimeFact {
  text: string;
  tone: Tone;
}

export interface TodoRow {
  item: Item;
  where: string;
  /** Days past its deadline; 0 means today or undated. */
  lateBy: number;
  /** Picked up from an idea and not yet given a date. */
  promoted: boolean;
  fact: TimeFact;
}

export interface ChaseRow {
  item: Item;
  where: string;
  fact: TimeFact;
}

export interface IdeaRow {
  item: Item;
  where: string;
  /** Once picked up and put back down — it goes first, and says so. */
  wasInProgress: boolean;
}

export interface TodayModel {
  /** "Friday 4 September" */
  date: string;
  /** The written header, split so the closing permission can render dimmer. */
  headline: { lead: string; tail: string };
  critical: TodoRow[];
  dueToday: TodoRow[];
  chase: ChaseRow[];
  /** The day's chosen ideas — only ever set when they were chosen today. */
  ideas: IdeaRow[];
  /** Waiting-ons still inside their check-in window. */
  waitingResting: number;
  /** Open ideas not surfaced today. */
  ideasResting: number;
  /** Which shape the day takes. */
  mode: "welcome" | "work" | "ideas" | "quiet";
}

export function formatBriefingDate(clock: Clock): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(clock.now());
}

/** "Fri 5 Sep" — the way a day reads on a row or a chip. */
export function niceDay(day: Day): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(dayStart(day));
}

/** "Monday", for a day within the last week; the full date beyond that. */
function recentDayName(day: Day, now: Day): string {
  if (daysBetween(day, now) <= 6) {
    return new Intl.DateTimeFormat("en-GB", { weekday: "long" }).format(dayStart(day));
  }
  return niceDay(day);
}

/** "26 August" — how a past day reads inside a sentence. */
export function noteDay(day: Day): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" }).format(
    dayStart(day),
  );
}

function todoRow(snapshot: Snapshot, item: Item, now: Day): TodoRow {
  const promoted = item.deadline === null;
  const lateBy = item.deadline ? Math.max(0, daysBetween(item.deadline, now)) : 0;
  const where = promoted && item.ideaSince
    ? `${attribution(snapshot, item)} · was an idea since ${noteDay(item.ideaSince)}`
    : attribution(snapshot, item);
  const fact: TimeFact =
    lateBy > 0
      ? {
          text: `due ${recentDayName(item.deadline as Day, now)} · ${countOf(lateBy, "day")} ago`,
          tone: "red",
        }
      : { text: "today", tone: "grey" };
  return { item, where, lateBy, promoted, fact };
}

/** Todos whose deadline has passed — critical, pinned, and the only red. */
export function criticalTodos(snapshot: Snapshot, clock: Clock): TodoRow[] {
  const now = today(clock);
  return openItems(snapshot)
    .filter((i) => i.kind === "todo" && i.deadline !== null && i.deadline < now)
    .map((i) => todoRow(snapshot, i, now))
    .sort((a, b) => b.lateBy - a.lateBy || a.item.createdAt.localeCompare(b.item.createdAt));
}

/**
 * Today's work: todos due today, plus anything picked up from an idea — a
 * promoted todo has no date to miss, so it simply sits with the day.
 */
export function dueTodayTodos(snapshot: Snapshot, clock: Clock): TodoRow[] {
  const now = today(clock);
  return openItems(snapshot)
    .filter((i) => i.kind === "todo" && (i.deadline === now || i.deadline === null))
    .map((i) => todoRow(snapshot, i, now))
    .sort(
      (a, b) =>
        Number(b.promoted) - Number(a.promoted) ||
        a.item.createdAt.localeCompare(b.item.createdAt),
    );
}

function chaseFact(item: Item, now: Day): TimeFact {
  const day = item.checkinOn as Day;
  return day === now
    ? { text: "check-in today", tone: "amber" }
    : { text: `check-in was ${recentDayName(day, now)}`, tone: "amber" };
}

/** Waiting-ons whose check-in day has arrived with nothing recorded since. */
export function chaseDue(snapshot: Snapshot, clock: Clock): ChaseRow[] {
  const now = today(clock);
  return openItems(snapshot)
    .filter((i) => i.kind === "waiting" && i.checkinOn !== null && i.checkinOn <= now)
    .map((item) => {
      const asked = item.lastChasedOn ?? item.sentOn;
      const notes: string[] = [];
      if (asked) {
        notes.push(item.lastChasedOn ? `chased on ${noteDay(asked)}` : `asked ${noteDay(asked)}`);
      }
      if (item.chaseCount >= 2) notes.push(`chased ${spell(item.chaseCount)} times`);
      return {
        item,
        where: [attribution(snapshot, item), ...notes].join(" · "),
        fact: chaseFact(item, now),
      };
    })
    .sort((a, b) => (a.item.checkinOn as Day).localeCompare(b.item.checkinOn as Day));
}

function ideaRow(snapshot: Snapshot, item: Item): IdeaRow {
  const noted = item.ideaSince ? ` · noted ${noteDay(item.ideaSince)}` : "";
  const started = item.startedOn ? ` · you started this on ${noteDay(item.startedOn)}` : "";
  return {
    item,
    where: `${attribution(snapshot, item)}${noted}${started}`,
    wasInProgress: item.startedOn !== null,
  };
}

/** The ideas the day chose this morning, in the order it chose them. */
export function ideasOfToday(snapshot: Snapshot, clock: Clock): IdeaRow[] {
  const chosen = snapshot.ideasOfDay;
  if (!chosen || chosen.day !== today(clock)) return [];
  return chosen.ids
    .map((id) => snapshot.items.find((i) => i.id === id))
    .filter((i): i is Item => i !== undefined && i.status === "open" && i.kind === "idea")
    .map((i) => ideaRow(snapshot, i));
}

/**
 * The header speaks in sentences and ends by giving permission to stop
 * reading. Counts get spelled out; a single person gets their name.
 */
export function headlineFor(snapshot: Snapshot, model: {
  critical: TodoRow[];
  dueToday: TodoRow[];
  chase: ChaseRow[];
}): { lead: string; tail: string } {
  const parts: string[] = [];
  const { critical, dueToday, chase } = model;

  if (critical.length > 0) {
    parts.push(
      critical.length === 1
        ? "One deadline went past."
        : `${spellCapitalised(critical.length)} deadlines went past.`,
    );
  }
  if (dueToday.length > 0) {
    const promoted = dueToday.filter((r) => r.promoted).length;
    const n = dueToday.length;
    const base =
      critical.length > 0
        ? `${spellCapitalised(n)} more ${n === 1 ? "lands" : "land"} today`
        : `${spellCapitalised(n)} ${n === 1 ? "thing" : "things"} for today`;
    const pickedUp =
      promoted === 0
        ? ""
        : promoted === n
          ? n === 1
            ? " — a thought you picked up"
            : " — thoughts you picked up"
          : `, ${spell(promoted)} of them ${promoted === 1 ? "a thought" : "thoughts"} you picked up`;
    parts.push(`${base}${pickedUp}.`);
  }
  if (chase.length > 0) {
    const names = chase
      .map((r) => contactById(snapshot, r.item.contactId)?.name.split(" ")[0])
      .filter((n): n is string => Boolean(n));
    parts.push(
      chase.length === 1
        ? `${names[0] ?? "Someone"} still hasn't come back to you.`
        : `${spellCapitalised(chase.length)} people still haven't come back to you.`,
    );
  }

  if (parts.length === 0) return { lead: "", tail: "" };
  return { lead: sentences(...parts), tail: "Nothing else needs you." };
}

export function buildToday(snapshot: Snapshot, clock: Clock): TodayModel {
  const critical = criticalTodos(snapshot, clock);
  const dueToday = dueTodayTodos(snapshot, clock);
  const chase = chaseDue(snapshot, clock);
  const ideas = ideasOfToday(snapshot, clock);

  const openIdeas = openItems(snapshot).filter((i) => i.kind === "idea");
  const openWaiting = openItems(snapshot).filter((i) => i.kind === "waiting");
  const shown = new Set(ideas.map((r) => r.item.id));

  const hasWork = critical.length + dueToday.length + chase.length > 0;
  const mode: TodayModel["mode"] =
    snapshot.clients.length === 0
      ? "welcome"
      : hasWork
        ? "work"
        : ideas.length > 0
          ? "ideas"
          : "quiet";

  return {
    date: formatBriefingDate(clock),
    headline: headlineFor(snapshot, { critical, dueToday, chase }),
    critical,
    dueToday,
    chase,
    ideas,
    waitingResting: openWaiting.length - chase.length,
    ideasResting: openIdeas.filter((i) => !shown.has(i.id)).length,
    mode,
  };
}

/** The footer under the chase band, when anything is still resting. */
export function restingWaitingLine(n: number): string | null {
  if (n <= 0) return null;
  return `${spellCapitalised(n)} ${n === 1 ? "waiting-on is" : "more waiting-ons are"} still inside ${
    n === 1 ? "its" : "their"
  } check-in window. You'll hear about ${n === 1 ? "it" : "them"} when the date arrives.`;
}

/** The footer that says where the ideas went, or how many are behind these. */
export function restingIdeasLine(n: number, onIdeaDay: boolean): string | null {
  if (n <= 0) return null;
  if (onIdeaDay) {
    return `${spellCapitalised(n)} more ${plural(n, "idea")} ${
      n === 1 ? "is" : "are"
    } resting · or close the app, that's a fine answer too`;
  }
  return `Ideas stay put while deadlines exist — ${spell(n)} ${
    n === 1 ? "is" : "are"
  } resting.`;
}
