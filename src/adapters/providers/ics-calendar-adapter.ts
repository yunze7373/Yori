/**
 * ICS (iCalendar RFC 5545) Calendar Adapter
 * Governed by LIVE_FIRST plan (PT:S4-LIVE-DEPART).
 *
 * Implements read-only iCalendar feed parsing.
 * Features:
 * - Line unfolding (RFC 5545 §3.1)
 * - VEVENT extraction (UID, SUMMARY, DTSTART, DTEND, DURATION, LOCATION, STATUS, RRULE)
 * - Timezone parsing (Z / UTC, TZID, and all-day VALUE=DATE)
 * - Cancellation filtering (STATUS:CANCELLED dropped)
 * - Basic recurrence expansion within planning horizon (FREQ=DAILY, FREQ=WEEKLY)
 * - Zero external dependencies; 100% deterministic and testable with synthetic feeds.
 */

export interface CalendarEvent {
  readonly id: string;
  readonly title: string;
  readonly startTime: string; // ISO 8601 string
  readonly endTime?: string;   // ISO 8601 string
  readonly location?: string;
  readonly allDay?: boolean;
  readonly status?: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';
  readonly description?: string;
}

export interface IcsCalendarAdapterConfig {
  readonly fetchFn?: typeof fetch;
  readonly defaultTimezone?: string;
}

/**
 * Common Windows Time Zone names mapped to canonical IANA Time Zone IDs.
 */
export const WINDOWS_TO_IANA_TZ: Record<string, string> = {
  'Dateline Standard Time': 'Etc/GMT+12',
  'UTC-11': 'Etc/GMT+11',
  'Hawaiian Standard Time': 'Pacific/Honolulu',
  'Alaskan Standard Time': 'America/Anchorage',
  'Pacific Standard Time': 'America/Los_Angeles',
  'Pacific Standard Time (Mexico)': 'America/Tijuana',
  'Mountain Standard Time': 'America/Denver',
  'Mountain Standard Time (Mexico)': 'America/Chihuahua',
  'Central Standard Time': 'America/Chicago',
  'Central Standard Time (Mexico)': 'America/Mexico_City',
  'Canada Central Standard Time': 'America/Regina',
  'Eastern Standard Time': 'America/New_York',
  'US Eastern Standard Time': 'America/Indianapolis',
  'Atlantic Standard Time': 'America/Halifax',
  'Newfoundland Standard Time': 'America/St_Johns',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'Korea Standard Time': 'Asia/Seoul',
  'China Standard Time': 'Asia/Shanghai',
  'Singapore Standard Time': 'Asia/Singapore',
  'Taipei Standard Time': 'Asia/Taipei',
  'W. Australia Standard Time': 'Australia/Perth',
  'AUS Central Standard Time': 'Australia/Darwin',
  'Cen. Australia Standard Time': 'Australia/Adelaide',
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'E. Australia Standard Time': 'Australia/Brisbane',
  'Tasmania Standard Time': 'Australia/Hobart',
  'New Zealand Standard Time': 'Pacific/Auckland',
  'Fiji Standard Time': 'Pacific/Fiji',
  'GMT Standard Time': 'Europe/London',
  'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Central Europe Standard Time': 'Europe/Budapest',
  'Romance Standard Time': 'Europe/Paris',
  'Central European Standard Time': 'Europe/Warsaw',
  'E. Europe Standard Time': 'Europe/Chisinau',
  'FLE Standard Time': 'Europe/Kyiv',
  'Israel Standard Time': 'Asia/Jerusalem',
  'Arabic Standard Time': 'Asia/Baghdad',
  'Arab Standard Time': 'Asia/Riyadh',
  'Russian Standard Time': 'Europe/Moscow',
  'Iran Standard Time': 'Asia/Tehran',
  'Arabian Standard Time': 'Asia/Dubai',
  'India Standard Time': 'Asia/Kolkata',
  'Sri Lanka Standard Time': 'Asia/Colombo',
  'Nepal Standard Time': 'Asia/Kathmandu',
  'Bangladesh Standard Time': 'Asia/Dhaka',
  'SE Asia Standard Time': 'Asia/Bangkok',
  'UTC': 'UTC',
};

