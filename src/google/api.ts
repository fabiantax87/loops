import type { Meeting, MeetingAttendee } from "../domain/calendar";
import type { Instant } from "../lib/time";

/**
 * The two Calendar API calls the app makes, and the mapping from Google's
 * event shape to the app's `Meeting`. Timed events arrive as RFC3339 with an
 * offset and are normalised to UTC instants; all-day events arrive as plain
 * dates and stay plain dates — converting those through UTC is how calendars
 * grow off-by-one bugs.
 */

const API = "https://www.googleapis.com/calendar/v3";

interface RawCalendar {
  id: string;
  summary?: string;
  summaryOverride?: string;
  primary?: boolean;
  deleted?: boolean;
}

interface RawEvent {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  description?: string;
  htmlLink?: string;
  hangoutLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: {
    email?: string;
    displayName?: string;
    self?: boolean;
    responseStatus?: string;
    resource?: boolean;
  }[];
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
}

async function httpFetch(): Promise<typeof globalThis.fetch> {
  const { fetch } = await import("@tauri-apps/plugin-http");
  return fetch as typeof globalThis.fetch;
}

async function call<T>(token: string, url: string): Promise<T> {
  const fetch = await httpFetch();
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Google Calendar said ${response.status}`);
  return (await response.json()) as T;
}

export interface CalendarListing {
  id: string;
  summary: string;
  primary: boolean;
}

export async function listCalendars(token: string): Promise<CalendarListing[]> {
  const listings: CalendarListing[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${API}/users/me/calendarList`);
    url.searchParams.set("minAccessRole", "reader");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const page = await call<{ items?: RawCalendar[]; nextPageToken?: string }>(
      token,
      url.toString(),
    );
    for (const raw of page.items ?? []) {
      if (raw.deleted) continue;
      listings.push({
        id: raw.id,
        summary: raw.summaryOverride ?? raw.summary ?? raw.id,
        primary: raw.primary ?? false,
      });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return listings;
}

function toMeeting(raw: RawEvent, calendarId: string): Meeting | null {
  const allDay = raw.start?.date !== undefined;
  if (!allDay && !raw.start?.dateTime) return null;

  const attendees: MeetingAttendee[] = (raw.attendees ?? [])
    .filter((a) => a.email && !a.resource)
    .map((a) => ({
      name: a.displayName ?? null,
      email: a.email as string,
      self: a.self ?? false,
      response: a.responseStatus ?? null,
    }));

  const meetUrl =
    raw.hangoutLink ??
    raw.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ??
    null;

  return {
    id: raw.id,
    calendarId,
    title: raw.summary?.trim() || "(untitled)",
    allDay,
    start: allDay ? null : new Date(raw.start!.dateTime!).toISOString(),
    end: allDay ? null : raw.end?.dateTime ? new Date(raw.end.dateTime).toISOString() : null,
    startDay: allDay ? (raw.start!.date as string) : null,
    endDay: allDay ? (raw.end?.date ?? null) : null,
    location: raw.location ?? null,
    description: raw.description ?? null,
    attendees,
    meetUrl,
    htmlLink: raw.htmlLink ?? null,
    status: raw.status ?? "confirmed",
  };
}

/** Every event touching the window, recurrences expanded, cancellations gone. */
export async function listEvents(
  token: string,
  calendarId: string,
  timeMin: Instant,
  timeMax: Instant,
): Promise<Meeting[]> {
  const meetings: Meeting[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${API}/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("maxResults", "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const page = await call<{ items?: RawEvent[]; nextPageToken?: string }>(
      token,
      url.toString(),
    );
    for (const raw of page.items ?? []) {
      if (raw.status === "cancelled") continue;
      const meeting = toMeeting(raw, calendarId);
      if (meeting) meetings.push(meeting);
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return meetings;
}
