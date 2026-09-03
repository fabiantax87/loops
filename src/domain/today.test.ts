import { beforeEach, describe, expect, it } from "vitest";
import { ManualClock } from "../lib/clock";
import { addDays, today } from "../lib/time";
import type { SqlDriver } from "../db/driver";
import {
  clients,
  contacts,
  items,
  loadSnapshot,
  projects,
  settleIdeasOfDay,
} from "../db/repo";
import { createTestDb } from "../test/sqlite";
import {
  buildToday,
  chaseDue,
  criticalTodos,
  dueTodayTodos,
  ideasOfToday,
} from "./today";
import type { Snapshot } from "./snapshot";

let db: SqlDriver;
let clock: ManualClock;
let euro: number;
let etrl: number;

/** Thursday 3 September 2026, 09:00 local — the day the design was drawn for. */
function morning(): ManualClock {
  return new ManualClock(new Date(2026, 8, 3, 9, 0));
}

async function snapshot(): Promise<Snapshot> {
  await settleIdeasOfDay(db, clock);
  return loadSnapshot(db);
}

beforeEach(async () => {
  db = await createTestDb();
  clock = morning();
  euro = await clients.create(db, clock, "Eurotransplant");
  etrl = await projects.create(db, clock, euro, "Eurotransplant ETRL");
});

async function todo(title: string, deadline: string, extra: Partial<Parameters<typeof items.create>[2]> = {}) {
  return items.create(db, clock, {
    clientId: euro,
    kind: "todo",
    title,
    deadline,
    ...extra,
  });
}

describe("critical todos", () => {
  it("goes critical the day after the deadline, not on it", async () => {
    await todo("Due today", today(clock));
    await todo("Slipped", addDays(today(clock), -3), { projectId: etrl });

    const critical = criticalTodos(await snapshot(), clock);
    expect(critical.map((r) => r.item.title)).toEqual(["Slipped"]);
    expect(critical[0].fact.tone).toBe("red");
    expect(critical[0].fact.text).toContain("3 days ago");
    expect(critical[0].where).toBe("Eurotransplant · Eurotransplant ETRL");
  });

  it("stays critical until done or rescheduled", async () => {
    const id = await todo("Slipped", addDays(today(clock), -1));
    expect(criticalTodos(await snapshot(), clock)).toHaveLength(1);

    await items.reschedule(db, clock, id, addDays(today(clock), 2));
    expect(criticalTodos(await snapshot(), clock)).toHaveLength(0);
  });
});

describe("due today", () => {
  it("holds today's deadlines and leaves tomorrow alone", async () => {
    await todo("Today", today(clock));
    await todo("Tomorrow", addDays(today(clock), 1));

    const due = dueTodayTodos(await snapshot(), clock);
    expect(due.map((r) => r.item.title)).toEqual(["Today"]);
  });

  it("keeps a promoted idea with today's work, first and unable to go red", async () => {
    await todo("Today", today(clock));
    const idea = await items.create(db, clock, {
      clientId: euro,
      kind: "idea",
      title: "Old thought",
    });
    await items.promote(db, clock, idea);

    const due = dueTodayTodos(await snapshot(), clock);
    expect(due.map((r) => r.item.title)).toEqual(["Old thought", "Today"]);
    expect(due[0].promoted).toBe(true);
    expect(due[0].where).toContain("was an idea since");

    // Days later it still sits with the day rather than going critical —
    // unlike the dated todo beside it, which now is.
    clock.advance({ days: 4 });
    expect(criticalTodos(await snapshot(), clock).map((r) => r.item.title)).toEqual([
      "Today",
    ]);
    expect(dueTodayTodos(await snapshot(), clock).map((r) => r.item.title)).toEqual([
      "Old thought",
    ]);
  });

  it("demoting a picked-up idea marks it as once in progress", async () => {
    const idea = await items.create(db, clock, {
      clientId: euro,
      kind: "idea",
      title: "Half done",
    });
    await items.promote(db, clock, idea);
    await items.demote(db, clock, idea);

    const shot = await snapshot();
    const item = shot.items.find((i) => i.id === idea);
    expect(item?.kind).toBe("idea");
    expect(item?.startedOn).toBe(today(clock));
    expect(item?.ideaSince).toBe(today(clock));
  });
});

