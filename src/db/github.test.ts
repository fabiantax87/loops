import { beforeEach, describe, expect, it } from "vitest";
import { buildClientPage } from "../domain/clientPage";
import { parseRepo, parseRepos } from "../domain/repos";
import { buildToday } from "../domain/today";
import type { Pull } from "../domain/types";
import { ManualClock } from "../lib/clock";
import { createTestDb } from "../test/sqlite";
import type { SqlDriver } from "./driver";
import { clients, githubPulls, items, loadSnapshot, projectRepos, projects } from "./repo";

let db: SqlDriver;
let clock: ManualClock;
let clientId: number;
let projectId: number;

const REPO = "linku/etrl-portal";

function pull(overrides: Partial<Pull> = {}): Pull {
  const number = overrides.number ?? 482;
  const repo = overrides.repo ?? REPO;
  return {
    key: `${repo}#${number}`,
    repo,
    number,
    title: "Fix date picker overflow",
    url: `https://github.com/${repo}/pull/${number}`,
    author: "sanne-dv",
    authored: false,
    assigned: false,
    reviewRequested: true,
    draft: false,
    openedAt: new Date(2026, 8, 10, 9).toISOString(),
    updatedAt: new Date(2026, 8, 10, 9).toISOString(),
    ...overrides,
  };
}

async function pullItems() {
  return (await loadSnapshot(db)).items.filter((i) => i.pullKey !== null);
}

beforeEach(async () => {
  db = await createTestDb();
  clock = new ManualClock(new Date(2026, 8, 14, 9));
  clientId = await clients.create(db, clock, "Eurotransplant");
  projectId = await projects.create(db, clock, clientId, "Eurotransplant ETRL");
  await projectRepos.setFor(db, projectId, [REPO]);
});

describe("a pull request becomes a todo", () => {
  it("files it under the repository's project, due a week after it opened, link in the notes", async () => {
    await githubPulls.replaceAll(db, clock, [pull()], new Map());

    const [todo] = await pullItems();
    expect(todo).toMatchObject({
      kind: "todo",
      status: "open",
      clientId,
      projectId,
      deadline: "2026-09-17",
      title: "Review PR #482: Fix date picker overflow",
      pullKey: "linku/etrl-portal#482",
    });
    expect(todo.notes).toContain("https://github.com/linku/etrl-portal/pull/482");
  });

  it("words your own pull request as something to get merged", async () => {
    await githubPulls.replaceAll(
      db,
      clock,
      [pull({ authored: true, reviewRequested: false, author: "fabiantax87" })],
      new Map(),
    );
    expect((await pullItems())[0].title).toBe("Get PR #482 merged: Fix date picker overflow");
  });

  it("goes critical on Today once the week has passed, like any other todo", async () => {
    await githubPulls.replaceAll(db, clock, [pull()], new Map());
    expect(buildToday(await loadSnapshot(db), clock).critical).toHaveLength(0);

    clock.set(new Date(2026, 8, 18, 9));
    const critical = buildToday(await loadSnapshot(db), clock).critical;
    expect(critical.map((r) => r.item.pullKey)).toEqual(["linku/etrl-portal#482"]);
  });

  it("arrives already critical when the pull request has sat for longer than a week", async () => {
    const old = pull({ openedAt: new Date(2026, 7, 20, 9).toISOString() });
    await githubPulls.replaceAll(db, clock, [old], new Map());
    expect(buildToday(await loadSnapshot(db), clock).critical).toHaveLength(1);
  });

  it("makes one todo however many syncs see the pull request", async () => {
    await githubPulls.replaceAll(db, clock, [pull()], new Map());
    await githubPulls.replaceAll(db, clock, [pull({ title: "Renamed" })], new Map());
    expect(await pullItems()).toHaveLength(1);
  });

  it("leaves a rescheduled deadline alone", async () => {
    await githubPulls.replaceAll(db, clock, [pull()], new Map());
    const [todo] = await pullItems();
    await items.reschedule(db, clock, todo.id, "2026-09-30");
    await githubPulls.replaceAll(db, clock, [pull()], new Map());
    expect((await pullItems())[0].deadline).toBe("2026-09-30");
  });

  it("does not come back after being ticked off by hand while the pull request stays open", async () => {
    await githubPulls.replaceAll(db, clock, [pull()], new Map());
    const [todo] = await pullItems();
    await items.close(db, clock, todo.id, "done");
    await githubPulls.replaceAll(db, clock, [pull()], new Map());

    const all = await pullItems();
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe("closed");
  });
});

