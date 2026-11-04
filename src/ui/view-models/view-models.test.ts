import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  buildHomeComposition,
  deriveTimelineVM,
  deriveOptionCardVMs,
  deriveMapVM,
  getLocalIllustration,
} from './index.js';
import type { PreparedPlan, SpatialMapEvidence } from '../../core/contracts/index.js';

describe('V1: Scene-Driven Home Composition & View Models (§4)', () => {
  const d2RainPlan: PreparedPlan = {
    id: 'plan-d2-rain',
    intentId: 'depart',
    headline: 'Piano lesson at 3:00 PM',
    subjectTitle: 'Piano lesson',
    apptAt: '2026-10-28T22:00:00.000Z', // 3:00 PM PDT
    prepareAt: '2026-10-28T21:10:00.000Z', // 2:10 PM PDT
    leaveAt: '2026-10-28T21:30:00.000Z', // 2:30 PM PDT
    timezone: 'America/Los_Angeles',
    checklist: ['umbrella'],
    optionsOrSteps: [
      {
        id: 'opt-drive',
        label: 'Drive · 25 min',
        mode: 'drive',
        travelMinutes: 25,
        leaveAt: '2026-10-28T21:30:00.000Z',
        requiresConfirmation: false,
        rankedByFactKey: 'rain_transport_preference',
        details: '25 min drive + 5 min buffer',
      },
      {
        id: 'opt-bus',
        label: 'Bus · 40 min',
        mode: 'bus',
        travelMinutes: 40,
        leaveAt: '2026-10-28T21:15:00.000Z',
        requiresConfirmation: false,
        details: '40 min bus + 5 min buffer',
      },
    ],
    requiresConfirmation: false,
    why: {
      evidenceSignals: [
        {
          kind: 'weather',
          source: 'simulated',
          issuedAt: '2026-10-28T20:35:00.000Z', // 1:35 PM local
          description: 'Rain forecast moderate at 1:35 PM',
        },
      ],
      memoryFactsUsed: [
        {
          key: 'prep_buffer_minutes',
          value: 5,
          status: 'confirmed',
        },
        {
          key: 'prep_duration_minutes',
          value: 20,
          status: 'confirmed',
        },
        {
          key: 'rain_transport_preference',
          value: 'drive_first',
          status: 'confirmed',
        },
      ],
      derivation: 'Re-plan: rain at 1:35 PM -> drive option ranked first',
    },
    createdAt: '2026-10-28T20:35:00.000Z',
  };

  const d1ClearPlan: PreparedPlan = {
    id: 'plan-d1-clear',
    intentId: 'depart',
    headline: 'Piano lesson at 3:00 PM',
    subjectTitle: 'Piano lesson',
    apptAt: '2026-10-28T22:00:00.000Z', // 3:00 PM PDT
    prepareAt: '2026-10-28T21:05:00.000Z', // 2:05 PM PDT
    leaveAt: '2026-10-28T21:25:00.000Z', // 2:25 PM PDT
    timezone: 'America/Los_Angeles',
    checklist: [],
    optionsOrSteps: [
      'prepare 2:05 PM',
      'leave 2:25 PM',
    ],
    requiresConfirmation: false,
    why: {
      evidenceSignals: [
        {
          kind: 'travel_estimate',
          source: 'simulated',
          issuedAt: '2026-10-28T17:00:00.000Z',
          description: 'Travel time estimate',
        },
      ],
      memoryFactsUsed: [
        {
          key: 'prep_buffer_minutes',
          value: 5,
          status: 'confirmed',
        },
        {
          key: 'prep_duration_minutes',
          value: 20,
          status: 'confirmed',
        },
      ],
      derivation: 'Clear departure: 20m prep, 30m travel, 5m buffer',
    },
    createdAt: '2026-10-28T17:00:00.000Z',
  };

  const postConfirmPlan: PreparedPlan = {
    id: 'plan-post-confirm',
    intentId: 'depart',
    headline: 'Piano lesson at 3:00 PM',
    subjectTitle: 'Piano lesson',
    apptAt: '2026-10-28T22:00:00.000Z', // 3:00 PM PDT
    prepareAt: '2026-10-28T20:55:00.000Z', // 1:55 PM PDT (25m prep)
    leaveAt: '2026-10-28T21:20:00.000Z', // 2:20 PM PDT (30m travel + 10m buffer = 40m before 3:00)
    timezone: 'America/Los_Angeles',
    checklist: ['umbrella'],
    optionsOrSteps: [],
    requiresConfirmation: false,
    why: {
      evidenceSignals: [
        {
          kind: 'travel_estimate',
          source: 'simulated',
          issuedAt: '2026-10-28T17:00:00.000Z',
          description: 'Travel time estimate',
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
          value: 25,
          status: 'confirmed',
        },
      ],
      derivation: 'Re-plan with confirmed user preferences: 25m prep, 10m buffer',
    },
    createdAt: '2026-10-28T20:00:00.000Z',
  };

  const d3LunchPlan: PreparedPlan = {
    id: 'plan-d3-lunch',
    intentId: 'lunch',
    headline: 'Lunch options near you',
    optionsOrSteps: [
      {
        id: 'mock-place-1',
        label: 'Demo Place A · Ramen',
        name: 'Demo Place A · Ramen',
        cuisine: 'japanese',
        distanceMinutes: 5,
        requiresConfirmation: false,
      },
      {
        id: 'mock-place-2',
        label: 'Demo Place B · Salad',
        name: 'Demo Place B · Salad',
        cuisine: 'salad',
        distanceMinutes: 7,
        requiresConfirmation: false,
      },
      {
        id: 'mock-place-3',
        label: 'Demo Place C · Sushi',
        name: 'Demo Place C · Sushi',
        cuisine: 'japanese',
        distanceMinutes: 10,
        requiresConfirmation: false,
      },
    ],
    requiresConfirmation: false,
    why: {
      evidenceSignals: [
        {
          kind: 'location_status',
          source: 'simulated',
          issuedAt: '2026-10-28T19:10:00.000Z',
          description: 'User away from home in Downtown',
        },
      ],
      memoryFactsUsed: [
        {
          key: 'taste_preference',
          value: 'ramen_or_salad',
          status: 'confirmed',
        },
      ],
      derivation: 'Away at 12:10 PM with free window -> <=3 lunch options citing confirmed taste',
    },
    createdAt: '2026-10-28T19:10:00.000Z',
  };

  const mockSpatialEvidence: SpatialMapEvidence = {
    placeOrRoute: { name: 'Piano Studio (Downtown)', area: 'Downtown' },
    spatialEvidence: {
      kind: 'calendar',
      source: 'simulated',
      value: { title: 'Piano lesson', location: 'Piano Studio' },
      issuedAt: '2026-10-28T17:00:00.000Z',
      validFor: 36000000,
      confidence: 1.0,
      consentScope: 'device_only',
    },
  };

  describe('4.1 Journey Timeline & Transit Options (Depart/Rain)', () => {
    it('derives TimelineVM with exact times, umbrella detail, and arrival buffer', () => {
      const timeline = deriveTimelineVM(d2RainPlan);
      expect(timeline).toBeDefined();
      expect(timeline!.eventTitle).toContain('Piano lesson at 3:00 PM');
      expect(timeline!.steps).toHaveLength(4);

      // Step 1: Prep
      expect(timeline!.steps[0]!.time).toBe('2:10 PM');
      expect(timeline!.steps[0]!.label).toBe('Get ready');
      expect(timeline!.steps[0]!.detail).toContain('umbrella');
      expect(timeline!.steps[0]!.detail).toContain('20m prep + 5m buffer');

      // Step 2: Leave
      expect(timeline!.steps[1]!.time).toBe('2:30 PM');
      expect(timeline!.steps[1]!.label).toBe('Leave');
      expect(timeline!.steps[1]!.detail).toContain('Drive · 25 min');
      expect(timeline!.steps[1]!.isPrimary).toBe(true);

      // Step 3: Arrive (2:30 PM + 25m = 2:55 PM)
      expect(timeline!.steps[2]!.time).toBe('2:55 PM');
      expect(timeline!.steps[2]!.label).toBe('Arrive at destination');
      expect(timeline!.steps[2]!.detail).toContain('5m buffer');

      // Step 4: Event
      expect(timeline!.steps[3]!.time).toBe('3:00 PM');
      expect(timeline!.steps[3]!.label).toBe('Piano lesson');
      expect(timeline!.steps[3]!.isEvent).toBe(true);
    });

    it('derives OptionCardVMs for transit modes with honest ranking basis and no star ratings', () => {
      // Sample profile fact (userConfirmedKeys empty)
      const options = deriveOptionCardVMs(d2RainPlan, new Set());
      expect(options).toHaveLength(2);

      // Drive option
      expect(options[0]!.mode).toBe('drive');
      expect(options[0]!.travelMinutes).toBe(25);
      expect(options[0]!.badge).toBe('Recommended');
      expect(options[0]!.rankingBasis).toContain('Rain travel habit');
      expect(options[0]!.rankingBasis).toContain('Demo profile · sample');
      expect(options[0]!.rankingBasis).not.toContain('Confirmed');
      expect(options[0]!.isSelected).toBe(true);

      // Bus option
      expect(options[1]!.mode).toBe('bus');
      expect(options[1]!.travelMinutes).toBe(40);
      expect(options[1]!.badge).toBe('Alternative');

      // Data honesty: no star ratings or review counts
      const allText = JSON.stringify(options);
      expect(allText).not.toContain('★');
      expect(allText).not.toContain('stars');
      expect(allText).not.toContain('reviews');
    });

    it('derives MapVM with prominent size, schematic polylines, and weather callout', () => {
      const map = deriveMapVM(d2RainPlan, mockSpatialEvidence, 'prominent');
      expect(map).toBeDefined();
      expect(map!.sizeHint).toBe('prominent');
      expect(map!.simulatedBadge).toBe('Schematic · simulated');
      expect(map!.polylines).toHaveLength(2); // Drive and Bus
      expect(map!.markers).toHaveLength(2); // Origin and Destination
      expect(map!.weatherCallout).toBeDefined();
      expect(map!.weatherCallout!.text).toBe('Rain forecast · simulated');
      expect(map!.weatherCallout!.subtext).toBe('Issued 1:35 PM');
    });
  });

  describe('4.2 Non-D2 Value Verification (Finding 1 & 4 Fixes)', () => {
    it('derives D1 travel mathematically as 30 min and arrival as 2:55 PM (not 25m/2:50)', () => {
      const mockSnapshot = {
        signals: [
          { kind: 'travel_estimate', value: { mode: 'drive', travelMinutes: 30 } },
        ],
      };
      const timeline = deriveTimelineVM(d1ClearPlan, mockSnapshot);
      expect(timeline).toBeDefined();
      expect(timeline!.steps).toHaveLength(4);

      // Step 1: Prep (2:05 PM)
      expect(timeline!.steps[0]!.time).toBe('2:05 PM');
      expect(timeline!.steps[0]!.detail).toBe('20m prep + 5m buffer');

      // Step 2: Leave (2:25 PM) with 30 min travel (3:00 - 2:25 - 5m buffer = 30m)
      expect(timeline!.steps[1]!.time).toBe('2:25 PM');
      expect(timeline!.steps[1]!.detail).toBe('Drive · 30 min');

      // Step 3: Arrive at 2:55 PM (2:25 PM + 30m = 2:55 PM) with 5m buffer
      expect(timeline!.steps[2]!.time).toBe('2:55 PM');
      expect(timeline!.steps[2]!.detail).toBe('On time · 5m buffer');

      // Step 4: Event at 3:00 PM
      expect(timeline!.steps[3]!.time).toBe('3:00 PM');
    });

    it('derives travel mode from signal value without assuming Drive', () => {
      // Test mode derived as Bus from signal value
      const busSnapshot = {
        signals: [
          { kind: 'travel_estimate', value: { mode: 'bus', travelMinutes: 30 } },
        ],
      };
      const busTimeline = deriveTimelineVM(d1ClearPlan, busSnapshot);
      expect(busTimeline!.steps[1]!.detail).toBe('Bus · 30 min');

      // Test mode fallback to neutral Travel when no signal value exists
      const neutralTimeline = deriveTimelineVM(d1ClearPlan, { signals: [] });
      expect(neutralTimeline!.steps[1]!.detail).toBe('Travel · 30 min');
    });

    it('omits option cards for single-mode depart plans where timeline already shows the steps', () => {
      const options = deriveOptionCardVMs(d1ClearPlan);
      // Plain string steps are not rendered as duplicate option cards
      expect(options).toHaveLength(0);
    });

    it('draws single-mode polyline with neutral Travel default and NO bus polyline', () => {
      // Default fallback without explicit mode signal or option
      const mapDefault = deriveMapVM(d1ClearPlan, mockSpatialEvidence, 'prominent');
      expect(mapDefault).toBeDefined();
      expect(mapDefault!.polylines).toHaveLength(1);
      expect(mapDefault!.polylines[0]!.mode).toBe('travel');
      expect(mapDefault!.polylines[0]!.label).toBe('Travel · 30 min');
      expect(mapDefault!.polylines[0]!.travelMinutes).toBe(30);
      expect(mapDefault!.polylines.some(p => p.mode === 'bus')).toBe(false);
      expect(mapDefault!.weatherCallout).toBeUndefined();

      // With explicit drive mode snapshot
      const driveSnapshot = {
        signals: [
          { kind: 'travel_estimate', value: { mode: 'drive', travelMinutes: 30 } },
        ],
      };
      const mapDrive = deriveMapVM(d1ClearPlan, mockSpatialEvidence, 'prominent', { snapshot: driveSnapshot });
      expect(mapDrive).toBeDefined();
      expect(mapDrive!.polylines[0]!.mode).toBe('drive');
      expect(mapDrive!.polylines[0]!.label).toBe('Drive · 30 min');
    });

    it('correctly adapts timeline to post-confirm 25m prep + 10m buffer facts', () => {
      const mockSnapshot = {
        signals: [
          { kind: 'travel_estimate', value: { mode: 'drive', travelMinutes: 30 } },
        ],
      };
      const timeline = deriveTimelineVM(postConfirmPlan, mockSnapshot);
      expect(timeline).toBeDefined();

      // Step 1: Prep at 1:55 PM with 25m prep + 10m buffer
      expect(timeline!.steps[0]!.time).toBe('1:55 PM');
      expect(timeline!.steps[0]!.detail).toBe('Take umbrella · 25m prep + 10m buffer');

      // Step 2: Leave at 2:20 PM
      expect(timeline!.steps[1]!.time).toBe('2:20 PM');
      expect(timeline!.steps[1]!.detail).toBe('Drive · 30 min');

      // Step 3: Arrive at 2:50 PM (2:20 PM + 30m = 2:50 PM) with 10m buffer
      expect(timeline!.steps[2]!.time).toBe('2:50 PM');
      expect(timeline!.steps[2]!.detail).toBe('On time · 10m buffer');
    });
  });

  describe('4.3 Weather Copy Derivation & Static Check (Finding 2 Fix)', () => {
    it('derives weather copy strictly from signal issuedAt and excludes reference-art literals', () => {
      const comp = buildHomeComposition({
        plan: d2RainPlan,
        spatialEvidence: mockSpatialEvidence,
      });

      expect(comp.isRain).toBe(true);
      expect(comp.rainInsightDesc).toBeDefined();
      expect(comp.rainInsightDesc).toContain('issued 1:35 PM');
      expect(comp.rainInsightDesc).toContain('simulated');

      // Verify absence of reference-image literals
      expect(comp.rainInsightDesc).not.toContain('around 2:00 PM');
      expect(comp.rainInsightDesc).not.toContain('Heavier 2:00–4:00 PM');
      expect(comp.map?.weatherCallout?.subtext).not.toContain('2:00–4:00 PM');
    });
  });

  describe('4.4 Provenance Honesty for Sample vs Confirmed Facts (Finding 3 Fix)', () => {
    it('labels sample demo profile facts as Demo profile · sample and NEVER as Confirmed', () => {
      const comp = buildHomeComposition({
        plan: d3LunchPlan,
        spatialEvidence: mockSpatialEvidence,
        userConfirmedKeys: new Set(), // user has not confirmed taste
      });

      expect(comp.candidateCards).toBeDefined();
      expect(comp.candidateCards![0]!.basis).toContain('Demo profile · sample');
      expect(comp.candidateCards![0]!.basis).not.toContain('Confirmed');

      const options = deriveOptionCardVMs(d2RainPlan, new Set());
      expect(options[0]!.rankingBasis).toContain('Demo profile · sample');
      expect(options[0]!.rankingBasis).not.toContain('Confirmed');
    });

    it('labels facts as You confirmed when present in userConfirmedKeys', () => {
      const comp = buildHomeComposition({
        plan: d3LunchPlan,
        spatialEvidence: mockSpatialEvidence,
        userConfirmedKeys: new Set(['taste_preference']),
      });

      expect(comp.candidateCards![0]!.basis).toContain('You confirmed');

      const options = deriveOptionCardVMs(d2RainPlan, new Set(['rain_transport_preference']));
      expect(options[0]!.rankingBasis).toContain('You confirmed');
    });
  });

  describe('4.5 Candidate Cards & Compact Map (Lunch Away)', () => {
    it('derives CandidateCardVMs paired with local SVG illustrations', () => {
      const comp = buildHomeComposition({
        plan: d3LunchPlan,
        spatialEvidence: mockSpatialEvidence,
      });

      expect(comp.layoutKind).toBe('candidates');
      expect(comp.candidateCards).toBeDefined();
      expect(comp.candidateCards).toHaveLength(3);

      const placeA = comp.candidateCards![0]!;
      expect(placeA.name).toBe('Demo Place A · Ramen');
      expect(placeA.cuisine).toBe('Japanese');
      expect(placeA.distanceMinutes).toBe(5);
      expect(placeA.distanceText).toBe('5m away');
      expect(placeA.photo.category).toBe('ramen');
      expect(placeA.photo.simulatedBadge).toBe('Illustration · simulated');
      expect(placeA.photo.svgMarkup).toContain('<svg');

      const placeB = comp.candidateCards![1]!;
      expect(placeB.name).toBe('Demo Place B · Salad');
      expect(placeB.cuisine).toBe('Salad');
      expect(placeB.photo.category).toBe('salad');

      const placeC = comp.candidateCards![2]!;
      expect(placeC.name).toBe('Demo Place C · Sushi');
      expect(placeC.cuisine).toBe('Japanese');
      expect(placeC.photo.category).toBe('sushi');
    });

    it('derives compact MapVM for lunch candidates', () => {
      const map = deriveMapVM(d3LunchPlan, mockSpatialEvidence, 'compact');
      expect(map).toBeDefined();
      expect(map!.sizeHint).toBe('compact');
      expect(map!.simulatedBadge).toBe('Schematic · simulated');
      // User location + 3 candidates
      expect(map!.markers).toHaveLength(4);
      expect(map!.polylines).toHaveLength(3);
    });
  });

  describe('4.6 Empty Group Collapse (§4 Non-monotonous Layout)', () => {
    it('collapses AHEAD and FOR YOU when empty (zero empty placeholder cards)', () => {
      const comp = buildHomeComposition({
        plan: d2RainPlan,
        spatialEvidence: mockSpatialEvidence,
        aheadPlans: [],
        proposals: [],
      });

      expect(comp.aheadItems).toHaveLength(0);
      expect(comp.proposals).toHaveLength(0);
    });

    it('populates AHEAD and FOR YOU only when real items exist', () => {
      const comp = buildHomeComposition({
        plan: d2RainPlan,
        spatialEvidence: mockSpatialEvidence,
        aheadPlans: [d3LunchPlan],
        proposals: [{ key: 'prep_buffer_preference', value: '10m' }],
      });

      expect(comp.aheadItems).toHaveLength(1);
      expect(comp.aheadItems[0]!.title).toBe('Lunch options near you');

      expect(comp.proposals).toHaveLength(1);
      expect(comp.proposals[0]!.title).toContain('prep & buffer');
    });

    it('renders honest quiet state when no plan is scheduled (D4)', () => {
      const comp = buildHomeComposition({
        plan: null,
        spatialEvidence: null,
      });

      expect(comp.layoutKind).toBe('quiet');
      expect(comp.timeline).toBeUndefined();
      expect(comp.map).toBeUndefined();
      expect(comp.options).toHaveLength(0);
      expect(comp.aheadItems).toHaveLength(0);
      expect(comp.proposals).toHaveLength(0);
    });
  });

  describe('4.7 Static Check: Zero External Image URLs (Data Honesty)', () => {
    it('verifies all files in src/ui/view-models/ contain ZERO external image URLs', () => {
      const vmDir = path.resolve(process.cwd(), 'src/ui/view-models');
      const files = fs.readdirSync(vmDir).filter(f => f.endsWith('.ts'));

      for (const file of files) {
        const content = fs.readFileSync(path.join(vmDir, file), 'utf-8');
        expect(content).not.toMatch(/https?:\/\/[^\s"']+\.(png|jpg|jpeg|webp|gif)/i);
        expect(content).not.toMatch(/src=["']https?:\/\//i);
      }
    });

    it('verifies illustration helper outputs local SVGs without remote references', () => {
      const illustrations = [
        getLocalIllustration('ramen'),
        getLocalIllustration('salad'),
        getLocalIllustration('sushi'),
        getLocalIllustration('cafe'),
        getLocalIllustration('italian'),
        getLocalIllustration('unknown'),
      ];

      for (const ill of illustrations) {
        expect(ill.simulatedBadge).toBe('Illustration · simulated');
        expect(ill.svgMarkup).toContain('<svg');
        expect(ill.svgMarkup).not.toMatch(/https?:\/\/[^\s"']+\.(png|jpg|jpeg|webp|gif)/i);
        expect(ill.svgMarkup).not.toMatch(/src=["']https?:\/\//i);
        expect(ill.svgMarkup).not.toMatch(/xlink:href=["']https?:\/\//i);
        expect(ill.svgMarkup).not.toMatch(/href=["']https?:\/\//i);
      }
    });
  });
});

describe('UI-QUIET-PRECISION increment 2: Live location consent and denied copy', () => {
  const snap = (status: string, extra: any[] = []) =>
    ({
      asOf: '2026-11-04T03:00:00.000Z',
      timezone: 'Asia/Tokyo',
      signals: [{ id: 'loc', kind: 'location_status', value: { status }, issuedAt: '2026-11-04T03:00:00.000Z', source: 'live' }, ...extra],
    }) as any;

  it('Live prompt: sentence-case title, one plain purpose line, no basis line', () => {
    const vm = buildHomeComposition({ plan: null, spatialEvidence: null, snapshot: snap('prompt'), isLive: true } as any);
    expect(vm.title).toBe('Use your location');
    expect(vm.headline).toBe('Yori uses it to find lunch places near you.');
    expect(vm.basis).toBe('');
    expect(vm.locationState).toBe('prompt');
  });

  it('Live prompt with a calendar event names the route purpose', () => {
    const cal = { id: 'cal', kind: 'calendar', value: { title: 'Review' }, issuedAt: '2026-11-04T03:00:00.000Z', source: 'live' };
    const vm = buildHomeComposition({ plan: null, spatialEvidence: null, snapshot: snap('prompt', [cal]), isLive: true } as any);
    expect(vm.headline).toBe('Yori uses it to work out when you should leave.');
  });

  it('Live denied: no "enter coordinates manually" line', () => {
    const vm = buildHomeComposition({ plan: null, spatialEvidence: null, snapshot: snap('denied'), isLive: true } as any);
    expect(`${vm.title} ${vm.headline} ${vm.basis}`).not.toMatch(/coordinates manually|fails closed/);
  });

  it('Demo keeps its own copy (city presets and manual coordinates exist there)', () => {
    const vm = buildHomeComposition({ plan: null, spatialEvidence: null, snapshot: snap('prompt'), isLive: false } as any);
    expect(vm.title).toBe('Location Needed');
  });
});