describe("time to chase", () => {
  it("fires when the check-in day arrives and not before", async () => {
    const sanne = await contacts.create(db, clock, {
      clientId: euro,
      name: "Sanne de Vries",
    });
    await items.create(db, clock, {
      clientId: euro,
      contactId: sanne,
      kind: "waiting",
      title: "Sanne on the staging approval",
      checkinOn: addDays(today(clock), 2),
    });

    expect(chaseDue(await snapshot(), clock)).toHaveLength(0);
    clock.advance({ days: 2 });
    const due = chaseDue(await snapshot(), clock);
    expect(due).toHaveLength(1);
    expect(due[0].fact).toEqual({ text: "check-in today", tone: "amber" });
  });

  it("a waiting-on with no check-in never surfaces on its own", async () => {
    await items.create(db, clock, {
      clientId: euro,
      kind: "waiting",
      title: "Ida on the retainer",
    });
    clock.advance({ days: 60 });
    expect(chaseDue(await snapshot(), clock)).toHaveLength(0);
  });

  it("chasing buys another wait with the window you originally gave it", async () => {
    const id = await items.create(db, clock, {
      clientId: euro,
      kind: "waiting",
      title: "Legal on the addendum",
      checkinOn: addDays(today(clock), 4),
    });
    clock.advance({ days: 4 });
    expect(chaseDue(await snapshot(), clock)).toHaveLength(1);

    await items.chase(db, clock, id);
    const shot = await snapshot();
    expect(chaseDue(shot, clock)).toHaveLength(0);
    const item = shot.items.find((i) => i.id === id);
    expect(item?.checkinOn).toBe(addDays(today(clock), 4));
    expect(item?.chaseCount).toBe(1);
  });

  it("they replied — my move — turns it into a real todo with the deadline it asked for", async () => {
    const id = await items.create(db, clock, {
      clientId: euro,
      kind: "waiting",
      title: "Wende on the subprocessor list",
      checkinOn: today(clock),
    });
    await items.myMove(db, clock, id, addDays(today(clock), 3));

    const shot = await snapshot();
    const item = shot.items.find((i) => i.id === id);
    expect(item?.kind).toBe("todo");
    expect(item?.deadline).toBe(addDays(today(clock), 3));
    expect(chaseDue(shot, clock)).toHaveLength(0);
  });
});

describe("ideas of the day", () => {
  async function idea(title: string, createdDaysAgo: number, startedDaysAgo?: number) {
    const id = await items.create(db, clock, { clientId: euro, kind: "idea", title });
    await db.execute("UPDATE items SET idea_since = ?, started_on = ? WHERE id = ?", [
      addDays(today(clock), -createdDaysAgo),
      startedDaysAgo === undefined ? null : addDays(today(clock), -startedDaysAgo),
      id,
    ]);
    return id;
  }

  it("stays out of the way while anything dated exists", async () => {
    await todo("Today", today(clock));
    await idea("Oldest", 80);

    const model = buildToday(await snapshot(), clock);
    expect(model.mode).toBe("work");
    expect(model.ideas).toHaveLength(0);
    expect(model.ideasResting).toBe(1);
  });

  it("surfaces at most three on an empty day, oldest first, started ones ahead", async () => {
    await idea("June thought", 80);
    await idea("July thought", 60);
    await idea("August thought", 30);
    await idea("Fresh thought", 2);
    await idea("Once started", 40, 6);

    const model = buildToday(await snapshot(), clock);
    expect(model.mode).toBe("ideas");
    expect(model.ideas.map((r) => r.item.title)).toEqual([
      "Once started",
      "June thought",
      "July thought",
    ]);
    expect(model.ideas[0].wasInProgress).toBe(true);
    expect(model.ideasResting).toBe(2);
  });

  it("keeps the morning's choice when one is picked up or a deadline appears", async () => {
    await idea("June thought", 80);
    await idea("July thought", 60);
    const shot = await snapshot();
    const chosen = ideasOfToday(shot, clock).map((r) => r.item.id);
    expect(chosen).toHaveLength(2);

    // Picking one up turns it into today's work — the other stays put.
    await items.promote(db, clock, chosen[0]);
    const after = await snapshot();
    expect(ideasOfToday(after, clock).map((r) => r.item.id)).toEqual([chosen[1]]);
    const model = buildToday(after, clock);
    expect(model.dueToday).toHaveLength(1);
    expect(model.ideas).toHaveLength(1);
  });

  it("chooses afresh the next day", async () => {
    await idea("June thought", 80);
    const first = await snapshot();
    expect(ideasOfToday(first, clock)).toHaveLength(1);
    await items.close(db, clock, ideasOfToday(first, clock)[0].item.id, "dropped");

    clock.advance({ days: 1 });
    await idea("Newer thought", 10);
    const next = await snapshot();
    expect(ideasOfToday(next, clock).map((r) => r.item.title)).toEqual(["Newer thought"]);
  });

  it("marking one not relevant archives it rather than deleting it", async () => {
    const id = await idea("Stale thought", 90);
    await items.close(db, clock, id, "dropped");
    const shot = await snapshot();
    const item = shot.items.find((i) => i.id === id);
    expect(item?.status).toBe("closed");
    expect(item?.outcome).toBe("dropped");
  });
});

describe("the day's shape", () => {
  it("is quiet when nothing is due, nobody owes, and no ideas are left", async () => {
    await todo("Future", addDays(today(clock), 5));
    const model = buildToday(await snapshot(), clock);
    expect(model.mode).toBe("quiet");
  });

  it("writes the header in sentences", async () => {
    await todo("Slipped", addDays(today(clock), -1));
    await todo("Today", today(clock));
    const sanne = await contacts.create(db, clock, {
      clientId: euro,
      name: "Sanne de Vries",
    });
    await items.create(db, clock, {
      clientId: euro,
      contactId: sanne,
      kind: "waiting",
      title: "Sanne on the staging approval",
      checkinOn: today(clock),
    });

    const model = buildToday(await snapshot(), clock);
    expect(model.headline.lead).toBe(
      "One deadline went past. One more lands today. Sanne still hasn't come back to you.",
    );
    expect(model.headline.tail).toBe("Nothing else needs you.");
  });
});
