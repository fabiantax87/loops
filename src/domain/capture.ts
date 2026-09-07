import type { Clock } from "../lib/clock";
import { type Day, addDays, dayStart, today } from "../lib/time";
import { type Snapshot, projectsOf } from "./snapshot";
import type { Client, Contact, Project } from "./types";

/**
 * The type of an item is chosen explicitly in the capture bar; what this
 * parser does is everything else — route the sentence to a client, project and
 * person, and lift a date out of it. Every guess is shown as a chip you can
 * override, and the rules are deliberately shallow: a parser you can't predict
 * is worse than one that occasionally shrugs.
 */
export interface CaptureGuess {
  title: string;
  client: Client | null;
  /** How the client was found — shown as `from "Sanne"`. */
  clientVia: string | null;
  project: Project | null;
  /** The person the sentence names, when you have written them down. */
  contact: Contact | null;
  /**
   * Two clients are allowed a John. When one is mentioned, capture asks which
   * rather than guessing — the chips are the question.
   */
  ambiguous: { name: string; candidates: ContactCandidate[] } | null;
  /** A date lifted from the sentence — deadline or check-in, depending on type. */
  date: DateGuess | null;
  /** A time of day lifted from the sentence — "at 15:00", "by 3pm". */
  time: TimeGuess | null;
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
  september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

/** People type "in two days" as often as "in 2 days". */
const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  // Vague on purpose, and rounded the way people mean them.
  "a couple of": 2,
  "a few": 3,
};

function wordToNumber(word: string): number {
  return NUMBER_WORDS[word] ?? Number(word);
}

export interface DateGuess {
  day: Day;
  phrase: string;
}

export interface TimeGuess {
  /** Local 'HH:MM'. */
  time: string;
  phrase: string;
}

/**
 * A moment on the day: "15:00", "at 3pm", "noon". Shallow like the date
 * parser — a bare hour needs "at"/"by" or an am/pm so that "send 3 invoices"
 * stays a sentence about invoices.
 */
export function parseTime(text: string): TimeGuess | null {
  const lower = ` ${text.toLowerCase()} `;

  const named = lower.match(/\b(noon|midday)\b/);
  if (named) return { time: "12:00", phrase: named[1] };

  const clocklike = lower.match(/\b(?:(at|by|before|around) )?(\d{1,2}):(\d{2})\s*(am|pm)?\b/);
  const bare = lower.match(/\b(?:(at|by|before|around) )(\d{1,2})\s*(am|pm)?\b/);
  const ampmOnly = lower.match(/\b(\d{1,2})\s*(am|pm)\b/);

  const pick = clocklike
    ? { hour: Number(clocklike[2]), minute: Number(clocklike[3]), ampm: clocklike[4], phrase: clocklike[0] }
    : bare
      ? { hour: Number(bare[2]), minute: 0, ampm: bare[3], phrase: bare[0] }
      : ampmOnly
        ? { hour: Number(ampmOnly[1]), minute: 0, ampm: ampmOnly[2], phrase: ampmOnly[0] }
        : null;
  if (!pick) return null;

  let hour = pick.hour;
  if (pick.ampm === "pm" && hour < 12) hour += 12;
  if (pick.ampm === "am" && hour === 12) hour = 0;
  if (hour > 23 || pick.minute > 59) return null;

  return {
    time: `${String(hour).padStart(2, "0")}:${String(pick.minute).padStart(2, "0")}`,
    phrase: pick.phrase.trim(),
  };
}

/** The next time that weekday comes round; today counts as itself. */
function nextWeekday(name: string, clock: Clock): Day {
  const target = WEEKDAYS[name];
  const now = clock.now();
  const delta = (target - now.getDay() + 7) % 7;
  return addDays(today(clock), delta);
}

