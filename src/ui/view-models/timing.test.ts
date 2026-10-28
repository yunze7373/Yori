import { describe, it, expect } from 'vitest';
import { derivePlanTimingFacts } from './timing.js';
import { departPreparer } from '../../plugins/depart/preparer.js';
import { createUserRequestOverride } from '../../plugins/depart/request-override.js';
import {
  d1Scenario,
  d2Scenario,
  d1MemoryFacts,
  d2MemoryFacts,
} from '../../../tests/fixtures/index.js';
import { createFixedClock, replayScenarioTimeline } from '../../app/scenario-player/index.js';
import { formatTime } from '../living-context/presentation.js';
import {
  createMemoryFact,
  type IntentCandidate,
  type MemoryFact,
} from '../../core/contracts/index.js';

describe('Plan Timing Facts Derivation (LIVING_CONTEXT_V2.md §3 & §4)', () => {
  const d1Clock = createFixedClock('2026-10-28T20:30:00.000Z');
  const d1Snapshots = replayScenarioTimeline(d1Scenario, d1Clock);
  const d1Snapshot = d1Snapshots[d1Snapshots.length - 1]!;
  const d1Candidate: IntentCandidate = {
    intent: 'depart',
    confidence: 1.0,
    evidence: d1Snapshot.signals.filter(s => s.kind === 'calendar'),
  };

  const d2Clock = createFixedClock('2026-10-28T20:35:00.000Z');
  const d2Snapshots = replayScenarioTimeline(d2Scenario, d2Clock);
  const d2Snapshot = d2Snapshots[d2Snapshots.length - 1]!;
  const d2Candidate: IntentCandidate = {
    intent: 'depart',
    confidence: 1.0,
    evidence: d2Snapshot.signals.filter(s => s.kind === 'calendar'),
  };

  const d2MemoryBus: readonly MemoryFact[] = [
    ...d2MemoryFacts.filter(f => f.key !== 'rain_transport_preference'),
    createMemoryFact(
      'rain_transport_preference',
      'bus_first',
      'confirmed',
      { source: 'user_confirmed', recordedAt: '2026-10-27T10:00:00.000Z' },
      '2026-10-27T10:00:00.000Z'
    ),
  ];

  it('derives accurate timing for D1 Clear scene (travel 30, margin 5 -> +5 on time; +15 late by 10)', () => {
    // 1. Base D1 plan: 3:00 PM appt, 30m travel, 5m buffer -> 2:25 PM leave
    const basePlan = departPreparer.prepare(d1Candidate, d1Snapshot, d1MemoryFacts)!;
    expect(basePlan).toBeDefined();

    const baseTiming = derivePlanTimingFacts(basePlan);
    expect(baseTiming).toBeDefined();
    expect(baseTiming!.travelMinutes).toBe(30);
    expect(baseTiming!.bufferMinutes).toBe(5);
    expect(baseTiming!.marginMinutes).toBe(5);
    expect(baseTiming!.isLate).toBe(false);

    // 2. Safe option (+5m later): leave 2:30 PM, travel 30m -> arrive 3:00 PM (0m margin, on time)
    const safeOverride = createUserRequestOverride({
      kind: 'leave_later',
      deltaMinutes: 5,
      at: '2026-10-28T21:00:00.000Z',
    });
    const safePlan = departPreparer.prepareWithRequest(d1Candidate, d1Snapshot, d1MemoryFacts, safeOverride)!;
    const safeTiming = derivePlanTimingFacts(safePlan);
    expect(safeTiming).toBeDefined();
    expect(safeTiming!.travelMinutes).toBe(30);
    expect(safeTiming!.marginMinutes).toBe(0);
    expect(safeTiming!.isLate).toBe(false);
    expect(formatTime(safeTiming!.leaveAt, basePlan.timezone)).toBe('2:30 PM');
    expect(formatTime(safeTiming!.arrivalAt, basePlan.timezone)).toBe('3:00 PM');

    // 3. Late option (+15m later): leave 2:40 PM, travel 30m -> arrive 3:10 PM (late by 10m)
    const lateOverride = createUserRequestOverride({
      kind: 'leave_later',
      deltaMinutes: 15,
      at: '2026-10-28T21:00:00.000Z',
    });
    const latePlan = departPreparer.prepareWithRequest(d1Candidate, d1Snapshot, d1MemoryFacts, lateOverride)!;
    const lateTiming = derivePlanTimingFacts(latePlan);
    expect(lateTiming).toBeDefined();
    expect(lateTiming!.travelMinutes).toBe(30);
    expect(lateTiming!.marginMinutes).toBe(-10);
    expect(lateTiming!.isLate).toBe(true);
    expect(formatTime(lateTiming!.leaveAt, basePlan.timezone)).toBe('2:40 PM');
    expect(formatTime(lateTiming!.arrivalAt, basePlan.timezone)).toBe('3:10 PM');
  });

  it('derives accurate timing for D2 Rain Drive-recommended case (travel 25, margin 5)', () => {
    // Base D2 plan with drive_first: 3:00 PM appt, 25m drive, 5m buffer -> 2:30 PM leave
    const basePlan = departPreparer.prepare(d2Candidate, d2Snapshot, d2MemoryFacts)!;
    const baseTiming = derivePlanTimingFacts(basePlan);
    expect(baseTiming).toBeDefined();
    expect(baseTiming!.mode).toBe('drive');
    expect(baseTiming!.travelMinutes).toBe(25);
    expect(baseTiming!.marginMinutes).toBe(5);
    expect(baseTiming!.isLate).toBe(false);

    // Safe option (+5m later): leave 2:35 PM, arrive 3:00 PM (0m margin, on time)
    const safePlan = departPreparer.prepareWithRequest(
      d2Candidate,
      d2Snapshot,
      d2MemoryFacts,
      createUserRequestOverride({ kind: 'leave_later', deltaMinutes: 5, at: '2026-10-28T21:00:00.000Z' })
    )!;
    const safeTiming = derivePlanTimingFacts(safePlan);
    expect(formatTime(safeTiming!.leaveAt, basePlan.timezone)).toBe('2:35 PM');
    expect(formatTime(safeTiming!.arrivalAt, basePlan.timezone)).toBe('3:00 PM');
    expect(safeTiming!.marginMinutes).toBe(0);
    expect(safeTiming!.isLate).toBe(false);

    // Late option (+15m later): leave 2:45 PM, arrive 3:10 PM (late by 10m)
    const latePlan = departPreparer.prepareWithRequest(
      d2Candidate,
      d2Snapshot,
      d2MemoryFacts,
      createUserRequestOverride({ kind: 'leave_later', deltaMinutes: 15, at: '2026-10-28T21:00:00.000Z' })
    )!;
    const lateTiming = derivePlanTimingFacts(latePlan);
    expect(formatTime(lateTiming!.leaveAt, basePlan.timezone)).toBe('2:45 PM');
    expect(formatTime(lateTiming!.arrivalAt, basePlan.timezone)).toBe('3:10 PM');
    expect(lateTiming!.marginMinutes).toBe(-10);
    expect(lateTiming!.isLate).toBe(true);
  });

  it('derives accurate timing for D2 Rain Bus-recommended case (travel 40, margin 5)', () => {
    // Base D2 plan with bus_first: 3:00 PM appt, 40m bus, 5m buffer -> 2:15 PM leave
    const basePlan = departPreparer.prepare(d2Candidate, d2Snapshot, d2MemoryBus)!;
    const baseTiming = derivePlanTimingFacts(basePlan);
    expect(baseTiming).toBeDefined();
    expect(baseTiming!.mode).toBe('bus');
    expect(baseTiming!.travelMinutes).toBe(40);
    expect(baseTiming!.marginMinutes).toBe(5);
    expect(baseTiming!.isLate).toBe(false);
    expect(formatTime(baseTiming!.leaveAt, basePlan.timezone)).toBe('2:15 PM');

    // Safe option (+5m later): leave 2:20 PM, arrive 3:00 PM (0m margin, on time)
    const safePlan = departPreparer.prepareWithRequest(
      d2Candidate,
      d2Snapshot,
      d2MemoryBus,
      createUserRequestOverride({ kind: 'leave_later', deltaMinutes: 5, at: '2026-10-28T21:00:00.000Z' })
    )!;
    const safeTiming = derivePlanTimingFacts(safePlan);
    expect(formatTime(safeTiming!.leaveAt, basePlan.timezone)).toBe('2:20 PM');
    expect(formatTime(safeTiming!.arrivalAt, basePlan.timezone)).toBe('3:00 PM');
    expect(safeTiming!.marginMinutes).toBe(0);
    expect(safeTiming!.isLate).toBe(false);

    // Late option (+15m later): leave 2:30 PM, arrive 3:10 PM (late by 10m)
    const latePlan = departPreparer.prepareWithRequest(
      d2Candidate,
      d2Snapshot,
      d2MemoryBus,
      createUserRequestOverride({ kind: 'leave_later', deltaMinutes: 15, at: '2026-10-28T21:00:00.000Z' })
    )!;
    const lateTiming = derivePlanTimingFacts(latePlan);
    expect(formatTime(lateTiming!.leaveAt, basePlan.timezone)).toBe('2:30 PM');
    expect(formatTime(lateTiming!.arrivalAt, basePlan.timezone)).toBe('3:10 PM');
    expect(lateTiming!.marginMinutes).toBe(-10);
    expect(lateTiming!.isLate).toBe(true);
  });

  it('handles safeDelta = 0 edge case with honest margin calculation', () => {
    // Create zero-buffer memory (buffer = 0)
    const zeroBufferMemory: readonly MemoryFact[] = [
      ...d1MemoryFacts.filter(f => f.key !== 'prep_buffer_minutes'),
      createMemoryFact(
        'prep_buffer_minutes',
        0,
        'confirmed',
        { source: 'user_confirmed', recordedAt: '2026-10-27T10:00:00.000Z' },
        '2026-10-27T10:00:00.000Z'
      ),
    ];

    // Base plan: 3:00 PM appt, 30m travel, 0m buffer -> 2:30 PM leave, arrives 3:00 PM
    const basePlan = departPreparer.prepare(d1Candidate, d1Snapshot, zeroBufferMemory)!;
    const baseTiming = derivePlanTimingFacts(basePlan);
    expect(baseTiming).toBeDefined();
    expect(baseTiming!.marginMinutes).toBe(0); // safeDelta is 0
    expect(baseTiming!.isLate).toBe(false);

    // Late option with +15m shift: leave 2:45 PM, arrive 3:15 PM -> late by 15m!
    const latePlan = departPreparer.prepareWithRequest(
      d1Candidate,
      d1Snapshot,
      zeroBufferMemory,
      createUserRequestOverride({ kind: 'leave_later', deltaMinutes: 15, at: '2026-10-28T21:00:00.000Z' })
    )!;
    const lateTiming = derivePlanTimingFacts(latePlan);
    expect(lateTiming!.marginMinutes).toBe(-15);
    expect(lateTiming!.isLate).toBe(true);
  });
});