describe("a pull request that leaves takes its todo with it", () => {
  beforeEach(async () => {
    await githubPulls.replaceAll(db, clock, [pull()], new Map());
  });

  it("closes the todo as done when it merged", async () => {
    await githubPulls.replaceAll(db, clock, [], new Map([[pull().key, "merged"]]));
    const [todo] = await pullItems();
    expect(todo).toMatchObject({ status: "closed", outcome: "done" });
    expect((await loadSnapshot(db)).pulls).toHaveLength(0);
  });

  it("closes it as dropped when the pull request was closed unmerged", async () => {
    await githubPulls.replaceAll(db, clock, [], new Map([[pull().key, "closed"]]));
    expect((await pullItems())[0]).toMatchObject({ status: "closed", outcome: "dropped" });
  });

  it("closes it as done when the review was given and the request went away", async () => {
    await githubPulls.replaceAll(db, clock, [], new Map([[pull().key, "released"]]));
    expect((await pullItems())[0]).toMatchObject({ status: "closed", outcome: "done" });
  });

  it("keeps everything when GitHub's search merely lost sight of it", async () => {
    await githubPulls.replaceAll(db, clock, [], new Map([[pull().key, "mine"]]));
    expect((await pullItems())[0].status).toBe("open");
    expect((await loadSnapshot(db)).pulls).toHaveLength(1);
  });

  it("gives a second review round a fresh todo with a fresh week", async () => {
    await githubPulls.replaceAll(db, clock, [], new Map([[pull().key, "released"]]));
    clock.set(new Date(2026, 8, 25, 9));
    await githubPulls.replaceAll(db, clock, [pull()], new Map());

    const all = await pullItems();
    expect(all.map((i) => i.status)).toEqual(["closed", "open"]);
    expect(all[1].deadline).toBe("2026-10-02");
  });
});

describe("repositories and projects", () => {
  it("makes no todo for a repository no project claims — until one does", async () => {
    const stray = pull({ repo: "linku/internal-tools", number: 12 });
    await githubPulls.replaceAll(db, clock, [stray], new Map());
    expect(await pullItems()).toHaveLength(0);

    await projectRepos.setFor(db, projectId, [REPO, "Linku/Internal-Tools"]);
    await githubPulls.ensureTodos(db, clock);
    expect((await pullItems()).map((i) => i.pullKey)).toEqual(["linku/internal-tools#12"]);
  });

  it("moves a repository when another project names it", async () => {
    const other = await projects.create(db, clock, clientId, "Eurotransplant Corporate");
    await projectRepos.setFor(db, other, [REPO]);
    expect((await loadSnapshot(db)).repos).toEqual([{ repo: REPO, projectId: other }]);
  });

  it("lists a client's open pull requests per project, oldest first, red only when late", async () => {
    const fresh = pull({ number: 490, openedAt: new Date(2026, 8, 13, 9).toISOString() });
    const old = pull({ number: 401, openedAt: new Date(2026, 8, 1, 9).toISOString() });
    await githubPulls.replaceAll(db, clock, [fresh, old], new Map());

    const page = buildClientPage(await loadSnapshot(db), clock, clientId);
    expect(page.pulls).toHaveLength(1);
    expect(page.pulls[0].name).toBe("ETRL");
    expect(page.pulls[0].rows.map((r) => [r.pull.number, r.fact.text, r.fact.tone])).toEqual([
      [401, "open 13 days", "red"],
      [490, "open 1 day", "grey"],
    ]);
    expect(page.pulls[0].rows[0].where).toBe(
      "linku/etrl-portal #401 · sanne-dv asked for your review",
    );
  });
});

describe("parseRepo", () => {
  it("reads the ways a repository gets pasted", () => {
    expect(parseRepo("linku/etrl-portal")).toBe("linku/etrl-portal");
    expect(parseRepo("https://github.com/linku/etrl-portal")).toBe("linku/etrl-portal");
    expect(parseRepo("https://github.com/linku/etrl-portal/pull/482")).toBe("linku/etrl-portal");
    expect(parseRepo("git@github.com:linku/etrl-portal.git")).toBe("linku/etrl-portal");
    expect(parseRepo("etrl-portal")).toBeNull();
  });

  it("splits a field, drops repeats, and says what it couldn't read", () => {
    expect(parseRepos("linku/a, linku/b  LINKU/A nonsense")).toEqual({
      repos: ["linku/a", "linku/b"],
      bad: ["nonsense"],
    });
  });
});