/**
 * Resolves a timezone string (IANA or Windows name) to a valid IANA timezone.
 * Returns null if the timezone is unresolvable or invalid.
 */
export function resolveIanaTimezone(tzid: string): string | null {
  const clean = tzid.trim().replace(/^["']|["']$/g, '');
  if (WINDOWS_TO_IANA_TZ[clean]) {
    return WINDOWS_TO_IANA_TZ[clean];
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: clean });
    return clean;
  } catch {
    return null;
  }
}

/**
 * Converts wall time (year, month, day, hour, min, sec) in a given IANA timezone
 * to a UTC ISO string in a host-independent manner without local timezone bias.
 */
export function wallTimeToUtcIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  min: number,
  sec: number,
  timeZone: string
): string {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  });

  function getUtcFromParts(instant: Date): number {
    const parts = dtf.formatToParts(instant);
    const map: Record<string, string> = {};
    for (const p of parts) {
      map[p.type] = p.value;
    }
    return Date.UTC(
      parseInt(map['year'] || '0', 10),
      parseInt(map['month'] || '1', 10) - 1,
      parseInt(map['day'] || '1', 10),
      parseInt(map['hour'] || '0', 10),
      parseInt(map['minute'] || '0', 10),
      parseInt(map['second'] || '0', 10)
    );
  }

  const targetUtcMs = Date.UTC(year, month - 1, day, hour, min, sec);
  let guessMs = targetUtcMs;
  let formattedInTzMs = getUtcFromParts(new Date(guessMs));
  let diff = formattedInTzMs - targetUtcMs;
  guessMs -= diff;

  // Refine once for daylight saving time boundaries
  formattedInTzMs = getUtcFromParts(new Date(guessMs));
  diff = formattedInTzMs - targetUtcMs;
  guessMs -= diff;

  return new Date(guessMs).toISOString();
}

/**
 * Unfolds RFC 5545 content lines (lines starting with a single space or tab continue the previous line).
 */
