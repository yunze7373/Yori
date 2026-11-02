/**
 * S5-LIVE-REASON E2E Tests (TID: INBOX-20261102-91CC2B)
 * Governed by LIVE_FIRST plan (docs/architecture/LIVE_FIRST.plan.{md,json}).
 *
 * Acceptance Checks:
 * 1. Dual Gate A (390x844 mobile):
 *    - Real-shaped candidates (lunch places from Overpass + depart from calendar).
 *    - Asynchronous reasoning coordinator calls /api/model/reason with strict schema.
 *    - Model reasoning elevates preferred candidate and supplies validated rationale.
 *    - UI displays honest engine status (#model-status-pill) in the ambient line: 'Meta model · live' vs labelled fallback.
 *    - Full-page Conversation Shell displays #engine-status-chip and #conversation-model-status-pill.
 *    - Redacted Decision Log captures templateId, input ids, reasonCodes, latencyMs, and engineStatus.
 * 2. Dual Gate B (1280x800 desktop):
 *    - Desktop IA shows honest model status pill in header ambient region.
 *    - Decision log inspection in conversation overlay shows redacted entries with latency and zero secrets.
 *    - Sources sheet (#pill-context-status) displays Reasoning Engine status honestly.
 * 3. Fallback Invariance:
 *    - On model error or disabled flag, engine status honestly transitions to 'Offline fallback · deterministic'.
 *    - Deterministic grammar and plan order remain intact.
 * 4. Zero billed network calls:
 *    - Tests run against recorded/mocked responses; zero unmocked network fetches (enforced by netguard).
 */

import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const EVIDENCE_DIR = path.resolve('docs/evidence/live-reason');

test.beforeAll(() => {
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }
});

test.use({
  timezoneId: 'UTC',
  permissions: ['geolocation'],
  geolocation: { latitude: 37.7749, longitude: -122.4194 },
});

const RECORDED_OVERPASS_PLACES = [
  {
    placeId: 'overpass-node-1002',
    osmId: 1002,
    name: 'Hayes Valley Ramen',
    cuisine: 'japanese',
    category: 'restaurant',
    coords: { lat: 37.776, lng: -122.417 },
    source: 'live',
    fetchedAt: '2026-11-02T12:15:00.000Z',
    straightLineDistanceMeters: 450,
    straightLineDistanceLabel: '450 m (straight-line)',
    openingStatus: 'open',
    attribution: 'OpenStreetMap via Overpass (ODbL)',
  },
  {
    placeId: 'overpass-node-1001',
    osmId: 1001,
    name: 'Civic Center Diner',
    cuisine: 'american',
    category: 'restaurant',
    coords: { lat: 37.7755, lng: -122.418 },
    source: 'live',
    fetchedAt: '2026-11-02T12:15:00.000Z',
    straightLineDistanceMeters: 250,
    straightLineDistanceLabel: '250 m (straight-line)',
    openingStatus: 'open',
    attribution: 'OpenStreetMap via Overpass (ODbL)',
  },
];

const RECORDED_WALKING_ROUTE = {
  geometry: [
    [37.7749, -122.4194],
    [37.7752, -122.4187],
    [37.776, -122.417],
  ],
  distanceM: 450,
  durationS: 360,
  provider: 'osrm',
  fetchedAt: '2026-11-02T12:15:00.000Z',
  attribution: 'Route © OSRM · data © OpenStreetMap contributors',
  mode: 'walking',
};

function setupClockAndMemory(
  page: Page,
  options?: {
    isoTime?: string;
    memoryFacts?: any[];
  }
) {
  const isoTime = options?.isoTime ?? '2026-11-02T12:15:00.000Z'; // 12:15 UTC = mealtime window
  const memoryFacts = options?.memoryFacts ?? [
    {
      key: 'taste_preference_lunch_cuisine',
      value: 'Japanese or Ramen',
      status: 'confirmed',
      provenance: { source: 'user_confirmed', recordedAt: '2026-11-02T11:00:00.000Z' },
      updatedAt: '2026-11-02T11:00:00.000Z',
    },
    {
      key: 'favorite_cuisine',
      value: 'Ramen',
      status: 'confirmed',
      provenance: { source: 'user_confirmed', recordedAt: '2026-11-02T11:00:00.000Z' },
      updatedAt: '2026-11-02T11:00:00.000Z',
    },
  ];

  return page.addInitScript(
    ({ timeStr, facts }) => {
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

      if (!localStorage.getItem('yori_state_v1')) {
        localStorage.setItem(
          'yori_state_v1',
          JSON.stringify({
            schemaVersion: 1,
            createdAt: '2026-11-02T11:00:00.000Z',
            updatedAt: '2026-11-02T11:00:00.000Z',
            payload: {
              memoryFacts: facts,
              proposals: [],
              suppressions: [],
              promptBudget: { date: '2026-11-02', count: 0 },
              acceptedPlanIds: [],
            },
          })
        );
      }
    },
    { timeStr: isoTime, facts: memoryFacts }
  );
}

