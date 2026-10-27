/**
 * Depart Plan Preparer
 * Governed by AC-102-1, AC-102-2, AC-102-3 and Invariants INV-103, INV-104, INV-106, INV-107.
 *
 * Prepares actionable departure plans with deterministic time calculation,
 * rain re-planning (multi-modal options, umbrella checklist, confirmed preference ranking),
 * explainable Why derivations, and fail-closed degradation on invalid or stale inputs.
 */

import type {
  Preparer,
  IntentCandidate,
  PreparedPlan,
  PlanOption,
  ContextSnapshot,
  MemoryFact,
  ContextSignal,
  EvidenceCitation,
  MemoryCitation,
} from '../../core/contracts/index.js';
import { computeDepartTiming, validateCalendarDate } from './engine.js';

export interface DepartPreparerOptions {
  readonly defaultTimeZone?: string;
  readonly defaultBufferMinutes?: number;
  readonly defaultPrepMinutes?: number;
}

export class DepartPreparer implements Preparer {
  public readonly id = 'depart-preparer';
  public readonly targetIntent = 'depart';

  constructor(private readonly options: DepartPreparerOptions = {}) {}

  public prepare(
    candidate: IntentCandidate,
    snapshot: ContextSnapshot,
    memory: readonly MemoryFact[]
  ): PreparedPlan | null {
    if (!candidate || candidate.intent !== 'depart' || !snapshot || !Array.isArray(snapshot.signals)) {
      return null;
    }

    // 1. Locate calendar signal
    const calendarSignal =
      candidate.evidence.find(s => s.kind === 'calendar') ??
      snapshot.signals.find(s => s.kind === 'calendar');

    if (!calendarSignal || !calendarSignal.value || typeof calendarSignal.value !== 'object') {
      return null;
    }

    const calVal = calendarSignal.value as Record<string, unknown>;
    const startTimeStr = (calVal.startTime ?? calVal.time ?? candidate.metadata?.startTime) as string | undefined;

    if (!startTimeStr || !validateCalendarDate(startTimeStr)) {
      return null; // Fail closed on missing or impossible calendar date
    }

    // 2. Locate travel estimate signal
    const travelSignal = snapshot.signals.find(s => s.kind === 'travel_estimate');
    if (!travelSignal || !travelSignal.value || typeof travelSignal.value !== 'object') {
      return null; // Fail closed on missing travel estimate
    }

    // Verify travel signal is not expired
    if (typeof travelSignal.validFor === 'number' && typeof travelSignal.issuedAt === 'string') {
      const travelIssuedMs = Date.parse(travelSignal.issuedAt);
      const snapshotAsOfMs = Date.parse(snapshot.asOf);
      if (Number.isFinite(travelIssuedMs) && Number.isFinite(snapshotAsOfMs)) {
        if (snapshotAsOfMs - travelIssuedMs > travelSignal.validFor) {
          return null; // Stale travel signal: fail closed
        }
      }
    }

    const travelVal = travelSignal.value as Record<string, unknown>;

    // 3. Locate weather signal and check expiration (INV-106)
    const weatherSignal = snapshot.signals.find(s => s.kind === 'weather');
    let validWeatherSignal: ContextSignal | null = null;
    if (weatherSignal && typeof weatherSignal.validFor === 'number' && typeof weatherSignal.issuedAt === 'string') {
      const weatherIssuedMs = Date.parse(weatherSignal.issuedAt);
      const snapshotAsOfMs = Date.parse(snapshot.asOf);
      if (Number.isFinite(weatherIssuedMs) && Number.isFinite(snapshotAsOfMs)) {
        const isExpired = snapshotAsOfMs - weatherIssuedMs > weatherSignal.validFor;
        if (!isExpired) {
          validWeatherSignal = weatherSignal;
        }
      }
    } else if (weatherSignal) {
      validWeatherSignal = weatherSignal;
    }

    // 4. Memory facts (read-only, zero mutation per INV-107)
    const bufferFact = memory.find(
      f => f.key === 'prep_buffer_minutes' && f.status === 'confirmed'
    );
    const prepFact = memory.find(
      f => f.key === 'prep_duration_minutes' && f.status === 'confirmed'
    );
    const rainPreferenceFact = memory.find(
      f => f.key === 'rain_transport_preference' && f.status === 'confirmed'
    );

    const bufferMinutes =
      typeof bufferFact?.value === 'number' && Number.isFinite(bufferFact.value)
        ? bufferFact.value
        : (this.options.defaultBufferMinutes ?? 5);

    const prepMinutes =
      typeof prepFact?.value === 'number' && Number.isFinite(prepFact.value)
        ? prepFact.value
        : (this.options.defaultPrepMinutes ?? 20);

    const timeZone =
      (candidate.metadata?.timezone as string | undefined) ??
      this.options.defaultTimeZone ??
      'America/Los_Angeles';

    // 5. Evaluate precipitation risk from valid weather signal
    const weatherVal = validWeatherSignal?.value as Record<string, unknown> | undefined;
    const hasPrecipitationRisk =
      weatherVal !== undefined &&
      (weatherVal.condition === 'rain' ||
        (typeof weatherVal.precipProbability === 'number' && weatherVal.precipProbability >= 0.5) ||
        weatherVal.rainfall !== undefined);

    const title = typeof calVal.title === 'string' ? calVal.title : 'Appointment';

    // 6. Build options, timing, and checklist
    const evidenceSignals: EvidenceCitation[] = [
      {
        kind: 'calendar',
        source: calendarSignal.source,
        issuedAt: calendarSignal.issuedAt,
        description: title,
      },
      {
        kind: 'travel_estimate',
        source: travelSignal.source,
        issuedAt: travelSignal.issuedAt,
        description: 'Travel time estimate',
      },
    ];

    if (validWeatherSignal) {
      evidenceSignals.push({
        kind: 'weather',
        source: validWeatherSignal.source,
        issuedAt: validWeatherSignal.issuedAt,
        description: hasPrecipitationRisk ? 'Rain forecast' : 'Weather conditions',
      });
    }

    const memoryFactsUsed: MemoryCitation[] = [
      {
        key: 'prep_buffer_minutes',
        value: bufferMinutes,
        status: bufferFact?.status ?? 'confirmed',
      },
      {
        key: 'prep_duration_minutes',
        value: prepMinutes,
        status: prepFact?.status ?? 'confirmed',
      },
    ];

    let headline: string;
    let optionsOrSteps: readonly (PlanOption | string)[];
    let checklist: readonly string[] = Object.freeze([]);
    let alreadyDue = false;
    let derivation: string;

    const hasMultiModal =
      typeof travelVal.driveMinutes === 'number' &&
      typeof travelVal.busMinutes === 'number';

    if (hasPrecipitationRisk && hasMultiModal) {
      // D2 Rain Re-plan branch
      checklist = Object.freeze(['umbrella']);

      const driveMinutes = travelVal.driveMinutes as number;
      const busMinutes = travelVal.busMinutes as number;

      const driveTiming = computeDepartTiming({
        apptTime: startTimeStr,
        travelMinutes: driveMinutes,
        bufferMinutes,
        prepMinutes,
        timeZone,
        nowTime: snapshot.asOf,
      });

      const busTiming = computeDepartTiming({
        apptTime: startTimeStr,
        travelMinutes: busMinutes,
        bufferMinutes,
        prepMinutes,
        timeZone,
        nowTime: snapshot.asOf,
      });

      const driveOption: PlanOption = {
        id: 'opt-drive',
        label: `drive leave ${driveTiming.leaveTime12}`, // e.g. "drive leave 2:30 PM"
        details: `${driveMinutes} min drive + ${bufferMinutes} min buffer`,
        estimatedMinutes: driveMinutes,
        requiresConfirmation: false,
      };

      const busOption: PlanOption = {
        id: 'opt-bus',
        label: `bus leave ${busTiming.leaveTime12}`, // e.g. "bus leave 2:15 PM"
        details: `${busMinutes} min bus + ${bufferMinutes} min buffer`,
        estimatedMinutes: busMinutes,
        requiresConfirmation: false,
      };

      if (rainPreferenceFact) {
        memoryFactsUsed.push({
          key: 'rain_transport_preference',
          value: rainPreferenceFact.value,
          status: rainPreferenceFact.status,
        });
      }

      // Rank by confirmed rain habit
      const prefersBus = rainPreferenceFact?.value === 'bus_first';
      optionsOrSteps = prefersBus
        ? Object.freeze([busOption, driveOption])
        : Object.freeze([driveOption, busOption]);

      const primaryTiming = prefersBus ? busTiming : driveTiming;
      alreadyDue = primaryTiming.alreadyDue;

      headline = `Rain re-plan for ${title}: prepare ${primaryTiming.prepareTime12}, leave ${primaryTiming.leaveTime12} (umbrella recommended)`;

      derivation = `Rain re-plan: drive leave ${driveTiming.leaveTime12} (${driveTiming.leaveTime24} leave = ${driveTiming.apptTime24} appt - ${driveMinutes}m drive - ${bufferMinutes}m buffer); bus leave ${busTiming.leaveTime12} (${busTiming.leaveTime24} leave = ${busTiming.apptTime24} appt - ${busMinutes}m bus - ${bufferMinutes}m buffer); ranked by confirmed rain_transport_preference (${String(rainPreferenceFact?.value ?? 'drive_first')}); prepare ${primaryTiming.prepareTime12} (${primaryTiming.prepareTime24} prepare = ${primaryTiming.leaveTime24} leave - ${prepMinutes}m prep)`;
    } else {
      // D1 Standard clear / single-mode departure
      const travelMinutes =
        typeof travelVal.travelMinutes === 'number'
          ? travelVal.travelMinutes
          : typeof travelVal.driveMinutes === 'number'
          ? travelVal.driveMinutes
          : 30;

      const timing = computeDepartTiming({
        apptTime: startTimeStr,
        travelMinutes,
        bufferMinutes,
        prepMinutes,
        timeZone,
        nowTime: snapshot.asOf,
      });

      alreadyDue = timing.alreadyDue;

      headline = `Depart for ${title}: prepare ${timing.prepareTime12}, leave ${timing.leaveTime12}`;

      optionsOrSteps = Object.freeze([
        {
          id: 'step-prepare',
          label: `prepare ${timing.prepareTime12}`,
          requiresConfirmation: false,
        },
        {
          id: 'step-leave',
          label: `leave ${timing.leaveTime12}`,
          requiresConfirmation: false,
        },
      ]);

      derivation = timing.derivation;
    }

    return Object.freeze({
      id: `depart-plan-${calendarSignal.issuedAt}-${snapshot.asOf}`,
      intentId: 'depart',
      headline,
      optionsOrSteps,
      checklist,
      requiresConfirmation: false,
      alreadyDue,
      why: Object.freeze({
        evidenceSignals: Object.freeze(evidenceSignals),
        memoryFactsUsed: Object.freeze(memoryFactsUsed),
        derivation,
      }),
      createdAt: snapshot.asOf,
    });
  }
}

export const departPreparer = new DepartPreparer();