export function unfoldIcsLines(raw: string): string[] {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const unfolded: string[] = [];

  for (const line of lines) {
    if (line.length === 0) continue;
    if ((line.startsWith(' ') || line.startsWith('\t')) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }

  return unfolded;
}

/**
 * Parses an iCalendar date or date-time string into an ISO string.
 * Supports:
 * - UTC format: 20261102T150000Z
 * - Date-only format: 20261102
 * - Local format with TZID parameter: TZID=America/Los_Angeles:20261102T150000
 * - Windows TZID: TZID=Tokyo Standard Time:20261102T150000
 * - Floating time: 20261102T150000 (interpreted using defaultTz, defaults to device timezone or UTC)
 *
 * Fails closed (returns null) on invalid syntax or unresolvable timezones.
 */
export function parseIcsDateTime(
  rawProp: string,
  defaultTz = 'UTC'
): { iso: string; allDay: boolean } | null {
  let paramPart = '';
  let valuePart = rawProp;

  const colonIdx = rawProp.indexOf(':');
  if (colonIdx !== -1) {
    paramPart = rawProp.slice(0, colonIdx);
    valuePart = rawProp.slice(colonIdx + 1).trim();
  }

  const isDateOnly = paramPart.includes('VALUE=DATE') || /^\d{8}$/.test(valuePart);
  if (isDateOnly) {
    const year = valuePart.slice(0, 4);
    const month = valuePart.slice(4, 6);
    const day = valuePart.slice(6, 8);
    return {
      iso: `${year}-${month}-${day}T00:00:00.000Z`,
      allDay: true,
    };
  }

  // Parse YYYYMMDDTHHMMSS[Z]
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(valuePart);
  if (!match) {
    const d = new Date(valuePart);
    if (!Number.isNaN(d.getTime())) {
      return { iso: d.toISOString(), allDay: false };
    }
    return null;
  }

  const [, yearStr = '', monthStr = '', dayStr = '', hourStr = '', minStr = '', secStr = '', isUtc] = match;
  const year = parseInt(yearStr || '0', 10);
  const month = parseInt(monthStr || '1', 10);
  const day = parseInt(dayStr || '1', 10);
  const hour = parseInt(hourStr || '0', 10);
  const min = parseInt(minStr || '0', 10);
  const sec = parseInt(secStr || '0', 10);

  if (isUtc) {
    return {
      iso: `${yearStr}-${monthStr}-${dayStr}T${hourStr}:${minStr}:${secStr}.000Z`,
      allDay: false,
    };
  }

  // Extract TZID if present
  let tzid = defaultTz;
  const tzidMatch = /TZID=([^;:]+)/i.exec(paramPart);
  if (tzidMatch && tzidMatch[1]) {
    tzid = tzidMatch[1].replace(/["']/g, '');
  }

  const resolvedTz = resolveIanaTimezone(tzid);
  if (!resolvedTz) {
    return null; // Fail closed on unknown/invalid TZID
  }

  try {
    const iso = wallTimeToUtcIso(year, month, day, hour, min, sec, resolvedTz);
    return { iso, allDay: false };
  } catch {
    return null;
  }
}

/**
 * Parses ISO 8601 duration (e.g. PT30M, PT1H, P1D).
 */
export function parseIcsDurationMs(durStr: string): number {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(durStr.trim());
  if (!match) return 0;
  const days = parseInt(match[1] || '0', 10);
  const hours = parseInt(match[2] || '0', 10);
  const mins = parseInt(match[3] || '0', 10);
  const secs = parseInt(match[4] || '0', 10);
  return (((days * 24 + hours) * 60 + mins) * 60 + secs) * 1000;
}

export class IcsCalendarAdapter {
  private readonly fetchFn: typeof fetch;
  private readonly defaultTimezone: string;

  constructor(config?: IcsCalendarAdapterConfig) {
    this.fetchFn = config?.fetchFn ?? globalThis.fetch;
    const hostTz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';
    const resolvedTz = config?.defaultTimezone
      ? resolveIanaTimezone(config.defaultTimezone)
      : (hostTz ? resolveIanaTimezone(hostTz) : null);
    this.defaultTimezone = resolvedTz ?? 'UTC';
  }

  /**
   * Fetches an iCalendar feed from a URL and parses it.
   */
  async fetchAndParse(feedUrl: string, horizonStartIso?: string, horizonEndIso?: string): Promise<CalendarEvent[]> {
    const resp = await this.fetchFn(feedUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/calendar, text/plain',
      },
    });

    if (!resp.ok) {
      throw new Error(`Calendar feed fetch failed: HTTP ${resp.status} ${resp.statusText}`);
    }

    const icsText = await resp.text();
    return this.parseIcsText(icsText, horizonStartIso, horizonEndIso);
  }

  /**
   * Parses raw iCalendar text into structured CalendarEvent records.
   */
  parseIcsText(icsText: string, horizonStartIso?: string, horizonEndIso?: string): CalendarEvent[] {
    const lines = unfoldIcsLines(icsText);
    const events: CalendarEvent[] = [];

    let inEvent = false;
    let currentProps: Record<string, string[]> = {};

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === 'BEGIN:VEVENT') {
        inEvent = true;
        currentProps = {};
        continue;
      }
      if (trimmed === 'END:VEVENT') {
        if (inEvent) {
          const parsed = this.processEventProps(currentProps, horizonStartIso, horizonEndIso);
          if (parsed.length > 0) {
            events.push(...parsed);
          }
          inEvent = false;
        }
        continue;
      }

      if (inEvent) {
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx !== -1) {
          const keyWithParams = trimmed.slice(0, colonIdx);
          const baseKey = keyWithParams.split(';')[0]?.toUpperCase() || '';
          if (!currentProps[baseKey]) {
            currentProps[baseKey] = [];
          }
          currentProps[baseKey]!.push(trimmed);
        }
      }
    }

    // Sort chronologically by startTime
    return events.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  private processEventProps(
    props: Record<string, string[]>,
    horizonStartIso?: string,
    horizonEndIso?: string
  ): CalendarEvent[] {
    // 1. Status check: ignore cancelled events
    const statusLine = props['STATUS']?.[0];
    if (statusLine) {
      const statusVal = statusLine.split(':')[1]?.trim().toUpperCase();
      if (statusVal === 'CANCELLED') {
        return [];
      }
    }

    // 2. Summary
    const summaryLine = props['SUMMARY']?.[0] || '';
    const title = summaryLine.slice(summaryLine.indexOf(':') + 1).trim() || 'Untitled Event';

    // 3. UID
    const uidLine = props['UID']?.[0] || '';
    const uid = uidLine.slice(uidLine.indexOf(':') + 1).trim() || `ics-${Math.random().toString(36).slice(2, 9)}`;

    // 4. Location
    const locLine = props['LOCATION']?.[0] || '';
    const location = locLine.slice(locLine.indexOf(':') + 1).trim() || undefined;

    // 5. Description
    const descLine = props['DESCRIPTION']?.[0] || '';
    const description = descLine.slice(descLine.indexOf(':') + 1).trim() || undefined;

    // 6. DTSTART
    const dtstartLine = props['DTSTART']?.[0];
    if (!dtstartLine) {
      return [];
    }

    const startParsed = parseIcsDateTime(dtstartLine, this.defaultTimezone);
    if (!startParsed) {
      return [];
    }
    const { iso: startIso, allDay } = startParsed;

    // 7. DTEND or DURATION
    let endIso: string | undefined;
    const dtendLine = props['DTEND']?.[0];
    const durationLine = props['DURATION']?.[0];

    if (dtendLine) {
      const endParsed = parseIcsDateTime(dtendLine, this.defaultTimezone);
      endIso = endParsed ? endParsed.iso : undefined;
    } else if (durationLine) {
      const durStr = durationLine.slice(durationLine.indexOf(':') + 1);
      const durMs = parseIcsDurationMs(durStr);
      endIso = new Date(Date.parse(startIso) + durMs).toISOString();
    }

    // 8. Recurrence (RRULE)
    const rruleLine = props['RRULE']?.[0];
    if (rruleLine && horizonStartIso && horizonEndIso) {
      return this.expandRecurrence(
        { id: uid, title, startTime: startIso, endTime: endIso, location, allDay, description },
        rruleLine.slice(rruleLine.indexOf(':') + 1),
        horizonStartIso,
        horizonEndIso
      );
    }

    return [
      {
        id: uid,
        title,
        startTime: startIso,
        endTime: endIso,
        location,
        allDay,
        description,
      },
    ];
  }

  private expandRecurrence(
    baseEvent: CalendarEvent,
    rrule: string,
    horizonStartIso: string,
    horizonEndIso: string
  ): CalendarEvent[] {
    const results: CalendarEvent[] = [];
    const hStart = Date.parse(horizonStartIso);
    const hEnd = Date.parse(horizonEndIso);
    const baseStart = Date.parse(baseEvent.startTime);
    const duration = baseEvent.endTime ? Date.parse(baseEvent.endTime) - baseStart : 3600000;

    const rruleParts = Object.fromEntries(
      rrule.split(';').map(p => {
        const [k, v] = p.split('=');
        return [k?.toUpperCase() || '', v || ''];
      })
    );

    const freq = rruleParts['FREQ'];
    const count = parseInt(rruleParts['COUNT'] || '100', 10);
    const untilParsed = rruleParts['UNTIL'] ? parseIcsDateTime(rruleParts['UNTIL']) : null;
    const until = untilParsed ? Date.parse(untilParsed.iso) : Infinity;

    let stepMs = 0;
    if (freq === 'DAILY') {
      stepMs = 86400000;
    } else if (freq === 'WEEKLY') {
      stepMs = 7 * 86400000;
    } else {
      // Fallback: just return base event if within horizon
      if (baseStart >= hStart && baseStart <= hEnd) {
        return [baseEvent];
      }
      return [];
    }

    let currentStart = baseStart;
    let iterations = 0;

    while (currentStart <= until && iterations < count) {
      if (currentStart >= hStart && currentStart <= hEnd) {
        results.push({
          ...baseEvent,
          id: `${baseEvent.id}-${new Date(currentStart).toISOString().slice(0, 10)}`,
          startTime: new Date(currentStart).toISOString(),
          endTime: new Date(currentStart + duration).toISOString(),
        });
      }
      currentStart += stepMs;
      iterations++;
    }

    return results;
  }
}
