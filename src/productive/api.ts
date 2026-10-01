import type { Booking } from "../domain/calendar";
import type { Day } from "../lib/time";

/**
 * The handful of Productive calls the app makes. Productive speaks JSON:API:
 * a booking carries its dates and minutes-per-day, and points at a service;
 * the service points at a deal (a budget), which is what knows the project
 * and the client company. Time-off bookings point at an event instead and
 * are not project time, so they are left out.
 */

const API = "https://api.productive.io/api/v2";
const PAGE_SIZE = 200;

export class Unauthorized extends Error {}

interface Resource {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, { data?: { id: string; type: string } | null }>;
}

interface Document {
  data: Resource | Resource[];
  included?: Resource[];
  meta?: { total_pages?: number };
  links?: { next?: string | null };
}

async function httpFetch(): Promise<typeof globalThis.fetch> {
  // The webview's own fetch is walled in by CORS; the plugin's goes via Rust.
  const { fetch } = await import("@tauri-apps/plugin-http");
  return fetch as typeof globalThis.fetch;
}

async function call(token: string, orgId: string, url: string): Promise<Document> {
  const fetch = await httpFetch();
  const response = await fetch(url, {
    headers: {
      "X-Auth-Token": token,
      "X-Organization-Id": orgId,
      "Content-Type": "application/vnd.api+json",
    },
  });
  if (response.status === 401 || response.status === 403) {
    throw new Unauthorized(`Productive said ${response.status}`);
  }
  if (!response.ok) throw new Error(`Productive said ${response.status}`);
  return (await response.json()) as Document;
}

function asList(data: Resource | Resource[]): Resource[] {
  return Array.isArray(data) ? data : [data];
}

function related(resource: Resource, name: string): string | null {
  return resource.relationships?.[name]?.data?.id ?? null;
}

function text(resource: Resource | undefined, name: string): string | null {
  const value = resource?.attributes?.[name];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/* ---- Who am I ------------------------------------------------------------ */

export interface Identity {
  personId: string;
  orgName: string | null;
}

/**
 * The person behind the token. Memberships are the direct route; a person
 * lookup by email is the fallback for tokens that don't expose one.
 */
export async function identify(
  token: string,
  orgId: string,
  email: string | null,
): Promise<Identity> {
  let personId: string | null = null;
  let orgName: string | null = null;

  try {
    const doc = await call(token, orgId, `${API}/organization_memberships`);
    const mine = asList(doc.data).find((m) => related(m, "organization") === orgId) ??
      asList(doc.data)[0];
    if (mine) {
      personId = related(mine, "person");
      const org = doc.included?.find((r) => r.type === "organizations" && r.id === orgId);
      orgName = text(org, "name");
    }
  } catch (error) {
    if (error instanceof Unauthorized) throw error;
  }

  if (!personId && email) {
    const url = new URL(`${API}/people`);
    url.searchParams.set("filter[email]", email);
    const doc = await call(token, orgId, url.toString());
    personId = asList(doc.data)[0]?.id ?? null;
  }

  if (!personId) {
    throw new Error(
      email
        ? "Productive knows the token but not who you are — check the email"
        : "Productive didn't say who the token belongs to — add your Productive email",
    );
  }

  if (!orgName) {
    try {
      const doc = await call(token, orgId, `${API}/organizations/${orgId}`);
      orgName = text(asList(doc.data)[0], "name");
    } catch {
      orgName = null;
    }
  }

  return { personId, orgName };
}

/* ---- Bookings ------------------------------------------------------------ */

const CANCELLED_STATUSES = new Set([3, 5]); // rejected, cancelled

function bookingUrl(orgId: string, id: string): string {
  return `https://app.productive.io/${orgId}/bookings/${id}`;
}

/** Every booking of the person touching the window, one row per booking. */
export async function listBookings(
  token: string,
  orgId: string,
  personId: string,
  fromDay: Day,
  toDay: Day,
): Promise<Booking[]> {
  const raw: Resource[] = [];
  const services = new Map<string, Resource>();
  let page = 1;
  let pages = 1;
  do {
    const url = new URL(`${API}/bookings`);
    url.searchParams.set("filter[person_id]", personId);
    url.searchParams.set("filter[after]", fromDay);
    url.searchParams.set("filter[before]", toDay);
    url.searchParams.set("include", "service");
    url.searchParams.set("page[size]", String(PAGE_SIZE));
    url.searchParams.set("page[number]", String(page));
    const doc = await call(token, orgId, url.toString());
    raw.push(...asList(doc.data));
    for (const r of doc.included ?? []) if (r.type === "services") services.set(r.id, r);
    pages = doc.meta?.total_pages ?? 1;
    page += 1;
  } while (page <= pages);

  // A service knows its deal; the deal knows the project and the company.
  // Deals repeat across bookings, so each is fetched once.
  const dealIds = new Set<string>();
  for (const service of services.values()) {
    const deal = related(service, "deal");
    if (deal) dealIds.add(deal);
  }
  const deals = new Map<string, { project: string | null; company: string | null }>();
  for (const dealId of dealIds) {
    const url = new URL(`${API}/deals/${dealId}`);
    url.searchParams.set("include", "project,company");
    try {
      const doc = await call(token, orgId, url.toString());
      const deal = asList(doc.data)[0];
      const find = (type: string, id: string | null) =>
        id ? doc.included?.find((r) => r.type === type && r.id === id) : undefined;
      deals.set(dealId, {
        project: text(find("projects", related(deal, "project")), "name") ?? text(deal, "name"),
        company: text(find("companies", related(deal, "company")), "name"),
      });
    } catch (error) {
      if (error instanceof Unauthorized) throw error;
      deals.set(dealId, { project: null, company: null });
    }
  }

  const bookings: Booking[] = [];
  for (const r of raw) {
    const a = r.attributes ?? {};
    if (a.canceled === true) continue;
    if (typeof a.approval_status === "number" && CANCELLED_STATUSES.has(a.approval_status)) continue;
    const serviceId = related(r, "service");
    if (!serviceId) continue; // time off, not project time
    const service = services.get(serviceId);
    const deal = deals.get(related(service ?? r, "deal") ?? "");
    const startDay = text(r, "started_on");
    const endDay = text(r, "ended_on") ?? startDay;
    const minutes = typeof a.time === "number" ? a.time : null;
    if (!startDay || !endDay || minutes === null || minutes <= 0) continue;
    bookings.push({
      id: r.id,
      project: deal?.project ?? text(service, "name") ?? "Project",
      client: deal?.company ?? null,
      startDay: startDay.slice(0, 10),
      endDay: endDay.slice(0, 10),
      minutesPerDay: minutes,
      note: text(r, "note"),
      url: bookingUrl(orgId, r.id),
      draft: a.draft === true,
    });
  }
  return bookings;
}
