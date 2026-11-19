import { describe, expect, it } from "vitest";
import { fixedClock } from "../lib/clock";
import { clientSignals } from "./sidebar";
import type { Snapshot } from "./snapshot";
import type { Client, Item } from "./types";

/* Monday 14 September 2026. */
const clock = fixedClock(new Date(2026, 8, 14, 10, 30));

function client(id: number, name: string): Client {
  return { id, name, notes: null, leading: false, archivedAt: null, createdAt: "" };
}

let nextId = 1;
function item(overrides: Partial<Item>): Item {
  const id = nextId++;
  return {
    id,
    clientId: 1,
    projectId: null,
    contactId: null,
    kind: "todo",
    title: `Item ${id}`,
    notes: null,
    deadline: null,
    deadlineTime: null,
    durationMinutes: null,
    ideaSince: null,
    startedOn: null,
    sentOn: null,
    checkinOn: null,
    checkinTime: null,
    lastChasedOn: null,
    chaseCount: 0,
    status: "open",
    outcome: null,
    createdAt: "",
    updatedAt: "",
    closedAt: null,
    ...overrides,
  };
}

const snapshot: Snapshot = {
  clients: [
    client(1, "Late"),
    client(2, "Today"),
    client(3, "Quiet"),
    client(4, "Checkin"),
    client(5, "PickedUp"),
  ],
  projects: [],
  contacts: [],
  items: [
    item({ clientId: 1, deadline: "2026-09-10" }),
    item({ clientId: 1, deadline: "2026-09-14" }),
    item({ clientId: 2, deadline: "2026-09-14" }),
    item({ clientId: 3, deadline: "2026-09-20" }),
    item({ clientId: 3, deadline: "2026-09-14", status: "closed", outcome: "done" }),
    item({ clientId: 4, kind: "waiting", sentOn: "2026-09-10", checkinOn: "2026-09-14" }),
    item({ clientId: 5, deadline: null, startedOn: "2026-09-14" }),
  ],
  ideasOfDay: null,
};

describe("clientSignals", () => {
  const byName = Object.fromEntries(
    clientSignals(snapshot, clock).map((s) => [s.client.name, s]),
  );

  it("keeps red ahead of green", () => {
    expect(byName.Late.tone).toBe("red");
  });

  it("goes green for a todo due today, without a word", () => {
    expect(byName.Today.tone).toBe("green");
    expect(byName.Today.badge).toBeNull();
    expect(byName.Today.fine).toBe(true);
  });

  it("goes green for a todo picked up from an idea — it has no date, so it is today's", () => {
    expect(byName.PickedUp.tone).toBe("green");
    expect(byName.PickedUp.badge).toBeNull();
  });

  it("goes amber, not green, for a check-in that is due", () => {
    // A check-in today is owed, and owed outranks today.
    expect(byName.Checkin.tone).toBe("amber");
  });

  it("stays grey when nothing is today, closed items included", () => {
    expect(byName.Quiet.tone).toBe("grey");
  });
});
