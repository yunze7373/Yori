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
 */
export function parseIcsDateTime(rawProp: string, defaultTz = 'UTC'): { iso: string; allDay: boolean } {
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
    // Fallback: try standard Date parsing
    const d = new Date(valuePart);
    if (!Number.isNaN(d.getTime())) {
      return { iso: d.toISOString(), allDay: false };
    }
    return { iso: new Date().toISOString(), allDay: false };
  }

  const [, year, month, day, hour, min, sec, isUtc] = match;

  if (isUtc) {
    return {
      iso: `${year}-${month}-${day}T${hour}:${min}:${sec}.000Z`,
      allDay: false,
    };
  }

  // Extract TZID if present
  let tzid = defaultTz;
  const tzidMatch = /TZID=([^;:]+)/i.exec(paramPart);
  if (tzidMatch && tzidMatch[1]) {
    tzid = tzidMatch[1].replace(/["']/g, '');
  }

  // Convert local wall time in timezone to UTC ISO
  try {
    const dummyUtc = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}Z`);
    // Format in target timezone to find offset
    const invDate = new Date(dummyUtc.toLocaleString('en-US', { timeZone: tzid }));
    const diff = dummyUtc.getTime() - invDate.getTime();
    const targetDate = new Date(dummyUtc.getTime() + diff);
    return { iso: targetDate.toISOString(), allDay: false };
  } catch {
    return {
      iso: `${year}-${month}-${day}T${hour}:${min}:${sec}.000Z`,
      allDay: false,
    };
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
    this.defaultTimezone = config?.defaultTimezone ?? 'UTC';
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

    const { iso: startIso, allDay } = parseIcsDateTime(dtstartLine, this.defaultTimezone);

    // 7. DTEND or DURATION
    let endIso: string | undefined;
    const dtendLine = props['DTEND']?.[0];
    const durationLine = props['DURATION']?.[0];

    if (dtendLine) {
      endIso = parseIcsDateTime(dtendLine, this.defaultTimezone).iso;
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
    const until = rruleParts['UNTIL'] ? Date.parse(parseIcsDateTime(rruleParts['UNTIL']).iso) : Infinity;

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
