/**
 * Continuous Simulated Day Timeline
 * Governed by CONTEXT-TIMELINE (TID: INBOX-20261101-070938) and North-Star Reaudit.
 *
 * Stitches existing fixtures (D1 clear depart, D2 rain re-plan, D3 lunch away) into a
 * single continuous narrative timeline driven by context changes rather than scene selection.
 *
 * Sequence of Beats:
 * - S0 (10:00 AM): Morning calm at Home (clear weather; quiet state)
 * - S1 (~11:50 AM): Arrive in Downtown for lunch (intent-lunch + candidate cards)
 * - S1q (~12:00 PM): Suppressed beat after "Not now" on lunch ("Okay — I'll stay quiet about lunch today" + budget meter)
 * - S2 (~1:20 PM): Return Home, Piano lesson at 3:00 PM enters planning window (depart plan: leave 2:25 PM)
 * - S3 (1:35 PM): Rain forecast issued (leave moved to 2:30 PM, umbrella, habit re-rank)
 */

import {
  type Scenario,
  type ContextSnapshot,
  type ContextSignal,
  type MemoryFact,
  type SuppressionReason,
  createSimulatedSignal,
  createMemoryFact,
  freezeSnapshot,
} from '../../core/contracts/index.js';
import { YoriStorage } from '../../core/storage/index.js';

export const CONTINUOUS_TIMEZONE = 'America/Los_Angeles';

export type TimelineBeatId = 'S0' | 'S1' | 'S1q' | 'S2' | 'S3';

export interface TimelineBeat {
  readonly id: TimelineBeatId;
  readonly name: string;
  readonly clockIso: string;
  readonly timeDisplay: string;
  readonly weatherDisplay: string;
  readonly placeDisplay: string;
  readonly livingHeaderLine: string;
  readonly isSuppressedBeat?: boolean;
}

export const TIMELINE_BEATS: readonly TimelineBeat[] = Object.freeze([
  {
    id: 'S0',
    name: 'Morning Calm',
    clockIso: '2026-10-28T17:00:00.000Z',
    timeDisplay: '10:00 AM',
    weatherDisplay: 'Clear',
    placeDisplay: 'Home',
    livingHeaderLine: '10:00 AM · Clear · Home',
  },
  {
    id: 'S1',
    name: 'Lunch in Downtown',
    clockIso: '2026-10-28T18:50:00.000Z',
    timeDisplay: '11:50 AM',
    weatherDisplay: 'Clear',
    placeDisplay: 'Downtown',
    livingHeaderLine: '11:50 AM · Clear · Downtown',
  },
  {
    id: 'S1q',
    name: 'Lunch Dismissed (Quiet)',
    clockIso: '2026-10-28T19:00:00.000Z',
    timeDisplay: '12:00 PM',
    weatherDisplay: 'Clear',
    placeDisplay: 'Downtown',
    livingHeaderLine: '12:00 PM · Clear · Downtown',
    isSuppressedBeat: true,
  },
  {
    id: 'S2',
    name: 'Piano Lesson Depart (Clear)',
    clockIso: '2026-10-28T20:20:00.000Z',
    timeDisplay: '1:20 PM',
    weatherDisplay: 'Clear',
    placeDisplay: 'Home',
    livingHeaderLine: '1:20 PM · Clear · Home',
  },
  {
    id: 'S3',
    name: 'Rain Re-plan (The Change Moment)',
    clockIso: '2026-10-28T20:35:00.000Z',
    timeDisplay: '1:35 PM',
    weatherDisplay: 'Rain from 2:00',
    placeDisplay: 'Home',
    livingHeaderLine: '1:35 PM · Rain from 2:00 · Home',
  },
]);

export const CONTINUOUS_MEMORY_FACTS: readonly MemoryFact[] = Object.freeze([
  createMemoryFact(
    'prep_buffer_minutes',
    5,
    'confirmed',
    { source: 'user_confirmed', recordedAt: '2026-10-27T10:00:00.000Z' },
    '2026-10-27T10:00:00.000Z'
  ),
  createMemoryFact(
    'prep_duration_minutes',
    20,
    'confirmed',
    { source: 'user_confirmed', recordedAt: '2026-10-27T10:00:00.000Z' },
    '2026-10-27T10:00:00.000Z'
  ),
  createMemoryFact(
    'rain_transport_preference',
    'drive_first',
    'confirmed',
    { source: 'user_confirmed', recordedAt: '2026-10-27T10:00:00.000Z' },
    '2026-10-27T10:00:00.000Z'
  ),
  createMemoryFact(
    'taste_preference',
    'ramen_or_salad',
    'confirmed',
    { source: 'user_confirmed', recordedAt: '2026-10-25T10:00:00.000Z' },
    '2026-10-25T10:00:00.000Z'
  ),
  createMemoryFact(
    'favorite_cuisine',
    'japanese',
    'confirmed',
    { source: 'user_confirmed', recordedAt: '2026-10-25T10:00:00.000Z' },
    '2026-10-25T10:00:00.000Z'
  ),
]);

