import type { Day, Instant } from "../lib/time";

/**
 * The three kinds of item, each with its own rules:
 *   todo    — has a deadline, and goes critical the day after missing it. The
 *             one todo without a deadline is one picked up from an idea; it
 *             sits with today's work and cannot go critical.
 *   idea    — no dates at all. Rests until a day with nothing dated, when the
 *             three oldest surface — ones you once started go first.
 *   waiting — their move. An optional check-in day says when to go chasing.
 */
export type ItemKind = "todo" | "idea" | "waiting";

export type ItemStatus = "open" | "closed";

/** How an item left: finished, answered, or decided against. Never deleted. */
export type ItemOutcome = "done" | "replied" | "dropped";

export type ProjectStatus = "active" | "paused" | "done";

export interface Client {
  id: number;
  name: string;
  notes: string | null;
  archivedAt: Instant | null;
  createdAt: Instant;
}

export interface Project {
  id: number;
  clientId: number;
  name: string;
  status: ProjectStatus;
  createdAt: Instant;
}

/**
 * A person at a client. Capture matches on their name, which is why the same
 * first name is allowed to exist at two clients — that ambiguity is a question
 * worth asking rather than a conflict worth preventing.
 */
export interface Contact {
  id: number;
  clientId: number;
  /** Set when they only work on one project, which sharpens the guess. */
  projectId: number | null;
  name: string;
  role: string | null;
  createdAt: Instant;
}

export interface Item {
  id: number;
  clientId: number;
  projectId: number | null;
  contactId: number | null;
  kind: ItemKind;
  title: string;
  /** todo: the day it is owed. Null only on a todo picked up from an idea. */
  deadline: Day | null;
  /** Local 'HH:MM' on the deadline day, when a moment matters — reminder only. */
  deadlineTime: string | null;
  /** The day it was first an idea. Survives promotion and demotion. */
  ideaSince: Day | null;
  /** The day it was picked up. On an idea it means "was in progress". */
  startedOn: Day | null;
  /** waiting: the day the ball went to them. */
  sentOn: Day | null;
  /** waiting: when to go asking, if ever. */
  checkinOn: Day | null;
  /** Local 'HH:MM' on the check-in day; the nudge waits for it. */
  checkinTime: string | null;
  lastChasedOn: Day | null;
  chaseCount: number;
  status: ItemStatus;
  outcome: ItemOutcome | null;
  createdAt: Instant;
  updatedAt: Instant;
  closedAt: Instant | null;
}
