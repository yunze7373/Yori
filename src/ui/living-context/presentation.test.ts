import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  getGreeting,
  formatNowPlan,
  formatTime,
  humanizeProposalTitle,
} from './presentation.js';
import { renderV2Home } from './v2-home-view.js';
import { renderTripDetail } from './v2-detail-views.js';
import type { HomeCompositionVM, TripDetailVM } from '../view-models/types.js';
import { STRINGS } from './strings.js';
import type { PreparedPlan } from '../../core/contracts/index.js';

describe('Living Context Presentation Layer (NFR-105, AC-105-1)', () => {
  describe('escapeHtml XSS Prevention (Finding 5)', () => {
    it('escapes hazardous HTML tags, quotes, and ampersands', () => {
      const malicious = '<img src=x onerror=alert(1)>';
      expect(escapeHtml(malicious)).toBe('&lt;img src=x onerror=alert(1)&gt;');

      const scriptTag = '<script>alert("pwned")</script>';
      expect(escapeHtml(scriptTag)).toBe('&lt;script&gt;alert(&quot;pwned&quot;)&lt;/script&gt;');

      const mixed = 'Tom & Jerry said "hello" and \'goodbye\'';
      expect(escapeHtml(mixed)).toBe('Tom &amp; Jerry said &quot;hello&quot; and &#39;goodbye&#39;');
    });

    it('safely handles non-string inputs', () => {
      expect(escapeHtml(null as unknown as string)).toBe('');
      expect(escapeHtml(undefined as unknown as string)).toBe('');
    });
  });

  describe('Context-Aware Dynamic Greeting (Finding 3)', () => {
    it('renders morning greeting before 12:00 in snapshot timezone', () => {
      // 10:00 AM in America/Los_Angeles (17:00 UTC)
      const morningIso = '2026-10-28T17:00:00.000Z';
      const result = getGreeting(morningIso, 'America/Los_Angeles');
      expect(result.greeting).toBe(STRINGS.header.greetings.morning);
      expect(result.subheading).toBe(STRINGS.header.subheading);
    });

    it('renders afternoon greeting between 12:00 and 17:59 in snapshot timezone', () => {
      // 1:35 PM (13:35) in America/Los_Angeles (20:35 UTC)
      const afternoonIso = '2026-10-28T20:35:00.000Z';
      const result = getGreeting(afternoonIso, 'America/Los_Angeles');
      expect(result.greeting).toBe(STRINGS.header.greetings.afternoon);
    });

    it('renders evening greeting from 18:00 onward in snapshot timezone', () => {
      // 7:10 PM (19:10) in America/Los_Angeles (02:10 UTC next day)
      const eveningIso = '2026-10-29T02:10:00.000Z';
      const result = getGreeting(eveningIso, 'America/Los_Angeles');
      expect(result.greeting).toBe(STRINGS.header.greetings.evening);
    });

    it('accurately respects different IANA timezones', () => {
      // 05:00 UTC = 14:00 (afternoon) in Tokyo (UTC+9)
      const iso = '2026-10-28T05:00:00.000Z';
      const tokyoResult = getGreeting(iso, 'Asia/Tokyo');
      expect(tokyoResult.greeting).toBe(STRINGS.header.greetings.afternoon);

      // 05:00 UTC = 05:00 (morning) in London
      const londonResult = getGreeting(iso, 'Europe/London');
      expect(londonResult.greeting).toBe(STRINGS.header.greetings.morning);
    });

    it('falls back safely on invalid date strings', () => {
      const fallback = getGreeting('invalid-date');
      expect(fallback.greeting).toBe(STRINGS.header.greetings.afternoon);
    });
  });

  describe('formatTime Intl formatting', () => {
    it('formats ISO timestamps to 12-hour local time without seconds', () => {
      // 22:00 UTC = 15:00 (3:00 PM) in Los Angeles (-07:00)
      const timeStr = formatTime('2026-10-28T22:00:00.000Z', 'America/Los_Angeles');
      expect(timeStr).toBe('3:00 PM');
    });

    it('handles invalid or empty inputs gracefully', () => {
      expect(formatTime(undefined)).toBe('');
      expect(formatTime('not-a-date')).toBe('');
    });
  });

  describe('formatNowPlan Presentation from Structured Plan Data (Finding 1 & 2)', () => {
    it('renders Clear D1 plan from structured fields without scene-id branching', () => {
      // 15:00 lesson, travel 30m, buffer 5m, prep 20m -> prepare 14:05 (21:05Z), leave 14:25 (21:25Z)
      const plan: PreparedPlan = {
        id: 'depart-d1',
        intentId: 'depart',
        headline: 'Depart for Piano lesson: prepare 2:05 PM, leave 2:25 PM',
        subjectTitle: 'Piano lesson',
        apptAt: '2026-10-28T22:00:00.000Z',
        prepareAt: '2026-10-28T21:05:00.000Z',
        leaveAt: '2026-10-28T21:25:00.000Z',
        timezone: 'America/Los_Angeles',
        optionsOrSteps: [],
        requiresConfirmation: false,
        createdAt: '2026-10-28T17:00:00.000Z',
        why: {
          evidenceSignals: [],
          memoryFactsUsed: [],
          derivation: '14:05 prep = 15:00 appt - 30m travel - 5m buffer - 20m prep',
        },
      };

      const formatted = formatNowPlan(plan);
      expect(formatted.title).toBe('Piano lesson at 3:00 PM');
      expect(formatted.headline).toBe('Get ready at 2:05 PM, leave by 2:25 PM');
      expect(formatted.basis).toBe(STRINGS.depart.basisLine);
      expect(formatted.isRain).toBe(false);
      expect(formatted.habitNote).toBeUndefined();
    });

    it('renders Rain D2 re-plan reflecting engine timing: prepare 2:10 PM, leave 2:30 PM (Drive first)', () => {
      // Multi-modal rain re-plan with Drive 25m (leave 14:30 / 2:30 PM, prep 14:10 / 2:10 PM) and Bus 40m (leave 14:15 / 2:15 PM)
      const plan: PreparedPlan = {
        id: 'depart-d2',
        intentId: 'depart',
        headline: 'Rain re-plan for Piano lesson: prepare 2:10 PM, leave 2:30 PM (umbrella recommended)',
        subjectTitle: 'Piano lesson',
        apptAt: '2026-10-28T22:00:00.000Z',
        prepareAt: '2026-10-28T21:10:00.000Z',
        leaveAt: '2026-10-28T21:30:00.000Z',
        timezone: 'America/Los_Angeles',
        checklist: ['umbrella'],
        optionsOrSteps: [
          {
            id: 'opt-drive',
            label: 'drive leave 2:30 PM',
            mode: 'drive',
            leaveAt: '2026-10-28T21:30:00.000Z',
            travelMinutes: 25,
            requiresConfirmation: false,
          },
          {
            id: 'opt-bus',
            label: 'bus leave 2:15 PM',
            mode: 'bus',
            leaveAt: '2026-10-28T21:15:00.000Z',
            travelMinutes: 40,
            requiresConfirmation: false,
          },
        ],
        requiresConfirmation: false,
        createdAt: '2026-10-28T20:35:00.000Z',
        why: {
          evidenceSignals: [
            {
              kind: 'weather',
              source: 'simulated',
              issuedAt: '2026-10-28T20:35:00.000Z',
              description: 'Rain forecast',
            },
          ],
          memoryFactsUsed: [
            {
              key: 'rain_transport_preference',
              value: 'drive_first',
              status: 'confirmed',
            },
          ],
          derivation: 'Rain re-plan derivation...',
        },
      };

      const formatted = formatNowPlan(plan);
      expect(formatted.title).toBe('Piano lesson at 3:00 PM');
      // Must reflect engine re-plan: 2:10 PM and 2:30 PM, NOT clear-day 2:05/2:25!
      expect(formatted.headline).toBe('Get ready at 2:10 PM, leave by 2:30 PM');
      expect(formatted.isRain).toBe(true);
      expect(formatted.rainBanner).toBe('What changed: rain forecast');
      expect(formatted.umbrellaChip).toBe('Umbrella');
      expect(formatted.habitNote).toBe('You usually prefer driving when it rains.');
      expect(formatted.options.length).toBe(2);
      expect(formatted.options[0]?.label).toBe('Drive · leave 2:30 PM');
      expect(formatted.options[0]?.meta).toBe('25m drive');
      expect(formatted.options[1]?.label).toBe('Bus · leave 2:15 PM');
      expect(formatted.options[1]?.meta).toBe('40m bus');
    });

    it('omits habit note when confirmed habit fact is absent from why.memoryFactsUsed', () => {
      const planWithoutHabit: PreparedPlan = {
        id: 'depart-no-habit',
        intentId: 'depart',
        headline: 'Rain re-plan for Piano lesson',
        subjectTitle: 'Piano lesson',
        apptAt: '2026-10-28T22:00:00.000Z',
        prepareAt: '2026-10-28T21:10:00.000Z',
        leaveAt: '2026-10-28T21:30:00.000Z',
        timezone: 'America/Los_Angeles',
        checklist: ['umbrella'],
        optionsOrSteps: [],
        requiresConfirmation: false,
        createdAt: '2026-10-28T20:35:00.000Z',
        why: {
          evidenceSignals: [],
          memoryFactsUsed: [], // No habit fact
          derivation: '...',
        },
      };

      const formatted = formatNowPlan(planWithoutHabit);
      expect(formatted.isRain).toBe(true);
      expect(formatted.habitNote).toBeUndefined();
    });

    it('dynamically formats a non-fixture appointment with its own times (e.g. 16:30 lesson)', () => {
      // 16:30 (4:30 PM) appointment with 30m travel, 5m buffer, 20m prep
      // leave = 16:30 - 35m = 15:55 (3:55 PM, 22:55Z)
      // prepare = 15:55 - 20m = 15:35 (3:35 PM, 22:35Z)
      const plan1630: PreparedPlan = {
        id: 'depart-non-fixture',
        intentId: 'depart',
        headline: 'Depart for Chemistry Lab: prepare 3:35 PM, leave 3:55 PM',
        subjectTitle: 'Chemistry Lab',
        apptAt: '2026-10-28T23:30:00.000Z', // 16:30 in America/Los_Angeles
        prepareAt: '2026-10-28T22:35:00.000Z', // 15:35
        leaveAt: '2026-10-28T22:55:00.000Z', // 15:55
        timezone: 'America/Los_Angeles',
        optionsOrSteps: [],
        requiresConfirmation: false,
        createdAt: '2026-10-28T18:00:00.000Z',
        why: {
          evidenceSignals: [],
          memoryFactsUsed: [],
          derivation: '15:35 prep = 16:30 appt - 30m travel - 5m buffer - 20m prep',
        },
      };

      const formatted = formatNowPlan(plan1630);
      expect(formatted.title).toBe('Chemistry Lab at 4:30 PM');
      expect(formatted.headline).toBe('Get ready at 3:35 PM, leave by 3:55 PM');
    });

    it('falls back to plan headline when subjectTitle is missing without fabricating Piano lesson', () => {
      const planNoSubject: PreparedPlan = {
        id: 'depart-no-subject',
        intentId: 'depart',
        headline: 'Next scheduled departure',
        requiresConfirmation: false,
        createdAt: '2026-10-28T18:00:00.000Z',
        optionsOrSteps: [],
        why: {
          evidenceSignals: [],
          memoryFactsUsed: [],
          derivation: '',
        },
      };

      const formatted = formatNowPlan(planNoSubject);
      expect(formatted.title).toBe('Next scheduled departure');
      expect(formatted.title).not.toContain('Piano');
    });

    it('formats Lunch options with single distance metadata and mock disclosure', () => {
      const rawPlan: PreparedPlan = {
        id: 'plan-3',
        intentId: 'lunch',
        headline: 'Lunch options near you (2 places matching your tastes)',
        optionsOrSteps: [
          {
            id: 'opt-1',
            label: 'Demo Place A · Ramen (japanese) · 5m away',
            name: 'Demo Place A · Ramen',
            cuisine: 'japanese',
            distanceMinutes: 5,
            requiresConfirmation: false,
          },
          {
            id: 'opt-2',
            label: 'Demo Place B · Salad (salad) · 7m away',
            name: 'Demo Place B · Salad',
            cuisine: 'salad',
            distanceMinutes: 7,
            requiresConfirmation: false,
          },
        ],
        requiresConfirmation: false,
        createdAt: '2026-10-28T19:10:00.000Z',
        why: {
          evidenceSignals: [],
          memoryFactsUsed: [],
          derivation: 'Recommended 2 options matching confirmed taste preferences (taste_preference=ramen_or_salad).',
        },
      };

      const formatted = formatNowPlan(rawPlan);
      expect(formatted.title).toBe('Lunch options near you');
      expect(formatted.mockPlacesNotice).toBe(
        'Mock places for this demo; real listings come from a place provider.'
      );
      expect(formatted.options.length).toBe(2);
      expect(formatted.options[0]?.label).toBe('Demo Place A · Ramen');
      expect(formatted.options[0]?.meta).toBe('Japanese · 5m away');
      expect(formatted.options[1]?.meta).toBe('Salad · 7m away');
    });
  });

  describe('humanizeProposalTitle (XKEYDEL-P2)', () => {
    it('humanizes proposal titles cleanly without raw keys or identifiers', () => {
      expect(humanizeProposalTitle('prep_buffer_preference')).toBe('Remember departure prep & buffer routine?');
      expect(humanizeProposalTitle('suppress_lunch')).toBe('Skip lunch suggestions for today?');
      expect(humanizeProposalTitle('suppress_lunch_recommendations')).toBe('Skip lunch suggestions for today?');
      expect(humanizeProposalTitle('grocery_store_preference')).toBe('Remember preferred grocery store?');
      expect(humanizeProposalTitle('preferred_grocery_store')).toBe('Remember preferred grocery store?');
      expect(humanizeProposalTitle('custom_unknown_routine')).toBe('Remember preference for custom unknown routine?');
    });
  });

  describe('PROV-INTEGRITY: Attribute Escaping and Inert Rendering (Scope 1 & 2)', () => {
    it('renders data-source-ref, data-candidate-id, and buttons inert when recordId contains quotes and event handlers', () => {
      const maliciousId = 'cand" onmouseover=alert(1)';
      const maliciousRecordId = 'rec" onmouseover=alert(1)';

      // 1. Test candidate cards layout
      const candVM: HomeCompositionVM = {
        layoutKind: 'candidates',
        title: 'Lunch',
        headline: 'Lunch options',
        basis: 'Based on location',
        isRain: false,
        options: [],
        candidateCards: [
          {
            id: maliciousId,
            name: 'Malicious Place',
            cuisine: 'Bistro',
            distanceText: '100m away',
            basis: 'Top rated',
            isSelected: false,
            photo: {
              id: 'photo-1',
              label: 'Photo label',
              category: 'restaurant',
              svgMarkup: '<svg></svg>',
              altText: 'Photo',
              simulatedBadge: 'Simulated',
            },
            fieldSourceRefs: {
              name: { recordId: maliciousRecordId, field: 'name' },
              cuisine: { recordId: maliciousRecordId, field: 'cuisine' },
              distanceText: { recordId: maliciousRecordId, field: 'distanceText' },
              basis: { recordId: maliciousRecordId, field: 'basis' },
            },
          },
        ],
        isAccepted: false,
        actions: [],
        aheadItems: [],
        proposals: [],
      };

      const candHtml = renderV2Home(candVM);
      expect(candHtml).toContain('data-candidate-id="cand&quot; onmouseover=alert(1)"');
      expect(candHtml).toContain('id="candidate-cand&quot; onmouseover=alert(1)"');
      expect(candHtml).toContain('id="btn-navigate-cand&quot; onmouseover=alert(1)"');
      expect(candHtml).toContain('id="btn-detail-cand&quot; onmouseover=alert(1)"');
      expect(candHtml).toContain('data-source-ref="rec&quot; onmouseover=alert(1).name"');
      expect(candHtml).not.toMatch(/" onmouseover=alert\(1\)/);

      // 2. Test transit option cards in TripDetail view
      const tripDetailVM: TripDetailVM = {
        planId: 'opt-test-plan',
        title: 'Depart',
        headline: 'Leave for lesson',
        destinationName: 'Piano lesson',
        apptTime: '3:00 PM',
        leaveTime: '2:30 PM',
        arriveTime: '2:55 PM',
        bufferText: 'On time',
        prepText: '20m prep',
        selectedMode: 'bus',
        map: {
          id: 'map-1',
          label: 'Map',
          simulatedBadge: 'Simulated',
          sizeHint: 'prominent',
          destinationName: 'Piano lesson',
          markers: [],
          polylines: [],
          ariaDescription: 'Map',
        },
        steps: [],
        whyDerivation: '',
        whyHabits: [],
        isAccepted: false,
        actions: [],
        modeTabs: [
          {
            id: 'opt1',
            label: 'Bus · leave 2:30 PM',
            mode: 'bus',
            leaveTime: '2:30 PM',
            arriveTime: '3:10 PM',
            isSelected: true,
            badge: 'Recommended',
            meta: '40 min bus · late by 10m',
            rankingBasis: 'Rain habit',
            fieldSourceRefs: {
              leaveTime: { recordId: 'leave" onmouseover=x', field: 'leaveTime' },
              travelMinutes: { recordId: 'travel" onmouseover=x', field: 'travelMinutes' },
              rankingBasis: { recordId: 'basis" onmouseover=x', field: 'rankingBasis' },
              lateMinutes: { recordId: 'late" onmouseover=x', field: 'lateMinutes' },
            },
          },
        ],
      };

      const journeyHtml = renderTripDetail(tripDetailVM);
      expect(journeyHtml).toContain('data-source-ref="leave&quot; onmouseover=x.leaveTime"');
      expect(journeyHtml).toContain('data-source-ref="travel&quot; onmouseover=x.travelMinutes"');
      expect(journeyHtml).toContain('data-source-ref="basis&quot; onmouseover=x.rankingBasis"');
      expect(journeyHtml).toContain('data-source-ref="late&quot; onmouseover=x.lateMinutes"');
      expect(journeyHtml).not.toMatch(/" onmouseover=x/);
    });

    it('omits data-source-ref when fieldSourceRefs is missing instead of inventing literal fallbacks', () => {
      const vm: TripDetailVM = {
        planId: 'opt-no-refs-plan',
        title: 'Depart',
        headline: 'Departure plan',
        destinationName: 'Piano lesson',
        apptTime: '3:00 PM',
        leaveTime: '2:30 PM',
        arriveTime: '2:55 PM',
        bufferText: 'On time',
        prepText: '20m prep',
        selectedMode: 'drive',
        map: {
          id: 'map-1',
          label: 'Map',
          simulatedBadge: 'Simulated',
          sizeHint: 'prominent',
          destinationName: 'Piano lesson',
          markers: [],
          polylines: [],
          ariaDescription: 'Map',
        },
        steps: [],
        whyDerivation: '',
        whyHabits: [],
        isAccepted: false,
        actions: [],
        modeTabs: [
          {
            id: 'opt-no-refs',
            label: 'Drive · leave 2:30 PM',
            mode: 'drive',
            leaveTime: '2:30 PM',
            arriveTime: '2:55 PM',
            isSelected: true,
            badge: 'Alternative',
            meta: '25 min drive · late by 10m',
            rankingBasis: 'Alternative route',
            // fieldSourceRefs intentionally empty/undefined
          },
        ],
      };

      const html = renderTripDetail(vm);

      // Verify no invented literal provenance fallbacks are emitted
      expect(html).not.toContain('rain_transport_preference.rankingBasis');
      expect(html).not.toContain('user_override_timing.lateMinutes');
      // Instead, slot is marked as chrome or omitted
      expect(html).toContain('data-slot="chrome" data-slot-reason="Option ranking basis"');
      expect(html).toContain('data-slot="chrome" data-slot-reason="Option late meta"');
    });
  });
});