export interface TimelineEvent {
  readonly at: string;
  readonly signal: ContextSignal;
}

export const CONTINUOUS_TIMELINE_EVENTS: readonly TimelineEvent[] = Object.freeze([
  // 10:00 AM local (17:00:00Z) - S0: Morning Calm
  {
    at: '2026-10-28T17:00:00.000Z',
    signal: createSimulatedSignal({
      kind: 'weather',
      value: {
        condition: 'clear',
        precipProbability: 0.0,
      },
      issuedAt: '2026-10-28T17:00:00.000Z',
      validFor: 36000000,
      confidence: 0.95,
      consentScope: 'device_only',
    }),
  },
  {
    at: '2026-10-28T17:00:00.000Z',
    signal: createSimulatedSignal({
      kind: 'location_status',
      value: {
        isHome: true,
        currentArea: 'Home',
      },
      issuedAt: '2026-10-28T17:00:00.000Z',
      validFor: 7200000,
      confidence: 0.95,
      consentScope: 'device_only',
    }),
  },

  // 11:50 AM local (18:50:00Z) - S1 & S1q: Lunch Away
  {
    at: '2026-10-28T18:50:00.000Z',
    signal: createSimulatedSignal({
      kind: 'location_status',
      value: {
        isHome: false,
        currentArea: 'Downtown',
      },
      issuedAt: '2026-10-28T18:50:00.000Z',
      validFor: 3600000,
      confidence: 0.95,
      consentScope: 'device_only',
    }),
  },
  {
    at: '2026-10-28T18:50:00.000Z',
    signal: createSimulatedSignal({
      kind: 'schedule_window',
      value: {
        freeUntil: '2026-10-28T13:30:00-07:00',
        nextEvent: 'Team Sync at 13:30',
      },
      issuedAt: '2026-10-28T18:50:00.000Z',
      validFor: 3600000,
      confidence: 1.0,
      consentScope: 'device_only',
    }),
  },
  {
    at: '2026-10-28T18:50:00.000Z',
    signal: createSimulatedSignal({
      kind: 'eating_status',
      value: {
        eatenToday: false,
        lastMeal: 'Breakfast 08:30',
      },
      issuedAt: '2026-10-28T18:50:00.000Z',
      validFor: 3600000,
      confidence: 0.9,
      consentScope: 'device_only',
    }),
  },
  {
    at: '2026-10-28T18:50:00.000Z',
    signal: createSimulatedSignal({
      kind: 'mock_places',
      value: [
        {
          id: 'mock-place-1',
          name: 'Demo Place A · Ramen',
          cuisine: 'japanese',
          distanceMinutes: 5,
          noiseLevel: 'lively',
          vegetarian: false,
        },
        {
          id: 'mock-place-2',
          name: 'Demo Place B · Salad',
          cuisine: 'salad',
          distanceMinutes: 7,
          noiseLevel: 'quiet',
          vegetarian: true,
        },
        {
          id: 'mock-place-3',
          name: 'Demo Place C · Sushi',
          cuisine: 'japanese',
          distanceMinutes: 10,
          noiseLevel: 'quiet',
          vegetarian: false,
        },
        {
          id: 'mock-place-4',
          name: 'Demo Place D · Fast Food',
          cuisine: 'fast_food',
          distanceMinutes: 8,
          noiseLevel: 'moderate',
          vegetarian: false,
        },
      ],
      issuedAt: '2026-10-28T18:50:00.000Z',
      validFor: 3600000,
      confidence: 0.85,
      consentScope: 'device_only',
    }),
  },

  // 1:20 PM local (20:20:00Z) - S2: Depart Piano Lesson (Clear)
  {
    at: '2026-10-28T20:20:00.000Z',
    signal: createSimulatedSignal({
      kind: 'calendar',
      value: {
        title: 'Piano lesson',
        startTime: '2026-10-28T15:00:00-07:00',
        endTime: '2026-10-28T16:00:00-07:00',
        location: 'Piano Studio',
      },
      issuedAt: '2026-10-28T20:20:00.000Z',
      validFor: 36000000,
      confidence: 1.0,
      consentScope: 'device_only',
    }),
  },
  {
    at: '2026-10-28T20:20:00.000Z',
    signal: createSimulatedSignal({
      kind: 'travel_estimate',
      value: {
        mode: 'drive',
        travelMinutes: 30,
      },
      issuedAt: '2026-10-28T20:20:00.000Z',
      validFor: 7200000,
      confidence: 0.9,
      consentScope: 'device_only',
    }),
  },

  // 1:35 PM local (20:35:00Z) - S3: Rain Forecast Issued (The Change Moment)
  {
    at: '2026-10-28T20:35:00.000Z',
    signal: createSimulatedSignal({
      kind: 'weather',
      value: {
        condition: 'rain',
        precipProbability: 0.9,
        rainfall: 'moderate',
      },
      issuedAt: '2026-10-28T20:35:00.000Z',
      validFor: 7200000,
      confidence: 0.92,
      consentScope: 'device_only',
    }),
  },
  {
    at: '2026-10-28T20:35:00.000Z',
    signal: createSimulatedSignal({
      kind: 'travel_estimate',
      value: {
        driveMinutes: 25,
        busMinutes: 40,
      },
      issuedAt: '2026-10-28T20:35:00.000Z',
      validFor: 7200000,
      confidence: 0.88,
      consentScope: 'device_only',
    }),
  },
]);

