# Loops — product spec (v2: items, not loops)

> **Pickup instructions for a new session:** this is the product spec and
> design-decision record for "Loops", a personal desktop app for Fabian. The
> visual design lives in Claude Design project
> `5a1eb4d9-aae6-4f6b-85cd-5142cff6ee51` (file `Loops.dc.html`), mirrored at
> `docs/design/Loops.dc.html`. **Canonical artboards are 5a–5e and 6a–6f**
> (the first two `<section>`s); everything below them is archived exploration
> from the v1 "loop" model — do not inherit it.

## Why this app exists

Fabian is a frontend developer who also leads projects (often PM + main
developer on the same project). The calendar handles "do X at time Y" but
fails at: deadlines he owes, things he's *waiting on* (did the client reply?),
and undated intentions ("try that pipeline, whenever"). Loops is the morning
read that holds those three — single-user, local, no accounts.

## Structure

- **Clients** are the top level. Each has **projects** (Eurotransplant →
  "Eurotransplant Corporate", "Eurotransplant ETRL"; Klokgroep → "Klokgroep
  Projects", "Klokgroep Frontend") and **contacts** — the people actually
  talked to. Contact names are unique per client, not globally: two clients
  may each have a John, and capture asks which rather than guessing.
- Every **item** belongs to a client, optionally a project, optionally a
  contact.

## The three item kinds

1. **Todo** — always has a deadline, required at creation. The day *after*
   the deadline it becomes **critical**: the only red in the app, rendered as
   a card pinned above everything, until done or rescheduled. The reschedule
   popover offers Today / Tomorrow / Monday / pick a date, plus "It's done"
   and "Turn it into an idea" (drops the date).
2. **Idea** — never has a date. Ideas rest until a day with **no dated work
   anywhere** (no open todo due/overdue or undated, no waiting-on past its
   check-in): then the dashboard surfaces at most **3, oldest first**, with
   ideas that were **once started ranked ahead** of oldest. The day's three
   are chosen once, in the morning, persisted (`app_meta.ideas_of_day`), and
   stay chosen — picking one up doesn't hide the others. Each surfaced idea
   offers **Do it today** (promote) and **Not relevant** (archived as
   `dropped`, never deleted).
3. **Waiting-on** — the ball is in their court. Records when it was sent; an
   optional **check-in day** says when to go asking. When that day arrives,
   the item surfaces on the dashboard as a nudge. **Chase** logs the nudge and
   re-arms the check-in with the window originally given (clamped 2–14 days).
   **They replied** opens a two-way choice: *That settles it* (closed as
   `replied`) or *Now it's my move* (becomes a todo — asks for the required
   deadline).

### Promotion and demotion

- **Do it today** turns an idea into a **todo without a deadline** — the one
  exception to "todos require a deadline". It sits with today's work, shows
  "picked up today" and where it came from, and cannot go critical. A
  deadline can be added from its ⋯ menu; from then on it is a normal todo.
- **Back to an idea** demotes it. `started_on` survives, so a half-done
  thought shows "was in progress" and outranks oldest-first next time ideas
  surface. A never-promoted todo demoted via "Turn it into an idea" inherits
  its creation day as its idea age.

## Dashboard (Today)

Bands in order, each vanishing when empty: **Past its deadline** (critical
cards) → **Due today** (incl. promoted todos, listed first, with quick-done
check circles — the check is always on the row, never in the menu) → **Their
move — time to chase** (Chase / They replied buttons). Footers say what is
resting ("Four more waiting-ons are still inside their check-in window",
"Ideas stay put while deadlines exist — six are resting"). Only when all three
bands are empty does the ideas band appear. A day with nothing at all is the
quiet screen: "Nothing due, nobody waiting, no loose thoughts left."

The header is written prose, worst first, ending with permission to stop:
"One deadline went past. Two more land today, and Sanne still hasn't come
back to you. *Nothing else needs you.*"

## Capture (⌘⇧L, global)

One input, type chosen **explicitly** via a three-way toggle (Todo / Idea /
Waiting-on; ⌥←→ or ⌥1/2/3). Fields follow the type: Todo shows a required
deadline (prefilled from a date parsed out of the sentence — "fri", "in 3
days", "12 sep"), Idea shows none, Waiting-on shows an optional check-in.
Contact names route the item to client + project, shown as chips (`from
"Sanne"`); an ambiguous first name turns the chip into the question ("which
John?") without losing the typed text. Saving requires a client, and a
deadline when the type is Todo.

## Other screens

- **Client view**: written summary (worst first), projects with open counts
  and tone dots, contacts, action row (New todo / idea / waiting-on — opens
  capture pre-routed — and Add contact), then open items grouped Todos /
  Waiting on them / Ideas, with the archive count as a footer.
- **Archive**: everything closed (`done` / `replied` / `dropped`), grouped
  This week / by month, filterable by client. Nothing is ever deleted, only
  put down.
- **New client sheet**: name is all that's required (⏎ continues); the same
  sheet grows inline rows for projects and contacts; one save writes all.

## Rules the code keeps (unchanged voice)

- **Red means late, and nothing else.** Amber is a check-in that has arrived.
  Ideas never colour. Tones are decided in the domain, not per component.
- **Sentences, not counters.** Numbers get spelled out; headers end by giving
  permission to stop reading.
- **Empty bands vanish.** A good day is a shorter page.
- **Grey means fine** — a healthy client renders dim and says nothing; the
  sidebar badge is only "N late" (red) or "waiting" (amber).

## Implementation notes

- Schema: migration `0005_items.sql` replaced the loop-era tables with
  `items`; clients/projects/contacts carried over. CHECK constraints encode
  the kind rules (idea has no dates; todo needs a deadline or a `started_on`;
  waiting knows `sent_on`; closed records outcome + instant).
- Everything derives from an in-memory `Snapshot` (`src/db/repo.ts` →
  `src/domain/`); the idea-of-the-day choice is settled in
  `settleIdeasOfDay()` on every reload, before the snapshot is read.
- Time is injected (`src/lib/clock.ts`); days are local `YYYY-MM-DD`,
  instants UTC ISO — never mixed.
