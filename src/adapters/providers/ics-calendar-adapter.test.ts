/**
 * S4-LIVE-DEPART: ICS Calendar Adapter Tests
 * Governed by LIVE_FIRST plan (PT:S4-LIVE-DEPART).
 *
 * Acceptance Checks:
 * 1. Line unfolding (RFC 5545 §3.1)
 * 2. VEVENT parsing with title, location, description
 * 3. Timezone conversion and UTC handling
 * 4. All-day event detection (VALUE=DATE)
 * 5. Cancellation filtering (STATUS:CANCELLED is dropped)
 * 6. Recurrence expansion (FREQ=DAILY, FREQ=WEEKLY)
 */

import { describe, it, expect } from 'vitest';
import {
  IcsCalendarAdapter,
  unfoldIcsLines,
  parseIcsDateTime,
} from './ics-calendar-adapter.js';

describe('S4-LIVE-DEPART: ICS Calendar Adapter', () => {
  it('unfolds RFC 5545 folded lines correctly', () => {
    const folded = [
      'SUMMARY:Piano Lesson with Maestro',
      '  Yoshida in Shibuya',
      'DESCRIPTION:Bring your sheet music',
      '\t and notebook for practice',
    ].join('\r\n');

    const unfolded = unfoldIcsLines(folded);
    expect(unfolded).toHaveLength(2);
    expect(unfolded[0]).toBe('SUMMARY:Piano Lesson with Maestro Yoshida in Shibuya');
    expect(unfolded[1]).toBe('DESCRIPTION:Bring your sheet music and notebook for practice');
  });

  it('parses UTC and date-only datetime values', () => {
    const utc = parseIcsDateTime('DTSTART:20261102T143000Z');
    expect(utc.allDay).toBe(false);
    expect(utc.iso).toBe('2026-11-02T14:30:00.000Z');

    const dateOnly = parseIcsDateTime('DTSTART;VALUE=DATE:20261103');
    expect(dateOnly.allDay).toBe(true);
    expect(dateOnly.iso).toBe('2026-11-03T00:00:00.000Z');
  });

  it('parses standard synthetic VEVENT feed with appointment, location, and description', () => {
    const syntheticIcs = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Yori//Test Feed//EN
BEGIN:VEVENT
UID:evt-piano-lesson-101
DTSTART:20261102T053000Z
DTEND:20261102T063000Z
SUMMARY:Piano Lesson
LOCATION:100 Van Ness Ave, San Francisco, CA
DESCRIPTION:Weekly session with instructor
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

    const adapter = new IcsCalendarAdapter();
    const events = adapter.parseIcsText(syntheticIcs);

    expect(events).toHaveLength(1);
    expect(events[0]!.id).toBe('evt-piano-lesson-101');
    expect(events[0]!.title).toBe('Piano Lesson');
    expect(events[0]!.startTime).toBe('2026-11-02T05:30:00.000Z');
    expect(events[0]!.endTime).toBe('2026-11-02T06:30:00.000Z');
    expect(events[0]!.location).toBe('100 Van Ness Ave, San Francisco, CA');
    expect(events[0]!.allDay).toBe(false);
    expect(events[0]!.description).toBe('Weekly session with instructor');
  });

  it('drops cancelled events (STATUS:CANCELLED)', () => {
    const syntheticIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:evt-active-1
DTSTART:20261102T090000Z
SUMMARY:Dentist Appointment
STATUS:CONFIRMED
END:VEVENT
BEGIN:VEVENT
UID:evt-cancelled-2
DTSTART:20261102T110000Z
SUMMARY:Cancelled Meeting
STATUS:CANCELLED
END:VEVENT
END:VCALENDAR`;

    const adapter = new IcsCalendarAdapter();
    const events = adapter.parseIcsText(syntheticIcs);

    expect(events).toHaveLength(1);
    expect(events[0]!.title).toBe('Dentist Appointment');
  });

  it('handles all-day events correctly', () => {
    const syntheticIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:evt-holiday-1
DTSTART;VALUE=DATE:20261103
SUMMARY:Culture Day Holiday
END:VEVENT
END:VCALENDAR`;

    const adapter = new IcsCalendarAdapter();
    const events = adapter.parseIcsText(syntheticIcs);

    expect(events).toHaveLength(1);
    expect(events[0]!.title).toBe('Culture Day Holiday');
    expect(events[0]!.allDay).toBe(true);
    expect(events[0]!.startTime).toBe('2026-11-03T00:00:00.000Z');
  });

  it('expands recurring events within horizon (FREQ=DAILY)', () => {
    const syntheticIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:evt-daily-standup
DTSTART:20261101T090000Z
DURATION:PT30M
RRULE:FREQ=DAILY;COUNT=5
SUMMARY:Daily Standup
LOCATION:Online
END:VEVENT
END:VCALENDAR`;

    const adapter = new IcsCalendarAdapter();
    const events = adapter.parseIcsText(
      syntheticIcs,
      '2026-11-02T00:00:00.000Z',
      '2026-11-03T23:59:59.000Z'
    );

    // Occurrences on 2026-11-02 and 2026-11-03 should be within horizon
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events.map(e => e.startTime.slice(0, 10))).toEqual(['2026-11-02', '2026-11-03']);
    expect(events[0]!.title).toBe('Daily Standup');
    expect(events[0]!.endTime).toBe('2026-11-02T09:30:00.000Z');
  });
});