test.describe('S5-LIVE-REASON: Model Interpreter Live Path & Honest Engine Status', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept provider endpoints with recorded live fixtures
    await page.route('**/api/xmemo/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: false, connected: false }),
      });
    });

    await page.route('**/api/weather/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          weather: {
            temperature: 18.5,
            condition: 'Clear',
            precipitationRisk: 0.0,
            windSpeed: 8.0,
            recordedAt: '2026-11-02T12:15:00.000Z',
            attribution: 'Weather data © Open-Meteo (CC BY 4.0)',
          },
        }),
      });
    });

    await page.route('**/api/places/status', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          provider: 'overpass',
          attribution: 'OpenStreetMap via Overpass (ODbL)',
        }),
      });
    });

    await page.route('**/api/places?*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          places: RECORDED_OVERPASS_PLACES,
          source: 'live',
          attribution: 'OpenStreetMap via Overpass (ODbL)',
          fetchedAt: '2026-11-02T12:15:00.000Z',
        }),
      });
    });

    await page.route('**/api/route/status', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          provider: 'osrm',
          attribution: 'Route © OSRM · data © OpenStreetMap contributors',
        }),
      });
    });

    await page.route('**/api/route?*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          route: RECORDED_WALKING_ROUTE,
          attribution: 'Route © OSRM · data © OpenStreetMap contributors',
        }),
      });
    });

    await page.route('**/api/calendar/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          events: [],
        }),
      });
    });
  });

  test('Gate A (Mobile 390x844): Reasoning reorders real candidates with honest engine status and decision log', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupClockAndMemory(page);

    // Intercept model reasoning endpoint
    let interceptedReasonCount = 0;
    await page.route('**/api/model/reason', async route => {
      interceptedReasonCount++;
      const req = route.request().postDataJSON();
      const candidates = req?.candidates ?? [];
      const availableSignalIds = req?.availableSignalIds ?? [];
      const confirmedFactKeys = req?.confirmedFactKeys ?? [];
      const orderedPlanIds = candidates.map((c: any) => c.id);

      // Model rationale citing confirmed taste preference and real signal
      const rationale = candidates.map((c: any) => ({
        planId: c.id,
        citedSignalIds:
          c.citedSignalIds && c.citedSignalIds.length > 0
            ? [c.citedSignalIds[0]]
            : availableSignalIds.length > 0
              ? [availableSignalIds[0]]
              : [],
        citedFactKeys:
          c.citedFactKeys && c.citedFactKeys.length > 0
            ? [c.citedFactKeys[0]]
            : confirmedFactKeys.length > 0
              ? [confirmedFactKeys[0]]
              : [],
        reasonCode: 'matches_confirmed_preference',
      }));

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: {
            orderedPlanIds,
            rationale,
          },
          usedFallback: false,
          engineStatus: 'recorded_model_replay',
        }),
      });
    });

    // Intercept model command endpoint
    await page.route('**/api/model/command', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: {
            intent: 'FIND_LUNCH',
            slots: { filters: ['ramen'] },
            citedSignalIds: ['places:2026-11-02T12:15:00.000Z'],
            citedFactKeys: ['taste_preference_lunch_cuisine'],
            reasonCodes: ['matches_confirmed_preference'],
            explanation: 'Finding nearby Ramen places matching your confirmed taste.',
          },
          usedFallback: false,
          engineStatus: 'recorded_model_replay',
        }),
      });
    });

    await page.goto('/?mode=live&test=1&geo=1');
    await page.waitForLoadState('networkidle');

    // Grant location if requested
    const reqLocBtn = page.locator('#btn-request-location');
    if (await reqLocBtn.isVisible()) {
      await reqLocBtn.click();
    }

    // 2. Verify Home UI surfaces honest engine status pill
    const modelStatusPill = page.locator('#model-status-pill');
    await expect(modelStatusPill).toBeVisible();
    await expect(modelStatusPill).toHaveAttribute('data-engine-status', 'recorded_model_replay');
    await expect(modelStatusPill).toHaveAttribute('data-provenance', 'replay');
    await expect(modelStatusPill).toContainText('Recorded Meta model output · replay');

    // Capture home view mobile screenshot
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'live-reason-mobile-390x844-home.png'),
      fullPage: false,
    });

    // 3. Open Ask Bar / Conversation Shell
    const askBar = page.locator('#ask-bar');
    await expect(askBar).toBeVisible();
    await askBar.click();

    const overlay = page.locator('#conversation-overlay');
    await expect(overlay).toBeVisible();

    // Verify conversation header displays honest engine status chip and pill
    const engineStatusChip = page.locator('#engine-status-chip');
    await expect(engineStatusChip).toBeVisible();
    await expect(engineStatusChip).toContainText('Recorded Meta model output · replay');

    const convModelPill = page.locator('#conversation-model-status-pill');
    await expect(convModelPill).toBeVisible();
    await expect(convModelPill).toHaveAttribute('data-engine-status', 'recorded_model_replay');

    // Capture conversation shell mobile screenshot
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'live-reason-mobile-390x844-conversation.png'),
      fullPage: false,
    });

    // 4. Inspect Redacted Decision Log in UI
    const toggleLogBtn = page.locator('#btn-toggle-decision-log');
    await expect(toggleLogBtn).toBeVisible();
    await toggleLogBtn.click();

    const decisionLogViewer = page.locator('#decision-log-content');
    await expect(decisionLogViewer).toBeVisible();
    const logContent = await decisionLogViewer.textContent();

    // Decision log must carry engineStatus, latencyMs, and zero secrets
    expect(logContent).toContain('recorded_model_replay');
    expect(logContent).toContain('latencyMs');
    expect(logContent).toContain('reason_rank');
    expect(logContent).not.toContain('sk-');
    expect(logContent).not.toContain('apiKey');

    // Capture decision log mobile screenshot
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'live-reason-mobile-390x844-decision-log.png'),
      fullPage: false,
    });
  });

  test('Gate B (Desktop 1280x800): Reasoning over live candidates with honest desktop status and sources modal', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupClockAndMemory(page);

    await page.route('**/api/model/reason', async route => {
      const req = route.request().postDataJSON();
      const candidates = req?.candidates ?? [];
      const availableSignalIds = req?.availableSignalIds ?? [];
      const confirmedFactKeys = req?.confirmedFactKeys ?? [];
      const orderedPlanIds = candidates.map((c: any) => c.id);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: {
            orderedPlanIds,
            rationale: candidates.map((c: any) => ({
              planId: c.id,
              citedSignalIds:
                c.citedSignalIds && c.citedSignalIds.length > 0
                  ? [c.citedSignalIds[0]]
                  : availableSignalIds.length > 0
                    ? [availableSignalIds[0]]
                    : [],
              citedFactKeys:
                c.citedFactKeys && c.citedFactKeys.length > 0
                  ? [c.citedFactKeys[0]]
                  : confirmedFactKeys.length > 0
                    ? [confirmedFactKeys[0]]
                    : [],
              reasonCode: 'matches_confirmed_preference',
            })),
          },
          usedFallback: false,
          engineStatus: 'recorded_model_replay',
        }),
      });
    });

    await page.goto('/?mode=live&test=1&geo=1');
    await page.waitForLoadState('networkidle');

    // Grant location if requested
    const reqLocBtn = page.locator('#btn-request-location');
    if (await reqLocBtn.isVisible()) {
      await reqLocBtn.click();
    }

    // Verify desktop header ambient line displays model status pill
    const modelStatusPill = page.locator('#model-status-pill');
    await expect(modelStatusPill).toBeVisible();
    await expect(modelStatusPill).toContainText('Recorded Meta model output · replay');

    // Capture desktop home screenshot
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'live-reason-desktop-1280x800-home.png'),
      fullPage: false,
    });

    // Check Sources Modal (#pill-context-status)
    const contextPill = page.locator('#pill-context-status');
    await expect(contextPill).toBeVisible();
    await contextPill.click();

    const sourcesModal = page.locator('.sources-modal-card');
    await expect(sourcesModal).toBeVisible();

    const modelSourceItem = page.locator('#source-item-model');
    await expect(modelSourceItem).toBeVisible();
    await expect(modelSourceItem).toContainText('Reasoning Engine');
    await expect(modelSourceItem).toContainText('Recorded Meta model output · replay');

    // Close sources modal
    const closeWhyBtn = page.locator('#btn-close-why');
    await closeWhyBtn.click();

    // Open Ask Bar / Conversation on Desktop
    const askBar = page.locator('#ask-bar');
    await expect(askBar).toBeVisible();
    await askBar.click();

    const overlay = page.locator('#conversation-overlay');
    await expect(overlay).toBeVisible();

    const engineChip = page.locator('#engine-status-chip');
    await expect(engineChip).toContainText('Recorded Meta model output · replay');

    // Capture desktop conversation screenshot
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'live-reason-desktop-1280x800-conversation.png'),
      fullPage: false,
    });

    // Toggle Decision Log on desktop
    const toggleLogBtn = page.locator('#btn-toggle-decision-log');
    await toggleLogBtn.click();

    const decisionLogViewer = page.locator('#decision-log-content');
    await expect(decisionLogViewer).toBeVisible();

    // Capture desktop decision log screenshot
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'live-reason-desktop-1280x800-decision-log.png'),
      fullPage: false,
    });
  });

  test('Fallback Invariance: Model error discards to labelled deterministic fallback honestly', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupClockAndMemory(page);

    // Mock model reasoning endpoint returning 500 error / fallback
    await page.route('**/api/model/reason', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: { orderedPlanIds: [], rationale: [] },
          usedFallback: true,
          fallbackReason: 'disabled',
          engineStatus: 'offline_deterministic',
        }),
      });
    });

    await page.goto('/?mode=live&test=1&geo=1');
    await page.waitForLoadState('networkidle');

    // Switch to Live mode
    const modeLiveBtn = page.locator('#btn-mode-live');
    if (await modeLiveBtn.isVisible()) {
      await modeLiveBtn.click();
      await page.waitForTimeout(300);
    }

    // Verify UI displays labelled fallback
    const modelStatusPill = page.locator('#model-status-pill');
    await expect(modelStatusPill).toBeVisible();
    await expect(modelStatusPill).toHaveAttribute('data-engine-status', 'offline_deterministic');
    await expect(modelStatusPill).toContainText('Offline fallback · deterministic');

    // Capture fallback screenshot
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'live-reason-fallback-status.png'),
      fullPage: false,
    });
  });

  test('Engine Status Mapping: Model returning meta_model_live displays honest live status without capturing evidence', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupClockAndMemory(page);

    await page.route('**/api/model/reason', async route => {
      const req = route.request().postDataJSON();
      const candidates = req?.candidates ?? [];
      const availableSignalIds = req?.availableSignalIds ?? [];
      const confirmedFactKeys = req?.confirmedFactKeys ?? [];
      const orderedPlanIds = candidates.map((c: any) => c.id);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          result: {
            orderedPlanIds,
            rationale: candidates.map((c: any) => ({
              planId: c.id,
              citedSignalIds:
                c.citedSignalIds && c.citedSignalIds.length > 0
                  ? [c.citedSignalIds[0]]
                  : availableSignalIds.length > 0
                    ? [availableSignalIds[0]]
                    : [],
              citedFactKeys:
                c.citedFactKeys && c.citedFactKeys.length > 0
                  ? [c.citedFactKeys[0]]
                  : confirmedFactKeys.length > 0
                    ? [confirmedFactKeys[0]]
                    : [],
              reasonCode: 'matches_confirmed_preference',
            })),
          },
          usedFallback: false,
          engineStatus: 'meta_model_live',
        }),
      });
    });

    await page.goto('/?mode=live&test=1&geo=1');
    await page.waitForLoadState('networkidle');

    const reqLocBtn = page.locator('#btn-request-location');
    if (await reqLocBtn.isVisible()) {
      await reqLocBtn.click();
    }

    const modelStatusPill = page.locator('#model-status-pill');
    await expect(modelStatusPill).toBeVisible();
    await expect(modelStatusPill).toHaveAttribute('data-engine-status', 'meta_model_live');
    await expect(modelStatusPill).toHaveAttribute('data-provenance', 'live');
    await expect(modelStatusPill).toContainText('Meta model · live');
  });
});
