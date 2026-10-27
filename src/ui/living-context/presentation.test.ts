import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  getGreeting,
  formatNowPlan,
} from './presentation.js';
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
      // 17:00 UTC = 10:00 AM in LA (morning), but 02:00 AM next day in Tokyo (morning)
      const iso = '2026-10-28T05:00:00.000Z';
      // In Tokyo (UTC+9), 05:00Z is 14:00 (afternoon)
      const tokyoResult = getGreeting(iso, 'Asia/Tokyo');
      expect(tokyoResult.greeting).toBe(STRINGS.header.greetings.afternoon);

      // In London (UTC+0), 05:00Z is 05:00 (morning)
      const londonResult = getGreeting(iso, 'Europe/London');
      expect(londonResult.greeting).toBe(STRINGS.header.greetings.morning);
    });

    it('falls back safely on invalid date strings', () => {
      const fallback = getGreeting('invalid-date');
      expect(fallback.greeting).toBe(STRINGS.header.greetings.afternoon);
    });
  });

  describe('formatNowPlan Presentation Shielding (Finding 1 & 2)', () => {
    it('shields Clear depart card from raw formulas and internal keys', () => {
      const rawPlan: PreparedPlan = {
        id: 'plan-1',
        intentId: 'depart',
        headline: 'Depart: prepare 2:05 PM, leave 2:25 PM',
        optionsOrSteps: [],
        requiresConfirmation: false,
        createdAt: '2026-10-28T17:00:00.000Z',
        why: {
          evidenceSignals: [],
          memoryFactsUsed: [],
          derivation: '14:05 prep = 15:00 appt - 30m travel - 5m buffer - 20m prep',
        },
      };

      const formatted = formatNowPlan(rawPlan, 'clear');
      expect(formatted.title).toBe(STRINGS.depart.defaultTitle);
      expect(formatted.headline).toContain('2:05 PM');
      expect(formatted.headline).toContain('2:25 PM');
      expect(formatted.basis).toBe(STRINGS.depart.basisLine);
      expect(formatted.basis).not.toContain('appt -');
      expect(formatted.basis).not.toContain('buffer');
    });

    it('formats Rain re-plan with human sentences and no raw memory keys', () => {
      const rawPlan: PreparedPlan = {
        id: 'plan-2',
        intentId: 'depart',
        headline: 'Rain re-plan: drive leave 2:30 PM',
        optionsOrSteps: [],
        requiresConfirmation: false,
        createdAt: '2026-10-28T20:35:00.000Z',
        why: {
          evidenceSignals: [],
          memoryFactsUsed: [],
          derivation: 'Rain re-plan: ranked by confirmed rain_transport_preference (drive_first)',
        },
      };

      const formatted = formatNowPlan(rawPlan, 'rain');
      expect(formatted.isRain).toBe(true);
      expect(formatted.rainBanner).toBe('What changed: rain forecast');
      expect(formatted.umbrellaChip).toBe('Umbrella');
      expect(formatted.habitNote).toBe('You usually prefer driving when it rains.');
      expect(formatted.habitNote).not.toContain('rain_transport_preference');
      expect(formatted.options[0]?.label).toBe('Drive · leave 2:30');
      expect(formatted.options[1]?.label).toBe('Bus · leave 2:15');
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
          } as unknown as { id: string; label: string; requiresConfirmation: boolean },
          {
            id: 'opt-2',
            label: 'Demo Place B · Salad (salad) · 7m away',
            name: 'Demo Place B · Salad',
            cuisine: 'salad',
            distanceMinutes: 7,
            requiresConfirmation: false,
          } as unknown as { id: string; label: string; requiresConfirmation: boolean },
        ],
        requiresConfirmation: false,
        createdAt: '2026-10-28T19:10:00.000Z',
        why: {
          evidenceSignals: [],
          memoryFactsUsed: [],
          derivation: 'Recommended 2 options matching confirmed taste preferences (taste_preference=ramen_or_salad).',
        },
      };

      const formatted = formatNowPlan(rawPlan, 'away-lunch');
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
});
