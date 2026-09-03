import { describe, expect, it } from "vitest";
import { fixedClock } from "../lib/clock";
import type { Snapshot } from "./snapshot";
import { emptySnapshot } from "./snapshot";
import type { Client, Contact, Item, Project } from "./types";
import { parseCapture, parseDate, titleFrom } from "./capture";

/** Thursday 3 September 2026, 09:00 local. */
const clock = fixedClock(new Date(2026, 8, 3, 9, 0));

let nextId = 1;

function client(name: string): Client {
  return { id: nextId++, name, notes: null, archivedAt: null, createdAt: "" };
}

function project(clientId: number, name: string): Project {
  return { id: nextId++, clientId, name, status: "active", createdAt: "" };
}

function contact(clientId: number, name: string, projectId: number | null = null): Contact {
  return { id: nextId++, clientId, projectId, name, role: null, createdAt: "" };
}

function world(): Snapshot {
  const euro = client("Eurotransplant");
  const klok = client("Klokgroep");
  const ravel = client("Studio Ravel");
  const etrl = project(euro.id, "Eurotransplant ETRL");
  const corporate = project(euro.id, "Eurotransplant Corporate");
  const frontend = project(klok.id, "Klokgroep Frontend");
  const rebrand = project(ravel.id, "Ravel Rebrand");
  return {
    ...emptySnapshot,
    clients: [euro, klok, ravel],
    projects: [etrl, corporate, frontend, rebrand],
    contacts: [
      contact(euro.id, "Sanne de Vries", etrl.id),
      contact(klok.id, "Bram Hendriks", frontend.id),
      contact(klok.id, "John Verhoeven"),
      contact(ravel.id, "John Aalders", rebrand.id),
    ],
  };
}

describe("dates in a sentence", () => {
  it.each([
    ["send it tomorrow", 1],
    ["chase in 3 days", 3],
    ["review in two weeks", 14],
    ["done in a couple of days", 2],
  ])("%s → +%i days", (text, days) => {
    const guess = parseDate(text, clock);
    const expected = new Date(2026, 8, 3 + days);
    expect(guess?.day).toBe(
      `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, "0")}-${String(
        expected.getDate(),
      ).padStart(2, "0")}`,
    );
  });

  it("takes the next monday, and a bare '12 sep' as this year's", () => {
    expect(parseDate("ship it by mon", clock)?.day).toBe("2026-09-07");
    expect(parseDate("agreement by 12 sep", clock)?.day).toBe("2026-09-12");
  });

  it("rolls a date that already passed into next year", () => {
    expect(parseDate("plan the offsite for 14 feb", clock)?.day).toBe("2027-02-14");
  });

  it("shrugs at a sentence without one", () => {
    expect(parseDate("send Sanne the agreement", clock)).toBeNull();
  });
});

describe("routing by name", () => {
  it("files a contact's name under their client and project", () => {
    const guess = parseCapture("send Sanne the data-sharing agreement", world(), clock);
    expect(guess.client?.name).toBe("Eurotransplant");
    expect(guess.clientVia).toBe("Sanne de Vries");
    expect(guess.project?.name).toBe("Eurotransplant ETRL");
    expect(guess.contact?.name).toBe("Sanne de Vries");
    expect(guess.ambiguous).toBeNull();
  });

  it("a client named outright needs no contact", () => {
    const guess = parseCapture("klokgroep frontend deploy is broken", world(), clock);
    expect(guess.client?.name).toBe("Klokgroep");
    expect(guess.project?.name).toBe("Klokgroep Frontend");
  });

  it("asks which John rather than guessing", () => {
    const guess = parseCapture("get John the updated wireframes", world(), clock);
    expect(guess.client).toBeNull();
    expect(guess.ambiguous?.name).toBe("john");
    expect(guess.ambiguous?.candidates.map((c) => c.client.name).sort()).toEqual([
      "Klokgroep",
      "Studio Ravel",
    ]);
  });

  it("a full name is not a question", () => {
    const guess = parseCapture("get John Aalders the updated wireframes", world(), clock);
    expect(guess.ambiguous).toBeNull();
    expect(guess.client?.name).toBe("Studio Ravel");
    expect(guess.project?.name).toBe("Ravel Rebrand");
  });

  it("naming the company settles which John", () => {
    const guess = parseCapture("get John at Klokgroep the wireframes", world(), clock);
    expect(guess.ambiguous).toBeNull();
    expect(guess.client?.name).toBe("Klokgroep");
  });

  it("remembers a word only one client's items ever used", () => {
    const snapshot = world();
    const item: Item = {
      id: 999,
      clientId: snapshot.clients[0].id,
      projectId: snapshot.projects[0].id,
      contactId: null,
      kind: "todo",
      title: "Plan the staging migration",
      deadline: "2026-09-10",
      ideaSince: null,
      startedOn: null,
      sentOn: null,
      checkinOn: null,
      lastChasedOn: null,
      chaseCount: 0,
      status: "open",
      outcome: null,
      createdAt: "2026-08-01T09:00:00.000Z",
      updatedAt: "2026-08-01T09:00:00.000Z",
      closedAt: null,
    };
    const guess = parseCapture("ask about the staging window", { ...snapshot, items: [item] }, clock);
    expect(guess.client?.name).toBe("Eurotransplant");
    expect(guess.clientVia).toBe("staging");
    expect(guess.project?.name).toBe("Eurotransplant ETRL");
  });
});

describe("titles worth reading", () => {
  it("strips the date phrase and the throat-clearing", () => {
    const date = parseDate("need to send the estimate by friday", clock);
    expect(titleFrom("need to send the estimate by friday", date)).toBe("Send the estimate");
  });

  it("strips 'waiting on' — the toggle already says so", () => {
    expect(titleFrom("waiting on Marco re: staging approval", null)).toBe(
      "Marco · staging approval",
    );
  });
});
