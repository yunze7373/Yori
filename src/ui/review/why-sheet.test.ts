import { describe, it, expect } from 'vitest';
import {
  humanizeSignalKind,
  humanizeSignalDescription,
  humanizeSignalId,
  humanizeMemoryKey,
  humanizeMemoryValue,
  buildHumanDerivation,
  renderWhySheet,
  REASON_CODE_COPY,
} from './why-sheet.js';
import type { PreparedPlan, EvidenceCitation } from '../../core/contracts/index.js';

describe('Why Sheet & Derivation Provenance-Aware Copy', () => {
  const lunchPlanWithSampleFacts: PreparedPlan = {
    id: 'plan-lunch-test-sample',
    intentId: 'lunch',
    headline: 'Lunch options near you',
    optionsOrSteps: [],
    requiresConfirmation: false,
    timezone: 'America/Los_Angeles',
    createdAt: '2026-10-28T19:10:00.000Z',
    why: {
      evidenceSignals: [
        {
          kind: 'mock_places',
          source: 'simulated',
          issuedAt: '2026-10-28T19:10:00.000Z',
          description: 'Demo place list',
        },
        {
          kind: 'location_status',
          source: 'simulated',
          issuedAt: '2026-10-28T19:10:00.000Z',
          description: 'Away from home in Downtown',
        },
      ],
      memoryFactsUsed: [
        { key: 'taste_preference', value: 'ramen_or_salad', status: 'confirmed' },
        { key: 'favorite_cuisine', value: 'japanese', status: 'confirmed' },
      ],
      derivation: 'Recommended places matching sample taste preferences from the demo profile.',
    },
  };

  const departPlan: PreparedPlan = {
    id: 'plan-depart-test',
    intentId: 'depart',
    headline: 'Piano lesson at 3:00 PM',
    optionsOrSteps: [],
    requiresConfirmation: false,
    timezone: 'America/Los_Angeles',
    createdAt: '2026-10-28T20:35:00.000Z',
    apptAt: '2026-10-28T22:00:00.000Z',
    prepareAt: '2026-10-28T21:05:00.000Z',
    leaveAt: '2026-10-28T21:25:00.000Z',
    subjectTitle: 'Piano lesson',
    why: {
      evidenceSignals: [
        {
          kind: 'traffic',
          source: 'simulated',
          issuedAt: '2026-10-28T20:35:00.000Z',
        },
      ],
      memoryFactsUsed: [
        { key: 'prep_buffer_preference', value: 10, status: 'confirmed' },
      ],
      derivation: 'Scheduled preparation and departure.',
    },
  };

  describe('Signal Humanization', () => {
    it('humanizes mock_places signal kind to Nearby places', () => {
      expect(humanizeSignalKind('mock_places')).toBe('Nearby places');
      expect(humanizeSignalKind('places')).toBe('Nearby places');
      expect(humanizeSignalKind('eating_status')).toBe('Meal timing status');
      expect(humanizeSignalKind('location_status')).toBe('Current location status');
    });

    it('humanizes mock_places signal description to Demo place list', () => {
      const sig: EvidenceCitation = {
        kind: 'mock_places',
        source: 'simulated',
        issuedAt: '2026-10-28T19:10:00.000Z',
      };
      expect(humanizeSignalDescription(sig)).toBe('Demo place list');
    });

    it('humanizes mock_places signal ID with local timestamp', () => {
      const human = humanizeSignalId('mock_places:2026-10-28T19:10:00.000Z', 'America/Los_Angeles');
      expect(human).toContain('Nearby places');
      expect(human).toContain('12:10 PM');
    });
  });

  describe('buildHumanDerivation Provenance Awareness', () => {
    it('yields confirmed wording when memory facts are in userConfirmedKeys', () => {
      const userConfirmed = new Set(['taste_preference', 'favorite_cuisine']);
      const text = buildHumanDerivation(lunchPlanWithSampleFacts, userConfirmed);
      expect(text).toContain('align with your confirmed taste preferences');
      expect(text).not.toContain('sample');
    });

    it('yields sample wording without confirmed when memory facts are not user-confirmed', () => {
      const emptyConfirmed = new Set<string>();
      const text = buildHumanDerivation(lunchPlanWithSampleFacts, emptyConfirmed);
      expect(text).toContain('align with sample taste preferences from the demo profile');
      expect(text.toLowerCase()).not.toContain('confirmed');
    });

    it('yields confirmed preparation routine for depart when habit is user-confirmed', () => {
      const userConfirmed = new Set(['prep_buffer_preference']);
      const text = buildHumanDerivation(departPlan, userConfirmed);
      expect(text).toContain('your confirmed preparation routine');
      expect(text).not.toContain('sample');
    });

    it('yields sample preparation habits for depart when habit is not user-confirmed', () => {
      const emptyConfirmed = new Set<string>();
      const text = buildHumanDerivation(departPlan, emptyConfirmed);
      expect(text).toContain('sample preparation habits from the demo profile');
      expect(text.toLowerCase()).not.toContain('confirmed');
    });
  });

  describe('renderWhySheet Situation Attribution & Jargon Prevention', () => {
    it('renders domain-neutral confirmed preference attribution when user-confirmed', () => {
      const userConfirmed = new Set(['taste_preference', 'favorite_cuisine']);
      const html = renderWhySheet(
        lunchPlanWithSampleFacts,
        undefined,
        'America/Los_Angeles',
        userConfirmed,
        {
          signalId: 'mock_places:2026-10-28T19:10:00.000Z',
          reasonCode: 'matches_confirmed_preference',
          citedFactKeys: ['taste_preference', 'favorite_cuisine'],
        }
      );

      expect(html).toContain('Preference Matched');
      expect(html).toContain('Matches your confirmed preference');
      expect(html).not.toContain('travel preference'); // Domain-neutral fix
    });

    it('renders honest Sample Preference attribution when facts are from demo profile', () => {
      const emptyConfirmed = new Set<string>();
      const html = renderWhySheet(
        lunchPlanWithSampleFacts,
        undefined,
        'America/Los_Angeles',
        emptyConfirmed,
        {
          signalId: 'mock_places:2026-10-28T19:10:00.000Z',
          reasonCode: 'matches_confirmed_preference',
          citedFactKeys: ['taste_preference', 'favorite_cuisine'],
        }
      );

      // Situation Attribution
      expect(html).toContain('Sample Preference');
      expect(html).toContain('Matches a sample preference from the demo profile');

      // Situation section contains no "confirmed"
      const sitSection = html.match(/<section class="why-section" id="why-situation-section"[\s\S]*?<\/section>/);
      expect(sitSection).not.toBeNull();
      expect(sitSection![0].toLowerCase()).not.toContain('confirmed');

      // Evidence section has humanized Nearby places and Demo place list, zero raw jargon
      expect(html).toContain('Nearby places');
      expect(html).toContain('Demo place list');
      expect(html).not.toContain('mock places');
      expect(html).not.toContain('mock_places');
    });

    it('REASON_CODE_COPY.matches_confirmed_preference is domain-neutral', () => {
      expect(REASON_CODE_COPY['matches_confirmed_preference']!.description).not.toContain('travel');
      expect(REASON_CODE_COPY['matches_confirmed_preference']!.description).toBe('Matches your confirmed preference');
    });

    it('humanizes grocery preference keys and values cleanly (XKEYDEL-P2)', () => {
      expect(humanizeMemoryKey('grocery_store_preference')).toBe('Preferred grocery store');
      expect(humanizeMemoryKey('preferred_grocery_store')).toBe('Preferred grocery store');
      expect(humanizeMemoryValue('grocery_store_preference', 'Nijiya_Market')).toBe('Nijiya Market');
      expect(humanizeMemoryValue('preferred_grocery_store', 'Trader_Joes')).toBe('Trader Joes');
    });
  });
});
