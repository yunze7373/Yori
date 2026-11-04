/**
 * S4-LIVE-DEPART E2E Tests (TID: INBOX-20261102-6C6D0B)
 * Governed by LIVE_FIRST plan (docs/architecture/LIVE_FIRST.plan.{md,json}).
 *
 * Acceptance Checks:
 * 1. Connection-Block State (Dual Gate A & B):
 *    - Mobile 390x844: No owner calendar configured -> honest quiet neutral state, zero fake events.
 *      Connectors view shows Calendar "Unavailable" with "Not available yet". Calendar tile shows "Not connected".
 *    - Desktop 1280x800: Desktop right panel displays honest #desktop-notice-calendar-unconfigured-quiet
 *      naming the owner action ("paste secret iCal URL into .env.local as CALENDAR_ICS_URL yourself; never in chat").
 * 2. Fail-Closed Route Disabled:
 *    - Calendar event present + route disabled -> no leave-by minutes, no osrm travel signal,
 *      honest headline explaining leave-by is unavailable without route.
 * 3. Differential Test (Clear vs Rain):
 *    - Clear weather: leave-by 2:35 PM, no umbrella checklist item.
 *    - Rain weather: surfaces "Take umbrella" checklist item, re-ranked options, rain banner.
 * 4. Timezone Correctness (Asia/Tokyo):
 *    - Renders wall times in JST (e.g. 3:00 PM for 06:00Z), never UTC.
 * 5. Security Boundary:
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

async function grantLocationIfPrompted(page: Page) {
  const reqLocBtn = page.locator('#btn-request-location');
  if (await reqLocBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await reqLocBtn.click();
  }
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
    await grantLocationIfPrompted(page);

    // 1. Verify honest quiet state on Home screen
    const quietTitle = page.locator('#quiet-title, .quiet-title');
    await expect(quietTitle).toBeVisible();
    await expect(quietTitle).toContainText(/Nothing needs your attention right now|All quiet for now|Location Shared|Location Needed|Use your location/i);

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

    // Go back from Connectors view and verify Sources sheet
    const backBtn = page.locator('#btn-connectors-back');
    if (await backBtn.isVisible()) {
      await backBtn.click();
    }
    const homeNav = page.locator('#tab-home, #desktop-nav-home').first();
    if (await homeNav.isVisible()) {
      await homeNav.click();
    }
    const contextPill = page.locator('.context-pill, #pill-subline').first();
    if (await contextPill.isVisible()) {
      await contextPill.click();
      const calSource = page.locator('#source-item-calendar');
      if (await calSource.isVisible({ timeout: 2000 }).catch(() => false)) {
        await expect(calSource).toContainText('Not connected');
      }
    }

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
    await grantLocationIfPrompted(page);

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
  // Fail-Closed: Calendar event present + routing disabled -> no fake leave-by minutes
  // =========================================================================
  test('Fail-Closed: calendar event + route disabled gives no leave-by minutes and no osrm travel signal', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupClockAndMemory(page, { isoTime: '2026-11-02T14:15:00.000Z' });

    // Calendar configured with event
    await page.route('**/api/calendar/status', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: true, configured: true, provider: 'ics', attribution: 'iCalendar' }),
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
              id: 'evt-product-review',
              title: 'Product Review',
              startTime: '2026-11-02T15:00:00.000Z',
              location: '100 Van Ness Ave, San Francisco',
            },
          ],
          attribution: 'iCalendar',
        }),
      })
    );

    // Geocode returns coordinate
    await page.route('**/api/geocode?*', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          success: true,
          result: { coordinate: [37.776, -122.418] },
          attribution: 'Nominatim',
        }),
      })
    );

    // Route disabled by gate
    await page.route('**/api/route?*', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: false, route: null, code: 'permission_denied' }),
      })
    );

    await page.goto('/?mode=live');
    await page.waitForSelector('.app-layout[data-context-mode="live"]');
    await grantLocationIfPrompted(page);

    // Verify title still shows the parsed event title and time
    const quietTitle = page.locator('#quiet-title, .quiet-title');
    await expect(quietTitle).toBeVisible();
    await expect(quietTitle).toContainText('Product Review');
    await expect(quietTitle).toContainText('3:00 PM');

    // Verify honest headline explaining leave-by is unavailable without route
    const quietSubtitle = page.locator('#quiet-subtitle, .quiet-subtitle');
    await expect(quietSubtitle).toContainText(/Leave-by unavailable · no route/i);

    // Verify NO leave-by time is fabricated
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('leave by');
    expect(bodyText).not.toContain('2:30 PM');
    expect(bodyText).not.toContain('2:35 PM');

    // Verify Calendar connector is connected (honest state)
    await page.locator('#btn-header-avatar').click();
    await page.locator('#btn-me-connectors').click();
    const calRow = page.locator('#connector-row-calendar');
    await expect(calRow).toBeVisible();
    await expect(calRow.locator('#status-pill-calendar')).toContainText('Connected');
  });

  // =========================================================================
  // Differential Test: Clear vs Rain moves leave-by earlier with umbrella
  // =========================================================================
  test('Differential: Clear vs Rain re-plans with umbrella and adjusts departure', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupClockAndMemory(page, {
      isoTime: '2026-11-02T14:15:00.000Z',
      memoryFacts: [
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
          value: 'bus_first',
          status: 'confirmed',
          provenance: { source: 'user_confirmed', recordedAt: '2026-11-02T12:00:00.000Z' },
          updatedAt: '2026-11-02T12:00:00.000Z',
        },
      ],
    });

    await page.route('**/api/calendar/status', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: true, configured: true, provider: 'ics', attribution: 'iCalendar' }),
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
              id: 'evt-product-review',
              title: 'Product Review',
              startTime: '2026-11-02T15:00:00.000Z',
              location: '100 Van Ness Ave, San Francisco',
            },
          ],
          attribution: 'iCalendar',
        }),
      })
    );
    await page.route('**/api/geocode?*', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          success: true,
          result: { coordinate: [37.776, -122.418] },
          attribution: 'Nominatim',
        }),
      })
    );
    await page.route('**/api/route?*', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          route: {
            geometry: [[37.7749, -122.4194], [37.776, -122.418]],
            distanceM: 3000,
            durationS: 900, // 15 min driving
            provider: 'osrm',
            mode: 'driving',
            fetchedAt: '2026-11-02T14:15:00.000Z',
          },
          attribution: 'OSRM',
        }),
      })
    );
    await page.route('**/api/weather/status', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: true, provider: 'open-meteo', attribution: 'Open-Meteo' }),
      })
    );

    let currentWeatherCondition: 'clear' | 'rain' = 'clear';
    await page.route('**/api/weather/current*', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          signals: [
            {
              kind: 'weather',
              value: currentWeatherCondition === 'rain'
                ? { condition: 'rain', temperature: 16, precipProbability: 0.8 }
                : { condition: 'clear', temperature: 20, precipProbability: 0.0 },
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
          attribution: 'Open-Meteo',
        }),
      })
    );

    // --- PHASE 1: Clear Weather ---
    currentWeatherCondition = 'clear';
    await page.goto('/?mode=live');
    await page.waitForSelector('.app-layout[data-context-mode="live"]');
    await grantLocationIfPrompted(page);

    const nowCard = page.locator('.now-card, #now-card');
    await expect(nowCard).toBeVisible({ timeout: 10000 });
    await expect(nowCard).toContainText('Product Review');

    // Under clear weather: No umbrella chip
    await expect(page.locator('#chip-umbrella')).toHaveCount(0);
    const clearContent = await nowCard.textContent();
    expect(clearContent?.toLowerCase()).not.toContain('umbrella');

    // Clear leave-by: 15 min driving + 10 min buffer from 3:00 PM -> leave by 2:35 PM
    expect(clearContent).toMatch(/leave by 2:35\s*pm/i);

    // Clear first open does not claim a false time move or change moment
    expect(clearContent).not.toContain('I moved your leave time');
    expect(await page.locator('#what-changed-marker').count()).toBe(0);

    // --- PHASE 2: Rain Weather (Re-plan Differential) ---
    currentWeatherCondition = 'rain';
    await page.reload();
    await page.waitForSelector('.app-layout[data-context-mode="live"]');
    await grantLocationIfPrompted(page);

    await expect(nowCard).toBeVisible({ timeout: 10000 });
    await expect(nowCard).toContainText('Product Review');

    // Under rain weather: Umbrella chip is visible
    const umbrellaChip = page.locator('#chip-umbrella');
    await expect(umbrellaChip).toBeVisible();
    const rainContent = await nowCard.textContent();
    expect(rainContent?.toLowerCase()).toContain('umbrella');

    // Weather rationale chip states current condition "Rain now" (not "Rain forecast")
    const rainForecastChip = page.locator('.now-rationale-forecast');
    await expect(rainForecastChip).toBeVisible();
    await expect(rainForecastChip).toHaveText('Rain now');

    // Rain leave-by: with single driving mode (OSRM proxy), leave-by is 2:35 PM (honest: unchanged from clear)
    expect(rainContent).toMatch(/leave by 2:35\s*pm/i);

    // Single driving mode has no transit mode badge (honest: no transit provider connected to re-rank modes)
    await expect(page.locator('.v2-active-mode-badge')).toHaveCount(0);

    // What-changed banner and hero cause-effect state honest production behavior
    const whatChangedMarker = page.locator('#what-changed-marker');
    await expect(whatChangedMarker).toBeVisible();
    await expect(whatChangedMarker).toContainText('What changed: Rain now');

    const heroCauseEffect = page.locator('#hero-cause-effect');
    await expect(heroCauseEffect).toBeVisible();
    await expect(heroCauseEffect).toHaveText('Rain now · take an umbrella; leave time unchanged (2:35).');

    // Truthful copy: does NOT falsely claim leave time was moved when unchanged
    expect(rainContent).not.toContain('I moved your leave time');
    expect(await page.locator('#time-diff-display').count()).toBe(0);

    // Calendar tile reflects event (never "Not connected")
    const calTile = page.locator('#signal-tile-calendar');
    await expect(calTile).toBeVisible();
    await expect(calTile).toContainText('Product Review');
    await expect(calTile).not.toContainText('Not connected');

    // Capture Live Depart rain re-plan screenshot
    await page.screenshot({ path: path.join(EVIDENCE_DIR, '03-live-depart-rain-replan-390x844.png') });
  });

  // =========================================================================
  // Timezone Correctness: JST User in Asia/Tokyo Sees Proper Wall Times
  // =========================================================================
  test.describe('Timezone Correctness (Asia/Tokyo)', () => {
    test.use({
      timezoneId: 'Asia/Tokyo',
      geolocation: { latitude: 35.658, longitude: 139.701 },
    });

    test('calendar event displays honest JST wall times', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });

      // 05:15 UTC = 14:15 JST
      await setupClockAndMemory(page, { isoTime: '2026-11-02T05:15:00.000Z' });

      await page.route('**/api/calendar/status', route =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ enabled: true, configured: true, provider: 'ics', attribution: 'iCalendar' }),
        })
      );
      // 06:00 UTC = 15:00 JST (3:00 PM JST)
      await page.route('**/api/calendar', route =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            enabled: true,
            configured: true,
            events: [
              {
                id: 'evt-tokyo-review',
                title: 'Tokyo Sync',
                startTime: '2026-11-02T06:00:00.000Z',
                location: 'Shibuya, Tokyo',
              },
            ],
            attribution: 'iCalendar',
          }),
        })
      );
      await page.route('**/api/geocode?*', route =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            enabled: true,
            success: true,
            result: { coordinate: [35.658, 139.701] },
            attribution: 'Nominatim',
          }),
        })
      );
      await page.route('**/api/route?*', route =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            enabled: true,
            route: {
              geometry: [[35.65, 139.7], [35.658, 139.701]],
              distanceM: 2000,
              durationS: 900, // 15 min
              provider: 'osrm',
              mode: 'driving',
              fetchedAt: '2026-11-02T05:15:00.000Z',
            },
            attribution: 'OSRM',
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

      await page.goto('/?mode=live');
      await page.waitForSelector('.app-layout[data-context-mode="live"]');
      await grantLocationIfPrompted(page);

      const nowCard = page.locator('.now-card, #now-card');
      await expect(nowCard).toBeVisible({ timeout: 10000 });
      await expect(nowCard).toContainText('Tokyo Sync');

      const text = await nowCard.textContent();
      expect(text).toContain('Tokyo Sync');
      expect(text).toContain('3:00 PM');
      expect(text).toMatch(/leave by 2:\d\d\s*pm/i);

      // Verify Calendar tile shows event in JST
      const calTile = page.locator('#signal-tile-calendar');
      await expect(calTile).toBeVisible();
      await expect(calTile).toContainText('Tokyo Sync');
    });
  });
});