export function parseDate(text: string, clock: Clock): DateGuess | null {
  const lower = ` ${text.toLowerCase()} `;

  const named: [RegExp, () => Day][] = [
    [/\b(today|eod|end of day)\b/, () => today(clock)],
    [/\b(tomorrow|tmrw)\b/, () => addDays(today(clock), 1)],
    [/\bday after tomorrow\b/, () => addDays(today(clock), 2)],
    [/\bnext week\b/, () => addDays(today(clock), 7)],
    [/\bnext month\b/, () => addDays(today(clock), 30)],
    [/\b(end of (the )?week|eow)\b/, () => nextWeekday("friday", clock)],
  ];
  for (const [pattern, resolve] of named) {
    const found = lower.match(pattern);
    if (found) return { day: resolve(), phrase: found[0].trim() };
  }

  const relative = lower.match(
    /\bin (\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a couple of|a few) (day|days|week|weeks|fortnight)\b/,
  );
  if (relative) {
    const unit = relative[2].startsWith("week") ? 7 : relative[2] === "fortnight" ? 14 : 1;
    const count = wordToNumber(relative[1]) * unit;
    return { day: addDays(today(clock), count), phrase: relative[0].trim() };
  }

  const dayMonth = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)? (\w{3,9})\b/);
  if (dayMonth && MONTHS[dayMonth[2]] !== undefined) {
    return { day: resolveCalendar(Number(dayMonth[1]), MONTHS[dayMonth[2]], clock), phrase: dayMonth[0].trim() };
  }
  const monthDay = lower.match(/\b(\w{3,9}) (\d{1,2})(?:st|nd|rd|th)?\b/);
  if (monthDay && MONTHS[monthDay[1]] !== undefined) {
    return { day: resolveCalendar(Number(monthDay[2]), MONTHS[monthDay[1]], clock), phrase: monthDay[0].trim() };
  }

  const weekday = lower.match(
    /\b(sunday|sun|monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat)\b/,
  );
  if (weekday) return { day: nextWeekday(weekday[1], clock), phrase: weekday[0].trim() };

  return null;
}

