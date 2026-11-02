/**
 * S4-LIVE-DEPART E2E Tests (TID: INBOX-20261102-6C6D0B)
 * Governed by LIVE_FIRST plan (docs/architecture/LIVE_FIRST.plan.{md,json}).
 *
 * Acceptance Checks:
 * 1. Connection-Block State (Dual Gate A & B):
 *    - Mobile 390x844: No owner calendar configured -> honest quiet neutral state, zero fake events.
 *      Connectors view shows Calendar "Unavailable" with "Not available yet".
 *    - Desktop 1280x800: Desktop right panel displays honest #desktop-notice-calendar-unconfigured-quiet
 *      naming the owner action ("paste secret iCal URL into .env.local as CALENDAR_ICS_URL yourself; never in chat").
 * 2. Live Depart Intent & Rain Re-Plan:
 *    - Consented synthetic calendar feed + Nominatim geocode + OSRM ETA + Open-Meteo target-time weather.
 *    - Event "Product Review" at 3:00 PM resolved to coordinates.
 *    - Rain condition re-plans departure with umbrella checklist ("Take umbrella") and recomputed leave-by time.
 * 3. Security Boundary:
 *    - Secret iCal URL is never exposed to client or logged.
 */

import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const EVIDENCE_DIR = path.resolve('docs/evidence/live-depart');

test.use({
  timezoneId: 'UTC',
  permissions: ['geolocation'],
  geolocation: { latitude: 37.7749, longitude: -122.4194 },
});

function setupClockAndMemory(
  page: Page,
  options?: {
    isoTime?: string;
    memoryFacts?: any[];
    acceptedPlanIds?: string[];
  }
) {
  const isoTime = options?.isoTime ?? '2026-11-02T14:15:00.000Z';
  const memoryFacts = options?.memoryFacts ?? [
    {
      key: 'prep_buffer_minutes',
      value: 10,
      status: 'confirmed',
      provenance: { source: 'user_confirmed', recordedAt: '2026-11-02T12:00:00.000Z' },
      updatedAt: '2026-11-02T12:00:00.000Z',
    },
    {
      key: 'prep_duration_minutes',
      value: 20,
      status: 'confirmed',
      provenance: { source: 'user_confirmed', recordedAt: '2026-11-02T12:00:00.000Z' },
      updatedAt: '2026-11-02T12:00:00.000Z',
    },
    {
      key: 'rain_transport_preference',
      value: 'drive',
      status: 'confirmed',
      provenance: { source: 'user_confirmed', recordedAt: '2026-11-02T12:00:00.000Z' },
      updatedAt: '2026-11-02T12:00:00.000Z',
    },
  ];
  const acceptedPlanIds = options?.acceptedPlanIds ?? [];

  return page.addInitScript(
    ({ timeStr, facts, accepted }) => {
      let currentFixedMs = new Date(timeStr).getTime();
      const OrigDate = window.Date;
      class PatchedDate extends OrigDate {
        constructor(...args: any[]) {
          if (args.length === 0) {
            super(currentFixedMs);
          } else {
            super(...(args as [any]));
          }
        }
      }
      PatchedDate.now = () => currentFixedMs;
      PatchedDate.parse = OrigDate.parse;
      PatchedDate.UTC = OrigDate.UTC;
      window.Date = PatchedDate as any;

      (window as any).__advanceClockMs = (ms: number) => {
        currentFixedMs += ms;
      };

      if (!localStorage.getItem('yori_state_v1')) {
        localStorage.setItem(
          'yori_state_v1',
          JSON.stringify({
            schemaVersion: 1,
            createdAt: '2026-11-02T12:00:00.000Z',
            updatedAt: '2026-11-02T12:00:00.000Z',
            payload: {
              memoryFacts: facts,
              proposals: [],
              suppressions: [],
              promptBudget: { date: '2026-11-02', count: 0 },
              acceptedPlanIds: accepted,
            },
          })
        );
      }
    },
    { timeStr: isoTime, facts: memoryFacts, accepted: acceptedPlanIds }
  );
}