export const CONTINUOUS_DAY_SCENARIO: Scenario = Object.freeze({
  id: 'fixture-continuous-day',
  title: 'Continuous Simulated Day: Morning -> Lunch -> Depart Clear -> Rain Re-plan',
  timezone: CONTINUOUS_TIMEZONE,
  description: 'One continuous simulated day driving perception -> memory -> intent -> preparation',
  timeline: CONTINUOUS_TIMELINE_EVENTS,
});

/**
 * Builds an active ContextSnapshot for a given clock timestamp.
 * Later signals supersede earlier signals of the same kind.
 * Signals whose validFor duration has passed are pruned.
 */
export function buildSnapshotAt(
  clockIso: string,
  events: readonly TimelineEvent[] = CONTINUOUS_TIMELINE_EVENTS,
  timezone: string = CONTINUOUS_TIMEZONE
): ContextSnapshot {
  const clockMs = Date.parse(clockIso);
  const eligible = events.filter(e => Date.parse(e.at) <= clockMs);

  // Group latest active signal per kind
  const activeMap = new Map<string, ContextSignal>();
  for (const ev of eligible) {
    const issuedMs = Date.parse(ev.signal.issuedAt);
    if (!ev.signal.validFor || clockMs - issuedMs <= ev.signal.validFor) {
      activeMap.set(ev.signal.kind, ev.signal);
    } else {
      activeMap.delete(ev.signal.kind);
    }
  }

  return freezeSnapshot({
    id: `continuous-snap-${clockIso}`,
    asOf: clockIso,
    timezone,
    signals: Array.from(activeMap.values()),
  });
}

export interface ContinuousTimelineControllerOptions {
  readonly autoPlay?: boolean;
  readonly stepIntervalMs?: number;
  readonly storage?: YoriStorage;
  readonly onUpdate?: (beat: TimelineBeat) => void;
}

/**
 * ContinuousTimelineController
 * Manages the simulated day clock, beat transitions, auto-advancement, and state synchronization.
 */
export class ContinuousTimelineController {
  private currentBeatIndex: number = 0;
  private isAutoPlaying: boolean = false;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private readonly stepIntervalMs: number;
  private readonly storage?: YoriStorage;
  private readonly subscribers = new Set<(beat: TimelineBeat) => void>();

  constructor(options: ContinuousTimelineControllerOptions = {}) {
    this.stepIntervalMs = options.stepIntervalMs ?? 6000;
    this.storage = options.storage;
    if (options.onUpdate) {
      this.subscribers.add(options.onUpdate);
    }
    if (options.autoPlay) {
      this.play();
    }
  }

  public getCurrentBeat(): TimelineBeat {
    return TIMELINE_BEATS[this.currentBeatIndex]!;
  }

  public getSnapshot(): ContextSnapshot {
    return buildSnapshotAt(this.getCurrentBeat().clockIso);
  }

  public getClockIso(): string {
    return this.getCurrentBeat().clockIso;
  }

  public isPlaying(): boolean {
    return this.isAutoPlaying;
  }

  public play(): void {
    if (this.isAutoPlaying) return;
    this.isAutoPlaying = true;
    this.scheduleNextTick();
    this.notifySubscribers();
  }

  public pause(): void {
    if (!this.isAutoPlaying) return;
    this.isAutoPlaying = false;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.notifySubscribers();
  }

