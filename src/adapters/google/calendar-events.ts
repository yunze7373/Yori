/**
 * D11-GCAL-OAUTH: Google Calendar events.list (primary, read-only) mapped to the existing
 * CalendarEvent shape with parity to the S4 iCal adapter for the same events:
 * - id = iCalUID (the UID the iCal feed carries), else the Google event id;
 * - timed events -> UTC ISO (`Date#toISOString`), all-day -> `YYYY-MM-DDT00:00:00.000Z` + allDay;
 * - empty title -> 'Untitled Event'; cancelled events dropped; location text as-is; sorted by start.
 * Window now-2h .. now+24h, singleEvents (recurrences expanded by Google), minimal fields mask.
 * Description is not requested (privacy; the app does not use it).
 */

import type { CalendarEvent } from '../providers/ics-calendar-adapter.js';

export const GOOGLE_CALENDAR_FIELDS = 'items(id,iCalUID,status,summary,location,start,end)';

export type GoogleCalendarEvent = CalendarEvent & { readonly provenance: 'google_calendar' };

interface GoogleEventTime {
  readonly dateTime?: string;
  readonly date?: string;
  readonly timeZone?: string;
}

interface GoogleEventItem {
  readonly id?: string;
  readonly iCalUID?: string;
  readonly status?: string;
  readonly summary?: string;
  readonly location?: string;
  readonly start?: GoogleEventTime;
  readonly end?: GoogleEventTime;
}

function mapTime(t: GoogleEventTime | undefined): { iso: string; allDay: boolean } | null {
  if (!t) return null;
  if (typeof t.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date)) {
    return { iso: `${t.date}T00:00:00.000Z`, allDay: true };
  }
  if (typeof t.dateTime === 'string') {
    const ms = Date.parse(t.dateTime); // RFC 3339 with offset: the instant is unambiguous
    if (Number.isFinite(ms)) return { iso: new Date(ms).toISOString(), allDay: false };
  }
  return null;
}

export function mapGoogleCalendarItems(items: readonly unknown[]): GoogleCalendarEvent[] {
  const out: GoogleCalendarEvent[] = [];
  for (const raw of items) {
    const it = (raw ?? {}) as GoogleEventItem;
    if (it.status === 'cancelled') continue;
    const start = mapTime(it.start);
    if (!start) continue;
    const end = mapTime(it.end);
    const id = (typeof it.iCalUID === 'string' && it.iCalUID) || (typeof it.id === 'string' && it.id) || null;
    if (!id) continue;
    const title = typeof it.summary === 'string' && it.summary.trim() ? it.summary.trim() : 'Untitled Event';
    const location = typeof it.location === 'string' && it.location.trim() ? it.location.trim() : undefined;
    out.push({
      id,
      title,
      startTime: start.iso,
      endTime: end?.iso,
      location,
      allDay: start.allDay,
      provenance: 'google_calendar',
    });
  }
  // Same order as the iCal adapter (by start instant), so both sources feed the app identically.
  return out.sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
}

export function buildGoogleEventsListUrl(apiBase: string, nowMs: number): string {
  const q = new URLSearchParams({
    timeMin: new Date(nowMs - 2 * 3600_000).toISOString(),
    timeMax: new Date(nowMs + 24 * 3600_000).toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
    fields: GOOGLE_CALENDAR_FIELDS,
  });
  return `${apiBase}/calendar/v3/calendars/primary/events?${q.toString()}`;
}

export type GoogleEventsResult =
  | { readonly ok: true; readonly events: GoogleCalendarEvent[] }
  | { readonly ok: false; readonly reason: 'unauthorized' | 'provider_error' };

export async function fetchGoogleCalendarEvents(
  accessToken: string,
  options: { apiBase: string; nowMs?: number; fetchFn?: typeof fetch; timeoutMs?: number }
): Promise<GoogleEventsResult> {
  const fetchFn = options.fetchFn ?? ((...a) => fetch(...a));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  try {
    const resp = await fetchFn(buildGoogleEventsListUrl(options.apiBase, options.nowMs ?? Date.now()), {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (resp.status === 401 || resp.status === 403) return { ok: false, reason: 'unauthorized' };
    if (!resp.ok) return { ok: false, reason: 'provider_error' };
    const json = (await resp.json()) as { items?: unknown };
    return { ok: true, events: mapGoogleCalendarItems(Array.isArray(json.items) ? json.items : []) };
  } catch {
    return { ok: false, reason: 'provider_error' };
  } finally {
    clearTimeout(timer);
  }
}