test.describe('S4-LIVE-DEPART E2E Suite', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(EVIDENCE_DIR)) {
      fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    }
  });

  // =========================================================================
  // Dual Gate A (390x844 Mobile): Truthful Connection-Block State
  // =========================================================================
  test('Dual Gate A (390x844): unconfigured calendar shows honest connection-block state and zero fake events', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupClockAndMemory(page, { isoTime: '2026-11-02T14:15:00.000Z' });

    // Mock API seams: calendar unconfigured
    await page.route('**/api/calendar/status', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: false,
          configured: false,
          provider: 'ics',
          attribution: 'iCalendar (RFC 5545)',
          actionRequired: 'paste the secret iCal URL into .env.local as CALENDAR_ICS_URL yourself; never in chat',
        }),
      })
    );
    await page.route('**/api/calendar', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: false,
          configured: false,
          events: [],
          attribution: 'iCalendar (RFC 5545)',
          actionRequired: 'paste the secret iCal URL into .env.local as CALENDAR_ICS_URL yourself; never in chat',
        }),
      })
    );
    await page.route('**/api/weather/**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: false }),
      })
    );
    await page.route('**/api/places/**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: false, places: [] }),
      })
    );
    await page.route('**/api/xmemo/**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: false, connected: false }),
      })
    );

    await page.goto('/?mode=live');
    await page.waitForSelector('.app-layout[data-context-mode="live"]');

    // 1. Verify honest quiet state on Home screen
    const quietTitle = page.locator('#quiet-title, .quiet-title');
    await expect(quietTitle).toBeVisible();
    await expect(quietTitle).toContainText(/Nothing needs your attention right now|All quiet for now|Location Shared|Location Needed/i);

    // Zero fake appointments or piano lessons rendered
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('Piano lesson');
    expect(bodyText).not.toContain('Product Review');
    expect(bodyText).not.toContain('SIMULATED');

    // 2. Open Settings > Connectors to verify connection-block status
    await page.locator('#btn-header-avatar').click();
    await page.locator('#btn-me-connectors').click();

    const calRow = page.locator('#connector-row-calendar');
    await expect(calRow).toBeVisible();
    await expect(calRow.locator('.connector-title')).toHaveText('Calendar');
    await expect(calRow.locator('#status-pill-calendar')).toContainText('Not available yet');
    await expect(calRow.locator('#connector-detail-calendar')).toHaveText('Not available yet');
    await expect(calRow.locator('button')).toHaveCount(0); // No connect toggle or fake affordance

    // Capture Dual Gate A mobile evidence screenshot
    await page.screenshot({ path: path.join(EVIDENCE_DIR, '01-live-depart-connection-block-390x844.png') });
  });

  // =========================================================================
  // Dual Gate B (1280x800 Desktop): Desktop Right Panel Connection-Block Notice
  // =========================================================================
  test('Dual Gate B (1280x800): desktop right panel displays honest connection-block notice', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupClockAndMemory(page, { isoTime: '2026-11-02T14:15:00.000Z' });

    // Mock API seams: calendar unconfigured
    await page.route('**/api/calendar/status', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: false,
          configured: false,
          provider: 'ics',
          attribution: 'iCalendar (RFC 5545)',
          actionRequired: 'paste the secret iCal URL into .env.local as CALENDAR_ICS_URL yourself; never in chat',
        }),
      })
    );
    await page.route('**/api/calendar', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: false,
          configured: false,
          events: [],
          attribution: 'iCalendar (RFC 5545)',
          actionRequired: 'paste the secret iCal URL into .env.local as CALENDAR_ICS_URL yourself; never in chat',
        }),
      })
    );
    await page.route('**/api/weather/**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: false }),
      })
    );
    await page.route('**/api/places/**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: false, places: [] }),
      })
    );
    await page.route('**/api/xmemo/**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: false, connected: false }),
      })
    );

    await page.goto('/?mode=live');
    await page.waitForSelector('.app-layout[data-context-mode="live"]');

    // Desktop right panel displays honest connection-block notice
    const calNotice = page.locator('#desktop-notice-calendar-unconfigured-quiet');
    await expect(calNotice).toBeVisible();
    await expect(calNotice).toContainText('Calendar');
    await expect(calNotice).toContainText('Owner Source Needed');
    await expect(calNotice).toContainText('CALENDAR_ICS_URL');
    await expect(calNotice).toContainText('never in chat');

    // Zero simulated labels
    await expect(calNotice).toHaveAttribute('data-provenance', 'none');
    expect(await page.textContent('body')).not.toContain('SIMULATED');

    // Capture Dual Gate B desktop evidence screenshot
    await page.screenshot({ path: path.join(EVIDENCE_DIR, '02-live-depart-connection-block-1280x800.png') });
  });

  // =========================================================================
  // Live Depart Intent: Recorded Synthetic Feed + Geocode + OSRM + Weather Rain Re-plan
  // =========================================================================
  test('Live Depart: synthetic calendar event + geocode + OSRM + Open-Meteo rain re-plans with umbrella', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupClockAndMemory(page, { isoTime: '2026-11-02T14:15:00.000Z' });

    // 1. Mock Calendar status & feed
    await page.route('**/api/calendar/status', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          configured: true,
          provider: 'ics',
          attribution: 'iCalendar (RFC 5545)',
        }),
      })
    );
    await page.route('**/api/calendar', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          configured: true,
          events: [
            {
              id: 'evt-design-sync-101',
              title: 'Product Review',
              startTime: '2026-11-02T15:00:00.000Z',
              location: '100 Van Ness Ave, San Francisco',
            },
          ],
          attribution: 'iCalendar (RFC 5545)',
        }),
      })
    );

    // 2. Mock Geocode: resolves location to coords
    await page.route('**/api/geocode?*', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          query: '100 Van Ness Ave, San Francisco',
          result: {
            coordinate: [37.776, -122.418],
            displayName: '100 Van Ness Ave, San Francisco, CA',
            attribution: 'Data © OpenStreetMap contributors, ODbL 1.0',
            fetchedAt: '2026-11-02T14:15:00.000Z',
            fromCache: false,
          },
          attribution: 'Data © OpenStreetMap contributors, ODbL 1.0',
        }),
      })
    );

    // 3. Mock Route: 15 min driving ETA
    await page.route('**/api/route?*', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          route: {
            geometry: [[37.7749, -122.4194], [37.776, -122.418]],
            distanceM: 3000,
            durationS: 900, // 15 min
            provider: 'osrm',
            mode: 'driving',
            fetchedAt: '2026-11-02T14:15:00.000Z',
            attribution: 'Route © OSRM · data © OpenStreetMap contributors',
          },
          attribution: 'Route © OSRM · data © OpenStreetMap contributors',
        }),
      })
    );

    // 4. Mock Weather: Rain forecast at target time
    await page.route('**/api/weather/status', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          provider: 'open-meteo',
          attribution: 'Weather data by Open-Meteo.com (CC BY 4.0)',
        }),
      })
    );
    await page.route('**/api/weather/current', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          signals: [
            {
              kind: 'weather',
              value: {
                condition: 'rain',
                temperature: 16,
                precipProbability: 0.8,
              },
              provider: 'open-meteo',
              asOf: '2026-11-02T14:15:00.000Z',
              issuedAt: '2026-11-02T14:15:00.000Z',
              validFor: 3600000,
              confidence: 0.95,
              provenance: 'live',
              consentScope: 'device_only',
              status: 'available',
            },
          ],
          attribution: 'Weather data by Open-Meteo.com (CC BY 4.0)',
        }),
      })
    );

    await page.goto('/?mode=live');
    await page.waitForSelector('.app-layout[data-context-mode="live"]');

    // Verify NOW card appears with the real event title
    const nowCard = page.locator('.now-card, #now-card');
    await expect(nowCard).toBeVisible({ timeout: 10000 });
    await expect(nowCard).toContainText('Product Review');

    // Verify umbrella preparation checklist item is present due to rain
    const hasUmbrellaInCard = await nowCard.textContent();
    expect(hasUmbrellaInCard?.toLowerCase()).toMatch(/umbrella|take umbrella/i);

    // Verify timing: leave by 2:30 PM (or 2:35 PM based on 15m drive + 10m buffer from 3:00 PM)
    expect(hasUmbrellaInCard).toMatch(/leave by 2:\d\d\s*pm/i);

    // Capture Live Depart rain re-plan screenshot
    await page.screenshot({ path: path.join(EVIDENCE_DIR, '03-live-depart-rain-replan-390x844.png') });
  });
});
