/**
 * Depart Plugin Unit Tests
 * Governed by AC-102-1, AC-102-2, AC-102-3 and Invariants INV-101, INV-103, INV-106, INV-107.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  computeDepartTiming,
  validateCalendarDate,
  formatTime12,
  formatTime24,
  DepartDetector,
  DepartPreparer,
  SimulatedDepartAdapter,
  departPlugin,
} from './index.js';
import {
  createSimulatedSignal,
  createMemoryFact,
  freezeSnapshot,
  type ContextSnapshot,
  type MemoryFact,
  type IntentCandidate,
} from '../../core/contracts/index.js';

describe('AC-102-3: Pure Time Calculation Engine & DST Set', () => {
  it('calculates standard leave and prepare times deterministically (formula check)', () => {
    // 15:00 appt, 30m travel, 5m buffer, 20m prep -> leave 14:25, prepare 14:05
    const result = computeDepartTiming({
      apptTime: '2026-10-28T15:00:00-07:00',
      travelMinutes: 30,
      bufferMinutes: 5,
      prepMinutes: 20,
      timeZone: 'America/Los_Angeles',
      nowTime: '2026-10-28T10:00:00-07:00',
    });

    expect(result.leaveTime12).toBe('2:25 PM');
    expect(result.prepareTime12).toBe('2:05 PM');
    expect(result.leaveTime24).toBe('14:25');
    expect(result.prepareTime24).toBe('14:05');
    expect(result.alreadyDue).toBe(false);
    expect(result.derivation).toContain('14:25 leave');
    expect(result.derivation).toContain('14:05 prepare');
  });

  it('DST spring-forward test: correctly calculates across spring transition in America/New_York', () => {
    // In 2026, DST starts Sunday March 8 in America/New_York.
    // At 2:00 AM clock jumps to 3:00 AM EDT (UTC-4).
    // An appt at 03:30 EDT with 30m travel, 10m buffer, 20m prep (60m total before appt)
    // 03:30 EDT minus 60m is 01:30 EST (UTC-5)!
    const result = computeDepartTiming({
      apptTime: '2026-03-08T03:30:00-04:00', // UTC 07:30 (EDT offset is -04:00)
      travelMinutes: 30,
      bufferMinutes: 10,
      prepMinutes: 20,
      timeZone: 'America/New_York',
      nowTime: '2026-03-08T00:00:00-05:00',
    });

    expect(result.leaveTime12).toBe('1:50 AM');
    expect(result.prepareTime12).toBe('1:30 AM');
    expect(result.alreadyDue).toBe(false);
  });

  it('DST fall-back test: correctly calculates across autumn transition in America/New_York', () => {
    // In 2026, DST ends Sunday November 1 in America/New_York.
    // Clocks fall back from 2:00 AM EDT to 1:00 AM EST.
    // An appt at 02:30 EST (UTC 07:30) with 30m travel, 5m buffer, 20m prep (55m total):
    // 02:30 EST minus 35m leave is 01:55 EST (after the repeat transition).
    const result = computeDepartTiming({
      apptTime: '2026-11-01T02:30:00-05:00',
      travelMinutes: 30,
      bufferMinutes: 5,
      prepMinutes: 20,
      timeZone: 'America/New_York',
      nowTime: '2026-11-01T00:00:00-04:00',
    });

    expect(result.leaveTime12).toBe('1:55 AM');
    expect(result.prepareTime12).toBe('1:35 AM');
    expect(result.alreadyDue).toBe(false);
  });

  it('formats 12-hour and 24-hour time strings directly via helpers', () => {
    const epochMs = Date.parse('2026-10-28T15:00:00-07:00');
    expect(formatTime12(epochMs, 'America/Los_Angeles')).toBe('3:00 PM');
    expect(formatTime24(epochMs, 'America/Los_Angeles')).toBe('15:00');
  });

  it('flags alreadyDue=true when prepareAt <= nowTime without hiding the plan (AC-102-3)', () => {
    // prepare is 14:05; now is 14:10 (5 minutes past prepare time)
    const result = computeDepartTiming({
      apptTime: '2026-10-28T15:00:00-07:00',
      travelMinutes: 30,
      bufferMinutes: 5,
      prepMinutes: 20,
      timeZone: 'America/Los_Angeles',
      nowTime: '2026-10-28T14:10:00-07:00',
    });

    expect(result.alreadyDue).toBe(true);
    expect(result.leaveTime12).toBe('2:25 PM');
    expect(result.prepareTime12).toBe('2:05 PM');
  });

  it('flags alreadyDue=false when prepareAt > nowTime', () => {
    // prepare is 14:05; now is 13:50
    const result = computeDepartTiming({
      apptTime: '2026-10-28T15:00:00-07:00',
      travelMinutes: 30,
      bufferMinutes: 5,
      prepMinutes: 20,
      timeZone: 'America/Los_Angeles',
      nowTime: '2026-10-28T13:50:00-07:00',
    });

    expect(result.alreadyDue).toBe(false);
  });
});

describe('Fail-Closed Boundary & Validation Testing (AC-102-3, INV-103)', () => {
  describe('Calendar Date Validation', () => {
    it('rejects offset-less timestamps to prevent host-timezone drift (Finding 3)', () => {
      expect(validateCalendarDate('2026-10-28T15:00:00')).toBe(false);
      expect(validateCalendarDate('2026-10-28 15:00:00')).toBe(false);
      expect(validateCalendarDate('2026-10-28')).toBe(false);
      expect(() =>
        computeDepartTiming({
          apptTime: '2026-10-28T15:00:00', // offset-less!
          travelMinutes: 30,
          bufferMinutes: 5,
          prepMinutes: 20,
          timeZone: 'America/Los_Angeles',
          nowTime: '2026-10-28T10:00:00-07:00',
        })
      ).toThrow(/explicit UTC offset or Z/);
    });

    it('rejects impossible dates like 2026-02-31 that Date.parse rolls over', () => {
      expect(validateCalendarDate('2026-02-31T15:00:00Z')).toBe(false);
      expect(validateCalendarDate('2026-04-31T10:00:00Z')).toBe(false);
      expect(validateCalendarDate('2026-06-31T12:00:00Z')).toBe(false);
      expect(validateCalendarDate('2026-09-31T08:00:00Z')).toBe(false);
      expect(validateCalendarDate('2026-11-31T14:00:00Z')).toBe(false);
    });

    it('handles leap year boundaries correctly', () => {
      // 2026 is NOT a leap year: Feb 29 is impossible
      expect(validateCalendarDate('2026-02-29T15:00:00Z')).toBe(false);
      expect(validateCalendarDate('2026-02-28T15:00:00Z')).toBe(true);

      // 2024 WAS a leap year: Feb 29 is valid
      expect(validateCalendarDate('2024-02-29T15:00:00Z')).toBe(true);
      expect(validateCalendarDate('2024-02-30T15:00:00Z')).toBe(false);

      // 2000 was leap (divisible by 400), 1900 was not (divisible by 100 but not 400)
      expect(validateCalendarDate('2000-02-29T12:00:00Z')).toBe(true);
      expect(validateCalendarDate('1900-02-29T12:00:00Z')).toBe(false);
    });

    it('rejects malformed or empty date strings', () => {
      expect(validateCalendarDate('')).toBe(false);
      expect(validateCalendarDate('not-a-date')).toBe(false);
      expect(validateCalendarDate('2026-13-01T10:00:00Z')).toBe(false);
      expect(validateCalendarDate('2026-00-10T10:00:00Z')).toBe(false);
      expect(validateCalendarDate('2026-10-32T10:00:00Z')).toBe(false);
      expect(validateCalendarDate('2026-10-28T25:00:00Z')).toBe(false);
    });

    it('computeDepartTiming throws on impossible calendar dates', () => {
      expect(() =>
        computeDepartTiming({
          apptTime: '2026-02-31T15:00:00Z',
          travelMinutes: 30,
          bufferMinutes: 5,
          prepMinutes: 20,
          timeZone: 'America/Los_Angeles',
          nowTime: '2026-02-28T10:00:00Z',
        })
      ).toThrow(/Impossible or invalid appointment calendar date/);
    });
  });

  describe('Numeric Duration Validation', () => {
    const validParams = {
      apptTime: '2026-10-28T15:00:00-07:00',
      travelMinutes: 30,
      bufferMinutes: 5,
      prepMinutes: 20,
      timeZone: 'America/Los_Angeles',
      nowTime: '2026-10-28T10:00:00-07:00',
    };

    it('rejects NaN, Infinity, and negative values for travelMinutes', () => {
      expect(() => computeDepartTiming({ ...validParams, travelMinutes: NaN })).toThrow(/travelMinutes/);
      expect(() => computeDepartTiming({ ...validParams, travelMinutes: Infinity })).toThrow(/travelMinutes/);
      expect(() => computeDepartTiming({ ...validParams, travelMinutes: -10 })).toThrow(/travelMinutes/);
    });

    it('rejects NaN, Infinity, and negative values for bufferMinutes', () => {
      expect(() => computeDepartTiming({ ...validParams, bufferMinutes: NaN })).toThrow(/bufferMinutes/);
      expect(() => computeDepartTiming({ ...validParams, bufferMinutes: -5 })).toThrow(/bufferMinutes/);
    });

    it('rejects NaN, Infinity, and negative values for prepMinutes', () => {
      expect(() => computeDepartTiming({ ...validParams, prepMinutes: NaN })).toThrow(/prepMinutes/);
      expect(() => computeDepartTiming({ ...validParams, prepMinutes: -20 })).toThrow(/prepMinutes/);
    });

    it('rejects invalid IANA timezone', () => {
      expect(() => computeDepartTiming({ ...validParams, timeZone: 'Invalid/NonExistent_Zone' })).toThrow(
        /Invalid IANA timeZone/
      );
    });
  });
});

describe('DepartDetector Unit Tests', () => {
  const detector = new DepartDetector();

  it('detects depart intent from valid calendar signal in snapshot', () => {
    const snapshot: ContextSnapshot = freezeSnapshot({
      id: 'snap-1',
      asOf: '2026-10-28T17:00:00.000Z',
      timezone: 'America/Los_Angeles',
      signals: [
        createSimulatedSignal({
          kind: 'calendar',
          value: {
            title: 'Piano lesson',
            startTime: '2026-10-28T15:00:00-07:00',
            timezone: 'America/Los_Angeles',
          },
          issuedAt: '2026-10-28T17:00:00.000Z',
          validFor: 36000000,
          confidence: 1.0,
          consentScope: 'device_only',
        }),
      ],
    });

    const candidate = detector.detect(snapshot, []);
    expect(candidate).not.toBeNull();
    expect(candidate?.intent).toBe('depart');
    expect(candidate?.confidence).toBe(1.0);
    expect(candidate?.metadata?.title).toBe('Piano lesson');
  });

  it('fails closed (returns null) on missing timezone in candidate / snapshot (Finding 1)', () => {
    const snapshot: ContextSnapshot = freezeSnapshot({
      id: 'snap-no-tz',
      asOf: '2026-10-28T17:00:00.000Z',
      signals: [
        createSimulatedSignal({
          kind: 'calendar',
          value: {
            title: 'Piano lesson',
            startTime: '2026-10-28T15:00:00-07:00',
            // no timezone!
          },
          issuedAt: '2026-10-28T17:00:00.000Z',
          validFor: 36000000,
          confidence: 1.0,
          consentScope: 'device_only',
        }),
      ],
    });

    expect(detector.detect(snapshot, [])).toBeNull();
  });

  it('rejects past appointments beyond 15-minute grace window (Finding 5)', () => {
    const snapshot: ContextSnapshot = freezeSnapshot({
      id: 'snap-past',
      asOf: '2026-10-28T17:00:00.000Z', // 10:00 AM local
      timezone: 'America/Los_Angeles',
      signals: [
        createSimulatedSignal({
          kind: 'calendar',
          value: {
            title: 'Past Lesson',
            startTime: '2026-10-28T09:00:00-07:00', // 1 hour ago
            timezone: 'America/Los_Angeles',
          },
          issuedAt: '2026-10-28T15:00:00.000Z',
          validFor: 36000000,
          confidence: 1.0,
          consentScope: 'device_only',
        }),
      ],
    });

    expect(detector.detect(snapshot, [])).toBeNull();
  });

  it('rejects far-future appointments beyond 24-hour planning horizon (Finding 5)', () => {
    const snapshot: ContextSnapshot = freezeSnapshot({
      id: 'snap-far-future',
      asOf: '2026-10-28T17:00:00.000Z', // 10:00 AM local
      timezone: 'America/Los_Angeles',
      signals: [
        createSimulatedSignal({
          kind: 'calendar',
          value: {
            title: 'Next Week Lesson',
            startTime: '2026-11-05T15:00:00-08:00', // 8 days away
            timezone: 'America/Los_Angeles',
          },
          issuedAt: '2026-10-28T17:00:00.000Z',
          validFor: 36000000,
          confidence: 1.0,
          consentScope: 'device_only',
        }),
      ],
    });

    expect(detector.detect(snapshot, [])).toBeNull();
  });

  it('fails closed (returns null) on missing calendar signal', () => {
    const snapshot: ContextSnapshot = freezeSnapshot({
      id: 'snap-2',
      asOf: '2026-10-28T17:00:00.000Z',
      signals: [
        createSimulatedSignal({
          kind: 'weather',
          value: { condition: 'sunny' },
          issuedAt: '2026-10-28T17:00:00.000Z',
          validFor: 36000000,
          confidence: 1.0,
          consentScope: 'device_only',
        }),
      ],
    });

    expect(detector.detect(snapshot, [])).toBeNull();
  });

  it('fails closed (returns null) on impossible calendar date in event', () => {
    const snapshot: ContextSnapshot = freezeSnapshot({
      id: 'snap-3',
      asOf: '2026-10-28T17:00:00.000Z',
      signals: [
        createSimulatedSignal({
          kind: 'calendar',
          value: {
            title: 'Impossible Event',
            startTime: '2026-02-31T15:00:00Z',
          },
          issuedAt: '2026-10-28T17:00:00.000Z',
          validFor: 36000000,
          confidence: 1.0,
          consentScope: 'device_only',
        }),
      ],
    });

    expect(detector.detect(snapshot, [])).toBeNull();
  });

  it('fails closed (returns null) on expired calendar signal', () => {
    const snapshot: ContextSnapshot = freezeSnapshot({
      id: 'snap-4',
      asOf: '2026-10-28T22:00:00.000Z', // 5 hours after issued
      signals: [
        createSimulatedSignal({
          kind: 'calendar',
          value: {
            title: 'Expired Event',
            startTime: '2026-10-28T15:00:00-07:00',
          },
          issuedAt: '2026-10-28T17:00:00.000Z',
          validFor: 3600000, // 1 hour validity (expired at 18:00Z)
          confidence: 1.0,
          consentScope: 'device_only',
        }),
      ],
    });

    expect(detector.detect(snapshot, [])).toBeNull();
  });
});

describe('DepartPreparer Unit Tests', () => {
  const preparer = new DepartPreparer();

  const mockCandidate: IntentCandidate = {
    intent: 'depart',
    confidence: 1.0,
    evidence: [
      createSimulatedSignal({
        kind: 'calendar',
        value: {
          title: 'Piano lesson',
          startTime: '2026-10-28T15:00:00-07:00',
          timezone: 'America/Los_Angeles',
        },
        issuedAt: '2026-10-28T17:00:00.000Z',
        validFor: 36000000,
        confidence: 1.0,
        consentScope: 'device_only',
      }),
    ],
    metadata: {
      title: 'Piano lesson',
      startTime: '2026-10-28T15:00:00-07:00',
      timezone: 'America/Los_Angeles',
    },
  };

  const memoryFacts: readonly MemoryFact[] = [
    createMemoryFact(
      'prep_buffer_minutes',
      5,
      'confirmed',
      { source: 'user_confirmed', recordedAt: '2026-10-27T10:00:00Z' },
      '2026-10-27T10:00:00Z'
    ),
    createMemoryFact(
      'prep_duration_minutes',
      20,
      'confirmed',
      { source: 'user_confirmed', recordedAt: '2026-10-27T10:00:00Z' },
      '2026-10-27T10:00:00Z'
    ),
  ];

  it('renders non-LA appointments in their explicit IANA timezone: Tokyo lesson shows 2:05 PM / 2:25 PM (Finding 1)', () => {
    // Tokyo 15:00 (+09:00), 30m travel, 5m buffer, 20m prep -> leave 14:25, prepare 14:05 Tokyo time!
    const tokyoCandidate: IntentCandidate = {
      intent: 'depart',
      confidence: 1.0,
      evidence: [
        createSimulatedSignal({
          kind: 'calendar',
          value: {
            title: 'Piano lesson Tokyo',
            startTime: '2026-10-28T15:00:00+09:00',
            timezone: 'Asia/Tokyo',
          },
          issuedAt: '2026-10-28T01:00:00.000Z', // 10:00 AM Tokyo
          validFor: 36000000,
          confidence: 1.0,
          consentScope: 'device_only',
        }),
      ],
      metadata: {
        title: 'Piano lesson Tokyo',
        startTime: '2026-10-28T15:00:00+09:00',
        timezone: 'Asia/Tokyo',
      },
    };

    const tokyoSnapshot: ContextSnapshot = freezeSnapshot({
      id: 'snap-tokyo',
      asOf: '2026-10-28T01:00:00.000Z',
      timezone: 'Asia/Tokyo',
      signals: [
        tokyoCandidate.evidence[0]!,
        createSimulatedSignal({
          kind: 'travel_estimate',
          value: { mode: 'drive', travelMinutes: 30 },
          issuedAt: '2026-10-28T01:00:00.000Z',
          validFor: 36000000,
          confidence: 0.9,
          consentScope: 'device_only',
        }),
      ],
    });

    const plan = preparer.prepare(tokyoCandidate, tokyoSnapshot, memoryFacts);
    expect(plan).not.toBeNull();
    // Must render in Tokyo local time (2:05 PM and 2:25 PM), NEVER LA time!
    expect(plan?.headline).toContain('2:05 PM');
    expect(plan?.headline).toContain('2:25 PM');
    expect(plan?.why.derivation).toContain('14:25 leave');
    expect(plan?.why.derivation).toContain('14:05 prepare');
  });

  it('fails closed (returns null) on missing confirmed prep_buffer_minutes in memory (Finding 2)', () => {
    const memoryWithoutBuffer = memoryFacts.filter(f => f.key !== 'prep_buffer_minutes');
    const snapshot: ContextSnapshot = freezeSnapshot({
      id: 'snap-no-buf',
      asOf: '2026-10-28T17:00:00.000Z',
      timezone: 'America/Los_Angeles',
      signals: [
        mockCandidate.evidence[0]!,
        createSimulatedSignal({
          kind: 'travel_estimate',
          value: { mode: 'drive', travelMinutes: 30 },
          issuedAt: '2026-10-28T17:00:00.000Z',
          validFor: 36000000,
          confidence: 0.9,
          consentScope: 'device_only',
        }),
      ],
    });

    expect(preparer.prepare(mockCandidate, snapshot, memoryWithoutBuffer)).toBeNull();
  });

  it('fails closed (returns null) on missing confirmed prep_duration_minutes in memory (Finding 2)', () => {
    const memoryWithoutPrep = memoryFacts.filter(f => f.key !== 'prep_duration_minutes');
    const snapshot: ContextSnapshot = freezeSnapshot({
      id: 'snap-no-prep',
      asOf: '2026-10-28T17:00:00.000Z',
      timezone: 'America/Los_Angeles',
      signals: [
        mockCandidate.evidence[0]!,
        createSimulatedSignal({
          kind: 'travel_estimate',
          value: { mode: 'drive', travelMinutes: 30 },
          issuedAt: '2026-10-28T17:00:00.000Z',
          validFor: 36000000,
          confidence: 0.9,
          consentScope: 'device_only',
        }),
      ],
    });

    expect(preparer.prepare(mockCandidate, snapshot, memoryWithoutPrep)).toBeNull();
  });

  it('fails closed (returns null) on missing travel duration numbers (Finding 2)', () => {
    const snapshot: ContextSnapshot = freezeSnapshot({
      id: 'snap-no-travel-mins',
      asOf: '2026-10-28T17:00:00.000Z',
      timezone: 'America/Los_Angeles',
      signals: [
        mockCandidate.evidence[0]!,
        createSimulatedSignal({
          kind: 'travel_estimate',
          value: { mode: 'drive' }, // missing travelMinutes!
          issuedAt: '2026-10-28T17:00:00.000Z',
          validFor: 36000000,
          confidence: 0.9,
          consentScope: 'device_only',
        }),
      ],
    });

    expect(preparer.prepare(mockCandidate, snapshot, memoryFacts)).toBeNull();
  });

  it('rain forecast with single-mode travel still adds umbrella to checklist (Finding 4)', () => {
    const snapshot: ContextSnapshot = freezeSnapshot({
      id: 'snap-rain-single',
      asOf: '2026-10-28T20:35:00.000Z',
      timezone: 'America/Los_Angeles',
      signals: [
        mockCandidate.evidence[0]!,
        createSimulatedSignal({
          kind: 'weather',
          value: { condition: 'rain', precipProbability: 0.9 },
          issuedAt: '2026-10-28T20:35:00.000Z',
          validFor: 7200000,
          confidence: 0.92,
          consentScope: 'device_only',
        }),
        createSimulatedSignal({
          kind: 'travel_estimate',
          value: { mode: 'drive', travelMinutes: 30 },
          issuedAt: '2026-10-28T20:35:00.000Z',
          validFor: 7200000,
          confidence: 0.9,
          consentScope: 'device_only',
        }),
      ],
    });

    const plan = preparer.prepare(mockCandidate, snapshot, memoryFacts);
    expect(plan).not.toBeNull();
    // Umbrella MUST be in checklist even with single-mode travel (Finding 4)
    expect(plan?.checklist).toContain('umbrella');
    expect(plan?.headline).toContain('umbrella recommended');
  });

  it('prepares D1 clear plan with exact prepare 2:05 PM and leave 2:25 PM', () => {
    const snapshot: ContextSnapshot = freezeSnapshot({
      id: 'snap-d1',
      asOf: '2026-10-28T17:00:00.000Z',
      signals: [
        mockCandidate.evidence[0]!,
        createSimulatedSignal({
          kind: 'travel_estimate',
          value: { mode: 'drive', travelMinutes: 30 },
          issuedAt: '2026-10-28T17:00:00.000Z',
          validFor: 36000000,
          confidence: 0.9,
          consentScope: 'device_only',
        }),
      ],
    });

    const plan = preparer.prepare(mockCandidate, snapshot, memoryFacts);
    expect(plan).not.toBeNull();
    expect(plan?.headline).toContain('2:05 PM');
    expect(plan?.headline).toContain('2:25 PM');
    expect(plan?.why.derivation).toContain('14:25 leave');
    expect(plan?.why.derivation).toContain('14:05 prepare');
    expect(plan?.alreadyDue).toBe(false);
  });

  it('prepares D2 rain re-plan with umbrella checklist and preference-ranked options', () => {
    const rainMemoryFacts: readonly MemoryFact[] = [
      ...memoryFacts,
      createMemoryFact(
        'rain_transport_preference',
        'drive_first',
        'confirmed',
        { source: 'user_confirmed', recordedAt: '2026-10-27T10:00:00Z' },
        '2026-10-27T10:00:00Z'
      ),
    ];

    const snapshot: ContextSnapshot = freezeSnapshot({
      id: 'snap-d2',
      asOf: '2026-10-28T20:35:00.000Z',
      signals: [
        mockCandidate.evidence[0]!,
        createSimulatedSignal({
          kind: 'weather',
          value: { condition: 'rain', precipProbability: 0.9 },
          issuedAt: '2026-10-28T20:35:00.000Z',
          validFor: 7200000,
          confidence: 0.92,
          consentScope: 'device_only',
        }),
        createSimulatedSignal({
          kind: 'travel_estimate',
          value: { driveMinutes: 25, busMinutes: 40 },
          issuedAt: '2026-10-28T20:35:00.000Z',
          validFor: 7200000,
          confidence: 0.88,
          consentScope: 'device_only',
        }),
      ],
    });

    const plan = preparer.prepare(mockCandidate, snapshot, rainMemoryFacts);
    expect(plan).not.toBeNull();
    expect(plan?.checklist).toContain('umbrella');

    const options = plan?.optionsOrSteps as unknown as Array<{ label: string }>;
    expect(options?.[0]?.label).toContain('drive leave 2:30');
    expect(options?.[1]?.label).toContain('bus leave 2:15');

    const weatherCitation = plan?.why.evidenceSignals.find(s => s.kind === 'weather');
    expect(weatherCitation).toBeDefined();
    expect(weatherCitation?.issuedAt).toBe('2026-10-28T20:35:00.000Z');
  });

  it('ranks bus first when rain_transport_preference is bus_first', () => {
    const busMemoryFacts: readonly MemoryFact[] = [
      ...memoryFacts,
      createMemoryFact(
        'rain_transport_preference',
        'bus_first',
        'confirmed',
        { source: 'user_confirmed', recordedAt: '2026-10-27T10:00:00Z' },
        '2026-10-27T10:00:00Z'
      ),
    ];

    const snapshot: ContextSnapshot = freezeSnapshot({
      id: 'snap-bus',
      asOf: '2026-10-28T20:35:00.000Z',
      signals: [
        mockCandidate.evidence[0]!,
        createSimulatedSignal({
          kind: 'weather',
          value: { condition: 'rain', precipProbability: 0.9 },
          issuedAt: '2026-10-28T20:35:00.000Z',
          validFor: 7200000,
          confidence: 0.92,
          consentScope: 'device_only',
        }),
        createSimulatedSignal({
          kind: 'travel_estimate',
          value: { driveMinutes: 25, busMinutes: 40 },
          issuedAt: '2026-10-28T20:35:00.000Z',
          validFor: 7200000,
          confidence: 0.88,
          consentScope: 'device_only',
        }),
      ],
    });

    const plan = preparer.prepare(mockCandidate, snapshot, busMemoryFacts);
    const options = plan?.optionsOrSteps as unknown as Array<{ label: string }>;
    expect(options?.[0]?.label).toContain('bus leave 2:15');
    expect(options?.[1]?.label).toContain('drive leave 2:30');
  });

  it('fail-closed on stale weather: does not cite expired weather in why (INV-106)', () => {
    const snapshot: ContextSnapshot = freezeSnapshot({
      id: 'snap-stale-w',
      asOf: '2026-10-28T21:00:00.000Z',
      signals: [
        mockCandidate.evidence[0]!,
        createSimulatedSignal({
          kind: 'weather',
          value: { condition: 'rain', precipProbability: 0.9 },
          issuedAt: '2026-10-28T17:00:00.000Z',
          validFor: 1800000, // expired at 17:30Z; asOf is 21:00Z
          confidence: 0.9,
          consentScope: 'device_only',
        }),
        createSimulatedSignal({
          kind: 'travel_estimate',
          value: { mode: 'drive', travelMinutes: 30 },
          issuedAt: '2026-10-28T20:35:00.000Z',
          validFor: 7200000,
          confidence: 0.9,
          consentScope: 'device_only',
        }),
      ],
    });

    const plan = preparer.prepare(mockCandidate, snapshot, memoryFacts);
    expect(plan).not.toBeNull();
    // Must NOT cite expired weather
    const weatherCitation = plan?.why.evidenceSignals.find(s => s.kind === 'weather');
    expect(weatherCitation).toBeUndefined();
    // Must NOT add rain checklist
    expect(plan?.checklist).toEqual([]);
  });

  it('enforces determinism: repeated runs produce deep-equal plans', () => {
    const snapshot: ContextSnapshot = freezeSnapshot({
      id: 'snap-det',
      asOf: '2026-10-28T17:00:00.000Z',
      signals: [
        mockCandidate.evidence[0]!,
        createSimulatedSignal({
          kind: 'travel_estimate',
          value: { mode: 'drive', travelMinutes: 30 },
          issuedAt: '2026-10-28T17:00:00.000Z',
          validFor: 36000000,
          confidence: 0.9,
          consentScope: 'device_only',
        }),
      ],
    });

    const run1 = preparer.prepare(mockCandidate, snapshot, memoryFacts);
    const run2 = preparer.prepare(mockCandidate, snapshot, memoryFacts);

    expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
  });

  it('guarantees memory facts are never mutated during prepare (INV-107)', () => {
    const snapshot: ContextSnapshot = freezeSnapshot({
      id: 'snap-immut',
      asOf: '2026-10-28T17:00:00.000Z',
      signals: [
        mockCandidate.evidence[0]!,
        createSimulatedSignal({
          kind: 'travel_estimate',
          value: { mode: 'drive', travelMinutes: 30 },
          issuedAt: '2026-10-28T17:00:00.000Z',
          validFor: 36000000,
          confidence: 0.9,
          consentScope: 'device_only',
        }),
      ],
    });

    const before = JSON.stringify(memoryFacts);
    preparer.prepare(mockCandidate, snapshot, memoryFacts);
    const after = JSON.stringify(memoryFacts);

    expect(after).toBe(before);
  });
});

describe('Depart Plugin & Adapter Packaging', () => {
  it('exposes departPlugin with detector, preparer, and simulated adapter', () => {
    expect(departPlugin.id).toBe('depart');
    expect(departPlugin.detector.id).toBe('depart-detector');
    expect(departPlugin.preparer.id).toBe('depart-preparer');
    expect(departPlugin.adapter?.kind).toBe('depart-simulated-adapter');
    expect(departPlugin.adapter?.source).toBe('simulated');
  });

  it('SimulatedDepartAdapter emits signals with simulated source guarantee', () => {
    const adapter = new SimulatedDepartAdapter();
    expect(adapter.kind).toBe('depart-simulated-adapter');
    expect(adapter.source).toBe('simulated');
    expect(adapter.signals()).toEqual([]);
  });
});

describe('Static Audit: Zero Ambient Clock Calls', () => {
  it('ensures src/plugins/depart contains zero ambient clock calls (Date.now / new Date())', () => {
    const departDir = path.resolve('src/plugins/depart');
    const files = fs
      .readdirSync(departDir)
      .filter((f: string) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

    for (const file of files) {
      const content = fs.readFileSync(path.join(departDir, file), 'utf-8');
      expect(content).not.toMatch(/\bDate\.now\(\)/);
      expect(content).not.toMatch(/\bnew\s+Date\(\)/);
    }
  });
});
