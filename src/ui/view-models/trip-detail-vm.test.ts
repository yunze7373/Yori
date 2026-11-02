/**
 * Trip Detail View Model Unit Tests (S4-LIVE-DEPART)
 * Governed by LIVE_FIRST plan (PT:S4-LIVE-DEPART).
 */

import { describe, it, expect } from 'vitest';
import { deriveTripDetailVM } from './trip-detail-vm.js';
import type { PreparedPlan, SpatialMapEvidence } from '../../core/contracts/index.js';

describe('S4-LIVE-DEPART: TripDetailVM Derivation', () => {
  const baseDepartPlan: PreparedPlan = {
    id: 'plan-depart-20261102143000',
    intentId: 'depart',
    headline: 'Time to prepare: Project Sync at 3:00 PM',
    subjectTitle: 'Project Sync',
    timezone: 'UTC',
    requiresConfirmation: false,
    createdAt: '2026-11-02T13:30:00.000Z',
    apptAt: '2026-11-02T15:00:00.000Z',
    leaveAt: '2026-11-02T14:30:00.000Z',
    prepareAt: '2026-11-02T14:10:00.000Z',
    checklist: ['umbrella'],
    why: {
      derivation: 'Appointment scheduled at 3:00 PM with driving route',
      evidenceSignals: [
        {
          kind: 'calendar',
          source: 'real',
          issuedAt: '2026-11-02T12:00:00.000Z',
          description: 'Project Sync',
          value: {
            title: 'Project Sync',
            startTime: '2026-11-02T15:00:00.000Z',
            location: '100 Van Ness Ave, San Francisco',
          },
        } as any,
        {
          kind: 'travel_estimate',
          source: 'real',
          issuedAt: '2026-11-02T13:30:00.000Z',
          description: 'Travel time estimate',
        },
        {
          kind: 'weather',
          source: 'real',
          issuedAt: '2026-11-02T13:30:00.000Z',
          description: 'Rain forecast',
        },
      ],
      memoryFactsUsed: [
        {
          key: 'prep_buffer_minutes',
          value: 10,
          status: 'confirmed',
        },
        {
          key: 'prep_duration_minutes',
          value: 20,
          status: 'confirmed',
        },
      ],
    },
    optionsOrSteps: [
      {
        id: 'opt-drive',
        label: 'Drive · 20 min',
        mode: 'drive',
        travelMinutes: 20,
        leaveAt: '2026-11-02T14:30:00.000Z',
        requiresConfirmation: false,
        details: '20 min drive via OSRM + 10m buffer',
      },
      {
        id: 'opt-transit',
        label: 'Transit · 35 min',
        mode: 'transit',
        travelMinutes: 35,
        leaveAt: '2026-11-02T14:15:00.000Z',
        requiresConfirmation: false,
        details: '35 min bus + 10m buffer',
      },
    ],
  };

  const spatialEvidence: SpatialMapEvidence = {
    placeOrRoute: {
      name: 'Project Sync',
      destination: '100 Van Ness Ave, San Francisco',
    },
    spatialEvidence: {
      kind: 'route',
      source: 'real',
      value: {
        distanceM: 5000,
        durationS: 1200,
        geometry: [[37.77, -122.41], [37.78, -122.42]],
      },
      issuedAt: '2026-11-02T13:30:00.000Z',
      validFor: 300000,
      confidence: 1.0,
      consentScope: 'device_only',
    },
  };

  it('derives destination name, appointment time, and title from plan data', () => {
    const vm = deriveTripDetailVM({
      plan: baseDepartPlan,
      spatialEvidence,
      snapshot: {
        asOf: '2026-11-02T13:30:00.000Z',
        timezone: 'UTC',
        signals: [],
      },
      isLive: true,
    });

    expect(vm.destinationName).toBe('Project Sync');
    expect(vm.apptTime).toBe('3:00 PM');
    expect(vm.title).toBe('Project Sync at 3:00 PM');
    expect(vm.isLive).toBe(true);
  });

  it('derives mode tabs from plan options with correct duration and times', () => {
    const vm = deriveTripDetailVM({
      plan: baseDepartPlan,
      spatialEvidence,
      snapshot: {
        asOf: '2026-11-02T13:30:00.000Z',
        timezone: 'UTC',
        signals: [],
      },
      isLive: true,
    });

    expect(vm.modeTabs).toHaveLength(2);
    expect(vm.modeTabs[0]!.mode).toBe('drive');
    expect(vm.modeTabs[0]!.durationMinutes).toBe(20);
    expect(vm.modeTabs[0]!.label).toBe('Drive · 20 min');
    expect(vm.modeTabs[0]!.leaveTime).toBe('2:30 PM');
    expect(vm.modeTabs[0]!.arriveTime).toBe('2:50 PM');
    expect(vm.modeTabs[0]!.isSelected).toBe(true);
    expect(vm.modeTabs[0]!.badge).toBe('Recommended');

    expect(vm.modeTabs[1]!.mode).toBe('transit');
    expect(vm.modeTabs[1]!.durationMinutes).toBe(35);
    expect(vm.modeTabs[1]!.badge).toBe('Alternative');
  });

  it('includes umbrella preparation in prepText when checklist has umbrella', () => {
    const vm = deriveTripDetailVM({
      plan: baseDepartPlan,
      spatialEvidence,
      isLive: true,
    });

    expect(vm.prepText).toContain('Take umbrella');
    expect(vm.prepText).toContain('20m prep');
  });

  it('uses dynamic calendar recordId in sourceRef and fieldSourceRefs', () => {
    const customSigSnapshot = {
      signals: [
        {
          id: 'cal-event-9988',
          kind: 'calendar',
          source: 'real',
          issuedAt: '2026-11-02T12:00:00.000Z',
          value: {
            title: 'Project Sync',
            startTime: '2026-11-02T15:00:00.000Z',
          },
        },
      ],
      timezone: 'UTC',
    };

    const vm = deriveTripDetailVM({
      plan: baseDepartPlan,
      spatialEvidence,
      snapshot: customSigSnapshot as any,
      isLive: true,
    });

    expect(vm.sourceRef?.recordId).toBe('cal-event-9988');
    expect(vm.fieldSourceRefs?.destinationName?.recordId).toBe('cal-event-9988');
    expect(vm.fieldSourceRefs?.apptTime?.recordId).toBe('cal-event-9988');
  });

  it('labels habit provenance honestly as confirmed habit in Live mode', () => {
    const confirmedKeys = new Set(['prep_buffer_minutes', 'prep_duration_minutes']);
    const vm = deriveTripDetailVM({
      plan: baseDepartPlan,
      spatialEvidence,
      userConfirmedKeys: confirmedKeys,
      isLive: true,
    });

    expect(vm.whyHabits[0]!.provenanceText).toBe('You confirmed');
    expect(vm.whyHabits[1]!.provenanceText).toBe('You confirmed');
    expect(vm.whyDerivation).toContain('your confirmed preparation routine');
  });
});