/** A bare day and month means the next time it comes round, not the past. */
function resolveCalendar(day: number, month: number, clock: Clock): Day {
  const now = clock.now();
  const candidate = new Date(now.getFullYear(), month, day);
  const year = candidate < dayStart(today(clock)) ? now.getFullYear() + 1 : now.getFullYear();
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "about", "that", "this", "have", "has",
  "was", "were", "are", "you", "your", "our", "their", "his", "her", "them",
  "they", "she", "him", "who", "what", "when", "asked", "sent", "waiting",
  "email", "emailed", "call", "called", "meeting", "met", "replied", "still",
  "need", "needs", "check", "chase", "chasing",
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9&']+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

export interface ClientGuess {
  client: Client;
  via: string | null;
  /** When the giveaway word only ever appears on one project, that one. */
  projectId: number | null;
  contact?: Contact | null;
}

export interface ContactCandidate {
  contact: Contact;
  client: Client;
  project: Project | null;
  /** The word in the sentence that matched them. */
  matched: string;
}

function escapeWord(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Does this sentence name this person? Either part of their name counts — you
 * write "John" far more often than "John Aalders", and surnames turn up on
 * their own too.
 */
function nameMentioned(name: string, lower: string): string | null {
  const parts = name
    .toLowerCase()
    .split(/[^a-z0-9'-]+/)
    .filter((part) => part.length >= 2);
  const full = name.toLowerCase();
  if (parts.length > 1 && new RegExp(`\\b${escapeWord(full)}\\b`).test(lower)) return full;
  for (const part of parts) {
    if (new RegExp(`\\b${escapeWord(part)}\\b`).test(lower)) return part;
  }
  return null;
}

/** Everyone you have written down who is named in this sentence. */
export function matchContacts(text: string, snapshot: Snapshot): ContactCandidate[] {
  const lower = ` ${text.toLowerCase()} `;
  return snapshot.contacts
    .map((contact) => {
      const matched = nameMentioned(contact.name, lower);
      if (!matched) return null;
      const client = snapshot.clients.find((c) => c.id === contact.clientId);
      if (!client || client.archivedAt !== null) return null;
      return {
        contact,
        client,
        project: snapshot.projects.find((p) => p.id === contact.projectId) ?? null,
        matched,
      };
    })
    .filter((candidate): candidate is ContactCandidate => candidate !== null);
}

/**
 * Who is this about? In order of how much it is really a guess: the client
 * named outright, then a person you have written down, then a word you have
 * only ever used in one client's company.
 */
export function identify(
  text: string,
  snapshot: Snapshot,
): { guess: ClientGuess | null; ambiguous: CaptureGuess["ambiguous"] } {
  const named = matchClientByName(text, snapshot);
  const candidates = matchContacts(text, snapshot);

  if (candidates.length > 0) {
    // If you also named the company, that settles which John you meant.
    const narrowed = named
      ? candidates.filter((c) => c.client.id === named.client.id)
      : candidates;
    const wide = narrowed.length > 0 ? narrowed : candidates;
    // A full name beats a first name: "John Aalders" is not a question.
    const byFullName = wide.filter((c) => c.matched.includes(" "));
    const pool = byFullName.length > 0 ? byFullName : wide;
    const clientIds = new Set(pool.map((c) => c.client.id));

    if (clientIds.size > 1) {
      return {
        guess: named,
        ambiguous: { name: pool[0].matched, candidates: pool },
      };
    }

    const best = pool[0];
    return {
      guess: {
        client: best.client,
        via: named ? null : best.contact.name,
        projectId: best.contact.projectId,
        contact: best.contact,
      },
      ambiguous: null,
    };
  }

  return { guess: named ?? matchClientByHistory(text, snapshot), ambiguous: null };
}

function matchClientByName(text: string, snapshot: Snapshot): ClientGuess | null {
  const words = tokens(text);
  if (words.length === 0) return null;
  const live = snapshot.clients.filter((c) => c.archivedAt === null);

  for (const client of live) {
    const nameWords = tokens(client.name);
    if (nameWords.length > 0 && nameWords.every((w) => words.includes(w))) {
      return { client, via: null, projectId: null };
    }
  }

  // A single distinctive word of the name — "klokgroep", "eurotransplant".
  for (const client of live) {
    const hit = tokens(client.name).find((w) => w.length >= 4 && words.includes(w));
    if (hit) return { client, via: null, projectId: null };
  }

  return null;
}

/** Something you have only ever mentioned in one client's company. */
function matchClientByHistory(text: string, snapshot: Snapshot): ClientGuess | null {
  const words = tokens(text);
  if (words.length === 0) return null;
  const live = snapshot.clients.filter((c) => c.archivedAt === null);

  const owners = new Map<string, Set<number>>();
  const projectsSeen = new Map<string, Set<number>>();
  const remember = (
    haystack: string | null,
    clientId: number,
    projectId: number | null,
  ) => {
    if (!haystack) return;
    for (const word of tokens(haystack)) {
      const set = owners.get(word) ?? new Set<number>();
      set.add(clientId);
      owners.set(word, set);
      if (projectId !== null) {
        const projects = projectsSeen.get(word) ?? new Set<number>();
        projects.add(projectId);
        projectsSeen.set(word, projects);
      }
    }
  };
  for (const item of snapshot.items) remember(item.title, item.clientId, item.projectId);
  for (const project of snapshot.projects) {
    remember(project.name, project.clientId, project.id);
  }

  for (const word of words) {
    const set = owners.get(word);
    if (set && set.size === 1) {
      const client = live.find((c) => c.id === [...set][0]);
      if (!client) continue;
      const projects = projectsSeen.get(word);
      const projectId = projects?.size === 1 ? [...projects][0] : null;
      return { client, via: word, projectId };
    }
  }

  return null;
}

export function matchProject(
  text: string,
  snapshot: Snapshot,
  clientId: number,
): Project | null {
  const words = tokens(text);
  const candidates = projectsOf(snapshot, clientId).filter((p) => p.status !== "done");
  let best: { project: Project; score: number } | null = null;
  for (const project of candidates) {
    const score = tokens(project.name).filter((w) => words.includes(w)).length;
    if (score > 0 && (!best || score > best.score)) best = { project, score };
  }
  return best?.project ?? null;
}

/** Strip the cues out of the sentence and leave something worth reading. */
export function titleFrom(
  text: string,
  date: DateGuess | null,
  time: TimeGuess | null = null,
): string {
  let title = text.trim();
  if (date) {
    title = title.replace(new RegExp(`\\b(by|on|before|until)?\\s*${date.phrase}\\b`, "i"), "");
  }
  if (time) {
    title = title.replace(new RegExp(`\\b(by|at|before|around)?\\s*${time.phrase}\\b`, "i"), "");
  }
  title = title
    .replace(/^\s*(waiting on|waiting for|waiting|still waiting on)\s+/i, "")
    .replace(/^\s*(i need to|i should|need to|remember to|todo:?|must)\s+/i, "")
    .replace(/\s+re:?\s+/i, " · ")
    .replace(/\s{2,}/g, " ")
    .replace(/[,\s]+$/, "")
    .trim();
  return title.charAt(0).toUpperCase() + title.slice(1);
}

export function parseCapture(
  text: string,
  snapshot: Snapshot,
  clock: Clock,
): CaptureGuess {
  const date = parseDate(text, clock);
  const time = parseTime(text);
  const { guess: clientGuess, ambiguous } = identify(text, snapshot);
  const named = clientGuess ? matchProject(text, snapshot, clientGuess.client.id) : null;
  // Failing a name in the sentence, the project the giveaway word usually keeps.
  const implied =
    clientGuess?.projectId != null
      ? (snapshot.projects.find((p) => p.id === clientGuess.projectId) ?? null)
      : null;

  return {
    title: titleFrom(text, date, time),
    client: clientGuess?.client ?? null,
    clientVia: clientGuess?.via ?? null,
    project: named ?? implied,
    contact: clientGuess?.contact ?? null,
    ambiguous,
    date,
    time,
  };
}