  public togglePlay(): void {
    if (this.isAutoPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  public step(): TimelineBeat {
    let nextIndex = (this.currentBeatIndex + 1) % TIMELINE_BEATS.length;
    const nextBeat = TIMELINE_BEATS[nextIndex]!;
    if (nextBeat.id === 'S1q') {
      // S1q is reached only if lunch was dismissed. If not dismissed, stepping skips S1q to S2
      if (!this.isLunchSuppressedInStorage()) {
        nextIndex = (nextIndex + 1) % TIMELINE_BEATS.length;
      }
    }
    return this.goToIndex(nextIndex);
  }

  public isLunchSuppressedInStorage(): boolean {
    if (!this.storage) return false;
    try {
      const envelope = this.storage.load();
      return (envelope?.payload.suppressions ?? []).some(
        s => s.targetIntent === 'lunch' && s.code === 'user_suppressed'
      );
    } catch {
      return false;
    }
  }

  public simulateDismissLunch(source: 'simulated_user' | 'user' = 'simulated_user'): TimelineBeat {
    if (this.storage) {
      try {
        const envelope = this.storage.load();
        const existing = envelope?.payload.suppressions ?? [];
        const suppressions: SuppressionReason[] = existing.filter(
          s => !(s.code === 'user_suppressed' && s.targetIntent === 'lunch')
        );
        suppressions.push({
          code: 'user_suppressed',
          reason:
            source === 'simulated_user'
              ? 'Demo: simulated tap on Not now'
              : "User dismissed: Don't suggest this today",
          scope: 'today',
          recordedAt: '2026-10-28T18:55:00.000Z',
          targetIntent: 'lunch',
        });

        const currentCount = envelope?.payload.promptBudget?.count ?? 0;
        this.storage.save(
          {
            memoryFacts: envelope?.payload.memoryFacts ?? [],
            proposals: envelope?.payload.proposals ?? [],
            suppressions,
            promptBudget: { date: '2026-10-28', count: Math.max(1, currentCount) },
            acceptedPlanIds: envelope?.payload.acceptedPlanIds ?? [],
          },
          '2026-10-28T19:00:00.000Z'
        );
      } catch {
        // storage error ignored
      }
    }
    return this.goTo('S1q');
  }

  public goTo(beatId: TimelineBeatId): TimelineBeat {
    const idx = TIMELINE_BEATS.findIndex(b => b.id === beatId);
    if (idx === -1) {
      throw new Error(`Unknown timeline beat ID: ${beatId}`);
    }
    return this.goToIndex(idx);
  }

  public restart(): TimelineBeat {
    if (this.storage) {
      try {
        const envelope = this.storage.load();
        if (envelope) {
          // Reset suppressions and prompt budget for clean restart
          this.storage.save(
            {
              ...envelope.payload,
              suppressions: envelope.payload.suppressions.filter(s => s.targetIntent !== 'lunch'),
              promptBudget: { date: '2026-10-28', count: 0 },
              acceptedPlanIds: [],
            },
            TIMELINE_BEATS[0]!.clockIso
          );
        }
      } catch {
        // storage error ignored
      }
    }
    return this.goToIndex(0);
  }

  public getState(): {
    currentBeat: TimelineBeat;
    beatIndex: number;
    totalBeats: number;
    isPlaying: boolean;
    clockIso: string;
    promptBudgetUsed: number;
  } {
    let promptBudgetUsed = 0;
    if (this.storage) {
      try {
        const env = this.storage.load();
        promptBudgetUsed = env?.payload.promptBudget?.count ?? 0;
      } catch {
        // ignore
      }
    }
    return {
      currentBeat: this.getCurrentBeat(),
      beatIndex: this.currentBeatIndex,
      totalBeats: TIMELINE_BEATS.length,
      isPlaying: this.isAutoPlaying,
      clockIso: this.getClockIso(),
      promptBudgetUsed,
    };
  }

  public subscribe(callback: (beat: TimelineBeat) => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  public destroy(): void {
    this.pause();
    this.subscribers.clear();
  }

  private goToIndex(idx: number): TimelineBeat {
    this.currentBeatIndex = idx;
    const currentBeat = TIMELINE_BEATS[idx]!;

    this.notifySubscribers();

    if (this.isAutoPlaying) {
      this.scheduleNextTick();
    }

    return currentBeat;
  }

  private scheduleNextTick(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
    }
    this.timerId = setTimeout(() => {
      if (!this.isAutoPlaying) return;
      this.step();
    }, this.stepIntervalMs);
  }

  private notifySubscribers(): void {
    const beat = this.getCurrentBeat();
    for (const sub of this.subscribers) {
      try {
        sub(beat);
      } catch {
        // ignore subscriber errors
      }
    }
  }
}
