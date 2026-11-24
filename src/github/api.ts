import type { PullFate } from "../db/repo";
import type { Pull } from "../domain/types";

/**
 * The handful of GitHub calls the app makes. Pull requests that are yours to
 * move come from the search API — one query per way a pull request can be
 * yours — and a pull request that dropped out of those results is looked up
 * once on its own, to learn whether it merged, closed, or just stopped
 * needing you.
 */

const API = "https://api.github.com";
const PAGE_SIZE = 100;
/** Five hundred open pull requests per role is already somebody else's app. */
const MAX_PAGES = 5;

export class Unauthorized extends Error {}

async function httpFetch(): Promise<typeof globalThis.fetch> {
  // The webview's own fetch is walled in by CORS; the plugin's goes via Rust.
  const { fetch } = await import("@tauri-apps/plugin-http");
  return fetch as typeof globalThis.fetch;
}

async function call(token: string, url: string): Promise<Response> {
  const fetch = await httpFetch();
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  // 403 is also what a rate limit looks like, so only 401 means "bad token".
  if (response.status === 401) throw new Unauthorized("GitHub rejected the token");
  return response;
}

/** The login behind the token. */
export async function identify(token: string): Promise<string> {
  const response = await call(token, `${API}/user`);
  if (!response.ok) throw new Error(`GitHub said ${response.status}`);
  const user = (await response.json()) as { login?: string };
  if (!user.login) throw new Error("GitHub didn't say who the token belongs to");
  return user.login;
}

interface SearchItem {
  number: number;
  title: string;
  html_url: string;
  repository_url: string;
  draft?: boolean;
  created_at: string;
  updated_at: string;
  user?: { login?: string } | null;
}

interface SearchPage {
  incomplete_results?: boolean;
  items?: SearchItem[];
}

type Role = "authored" | "assigned" | "reviewRequested";

const QUALIFIER: Record<Role, string> = {
  authored: "author",
  assigned: "assignee",
  reviewRequested: "review-requested",
};

async function search(token: string, login: string, role: Role): Promise<SearchItem[]> {
  const found: SearchItem[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = new URL(`${API}/search/issues`);
    url.searchParams.set("q", `is:pr is:open archived:false ${QUALIFIER[role]}:${login}`);
    url.searchParams.set("per_page", String(PAGE_SIZE));
    url.searchParams.set("page", String(page));
    const response = await call(token, url.toString());
    if (!response.ok) throw new Error(`GitHub said ${response.status}`);
    const body = (await response.json()) as SearchPage;
    // A partial answer would read as "those pull requests are gone" and close
    // their todos. Better to fail this sync and try again in a few minutes.
    if (body.incomplete_results) throw new Error("GitHub's search came back incomplete");
    const items = body.items ?? [];
    found.push(...items);
    if (items.length < PAGE_SIZE) break;
  }
  return found;
}

/**
 * Every open pull request that is yours to move: written by you, assigned to
 * you, or waiting on your review (directly, or through a team you are on).
 * One row per pull request, however many of those are true at once.
 */
export async function listOpenPulls(token: string, login: string): Promise<Pull[]> {
  const byKey = new Map<string, Pull>();
  for (const role of ["authored", "assigned", "reviewRequested"] as Role[]) {
    for (const item of await search(token, login, role)) {
      const repo = item.repository_url.replace(`${API}/repos/`, "");
      const key = `${repo}#${item.number}`;
      const known = byKey.get(key) ?? {
        key,
        repo,
        number: item.number,
        title: item.title,
        url: item.html_url,
        author: item.user?.login ?? null,
        authored: false,
        assigned: false,
        reviewRequested: false,
        draft: item.draft === true,
        openedAt: new Date(item.created_at).toISOString(),
        updatedAt: new Date(item.updated_at).toISOString(),
      };
      known[role] = true;
      byKey.set(key, known);
    }
  }
  return [...byKey.values()];
}

interface PullDetail {
  state?: string;
  merged?: boolean;
  user?: { login?: string } | null;
  assignees?: { login?: string }[] | null;
  requested_reviewers?: { login?: string }[] | null;
}

/**
 * What became of a pull request that is no longer in the open set. A network
 * failure throws — the caller gives up on the whole sync rather than guess.
 */
export async function pullFate(token: string, login: string, pull: Pull): Promise<PullFate> {
  const response = await call(token, `${API}/repos/${pull.repo}/pulls/${pull.number}`);
  // The repository is gone, or no longer yours to see: it stopped needing you.
  if (response.status === 404 || response.status === 410) return "released";
  if (!response.ok) throw new Error(`GitHub said ${response.status}`);
  const detail = (await response.json()) as PullDetail;
  if (detail.merged) return "merged";
  if (detail.state === "closed") return "closed";

  const me = login.toLowerCase();
  const is = (who: { login?: string } | null | undefined) => who?.login?.toLowerCase() === me;
  const mine =
    is(detail.user) ||
    (detail.assignees ?? []).some(is) ||
    (detail.requested_reviewers ?? []).some(is);
  return mine ? "mine" : "released";
}
