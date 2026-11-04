/**
 * LLM-REPLY-GROUNDED E2E Tests (TID: INBOX-20261104-FA2315)
 *
 * Covers Owner Steering (2026-11-04 23:25 JST & Addendum 23:28 JST):
 * 1. Assistant message bubbles display model-written replies grounded strictly on facts.
 * 2. Closed intent set execution (FIND_LUNCH, LEAVE_LATER, UNSUPPORTED free questions).
 * 3. Never renders Why / explanation UI or confirmation prompts (yori-understand-not-explain).
 * 4. Dual-gate coverage at 390x844 (Mobile) and 1280x800 (Desktop).
 * 5. Uses isolated preview port 4285 (never port 4173).
 */

import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const APP = process.env.APP_URL || 'http://localhost:4285';
const EVIDENCE_DIR = path.resolve(process.cwd(), 'docs/evidence/llm-reply');
const FIX = { latitude: 35.689487, longitude: 139.691706 };

test.beforeAll(() => {
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }
});

function mockPlaces() {
  const fetchedAt = new Date().toISOString();
  return [
    {
      placeId: 'google-A',
      coords: { lat: 35.6893, lng: 139.6921 },
      name: 'Near Cafe',
      category: 'restaurant',
      source: 'live',
      provenance: 'google',
      fetchedAt,
      cuisine: 'cafe',
      straightLineDistanceMeters: 45,
      straightLineDistanceLabel: '45m',
      openingStatus: 'open',
      rating: 4.6,
      userRatingCount: 1204,
      priceLevel: 2,
      attribution: 'Powered by Google',
    },
    {
      placeId: 'google-B',
      coords: { lat: 35.6905, lng: 139.6925 },
      name: 'Mid Ramen',
      category: 'restaurant',
      source: 'live',
      provenance: 'google',
      fetchedAt,
      cuisine: 'ramen',
      straightLineDistanceMeters: 125,
      straightLineDistanceLabel: '125m',
      openingStatus: 'open',
      rating: 4.2,
      userRatingCount: 310,
      attribution: 'Powered by Google',
    },
  ];
}

async function routeMockServices(page: Page, options?: { withDepartPlan?: boolean }) {
  const json = (body: unknown, status = 200) => ({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });

  // Base mock services
  await page.route('**/api/xmemo/**', r => r.fulfill(json({ enabled: false, connected: false })));

  if (options?.withDepartPlan) {
    const nowMs = Date.now();
    const apptTime = new Date(nowMs + 90 * 60 * 1000).toISOString();
    const endApptTime = new Date(nowMs + 150 * 60 * 1000).toISOString();

    await page.route(u => u.pathname === '/api/calendar/status', r =>
      r.fulfill(json({ enabled: true, configured: true }))
    );
    await page.route(u => u.pathname === '/api/calendar', r =>
      r.fulfill(json({
        enabled: true,
        provider: 'ics',
        events: [
          {
            id: 'ev-piano',
            title: 'Piano lesson',
            startTime: apptTime,
            endTime: endApptTime,
            location: 'Shinjuku Piano Studio',
          },
        ],
      }))
    );
    await page.route(u => u.pathname.startsWith('/api/geocode'), r =>
      r.fulfill(json({
        success: true,
        result: {
          coordinate: [35.69, 139.70],
          displayName: 'Shinjuku Piano Studio',
        },
      }))
    );
    await page.route(u => u.pathname === '/api/route/status', r =>
      r.fulfill(json({
        enabled: true,
        provider: 'osrm',
        attribution: 'Powered by OSRM',
      }))
    );
    await page.route(u => u.pathname === '/api/route', r =>
      r.fulfill(json({
        enabled: true,
        route: {
          geometry: [
            [35.6895, 139.6917],
            [35.69, 139.70],
          ],
          distanceM: 2000,
          durationS: 600,
          provider: 'osrm',
          fetchedAt: new Date().toISOString(),
          attribution: 'Route © OSRM · data © OpenStreetMap contributors',
          mode: 'driving',
        },
      }))
    );
    await page.route(u => u.pathname === '/api/weather/status', r =>
      r.fulfill(json({ enabled: true, provider: 'open-meteo' }))
    );
    await page.route(u => u.pathname.startsWith('/api/weather') && u.pathname !== '/api/weather/status', r => {
      const nowIso = new Date().toISOString();
      return r.fulfill(json({
        source: 'Open-Meteo',
        coordinate: { kind: 'device_fix', lat: 35.689, lng: 139.692 },
        signals: [
          {
            kind: 'weather',
            value: {
              temperatureC: 18,
              condition: 'clear',
              precipitationRisk: 'none',
            },
            provider: 'open-meteo',
            asOf: nowIso,
            validFor: 3600000,
            confidence: 1.0,
            provenance: 'live',
            consentScope: 'device_only',
            status: 'available',
          },
        ],
        forecast: {
          rainExpected: false,
          issuedAt: nowIso,
          validFor: 3600000,
        },
      }));
    });
  } else {
    await page.route('**/api/calendar/**', r => r.fulfill(json({ enabled: false, configured: false })));
    await page.route('**/api/route/**', r => r.fulfill(json({ enabled: false })));
    await page.route('**/api/weather/**', r => r.fulfill(json({ enabled: false })));
  }

  // Model Diagnostics
  await page.route(u => u.pathname === '/api/model/diagnostics', r =>
    r.fulfill(json({
      status: 'enabled',
      modelName: 'muse-spark-1.3',
      keySource: 'MODEL_API_KEY',
    }))
  );

  // Places Provider
  await page.route(u => u.pathname === '/api/places/status', r =>
    r.fulfill(json({
      enabled: true,
      provider: 'google',
      discovery: 'google',
      attribution: 'Powered by Google',
      outboundHosts: [{ purpose: 'nearby places', host: 'places.googleapis.com' }],
    }))
  );
  await page.route(u => u.pathname === '/api/places', r =>
    r.fulfill(json({
      enabled: true,
      discovery: 'google',
      places: mockPlaces(),
      attribution: 'Powered by Google',
    }))
  );

  // Candidates ranking route (for Live candidate reasoner)
  await page.route(u => u.pathname === '/api/model/candidates', r =>
    r.fulfill(json({
      result: {
        order: ['google-A', 'google-B'],
        reason: 'Near Cafe is open now and 45m away.',
        citedFactKeys: [],
      },
      usedFallback: false,
      engineStatus: 'meta_model_live',
    }))
  );

  // Model reason route (for Live plan reasoner in living context / depart flow)
  await page.route(u => u.pathname === '/api/model/reason', async route => {
    const postData = route.request().postDataJSON();
    const candidateIds = Array.isArray(postData?.candidates)
      ? postData.candidates.map((c: any) => c.id)
      : [];
    await route.fulfill(json({
      result: {
        orderedPlanIds: candidateIds,
        rationale: [],
      },
      usedFallback: false,
      engineStatus: 'meta_model_live',
    }));
  });

  // Model Command Endpoint (dynamic live replies)
  await page.route(u => u.pathname === '/api/model/command', async route => {
    const postData = route.request().postDataJSON();
    const utterance = String(postData?.facts?.utterance ?? '').toLowerCase();

    if (utterance.includes('quiet')) {
      await route.fulfill(json({
        result: {
          intent: 'FIND_LUNCH',
          slots: { filters: ['quieter'] },
          reply: 'Updated lunch options to quieter spots—Near Cafe is your top pick.',
          citedSignalIds: [],
          citedFactKeys: [],
          reasonCodes: [],
        },
        usedFallback: false,
        engineStatus: 'meta_model_live',
      }));
      return;
    }

    if (utterance.includes('far')) {
      await route.fulfill(json({
        result: {
          intent: 'UNSUPPORTED',
          slots: {},
          reply: 'Near Cafe is about 45m away, just a short walk.',
          citedSignalIds: [],
          citedFactKeys: [],
          reasonCodes: [],
        },
        usedFallback: false,
        engineStatus: 'meta_model_live',
      }));
      return;
    }

    if (utterance.includes('leave') || utterance.includes('later')) {
      await route.fulfill(json({
        result: {
          intent: 'LEAVE_LATER',
          slots: { deltaMinutes: 15 },
          reply: 'Updated your plan to leave 15 minutes later.',
          citedSignalIds: [],
          citedFactKeys: [],
          reasonCodes: [],
        },
        usedFallback: false,
        engineStatus: 'meta_model_live',
      }));
      return;
    }

    // Default fallback
    await route.fulfill(json({
      result: null,
      usedFallback: true,
      fallbackReason: 'schema_invalid',
      engineStatus: 'offline_deterministic',
    }));
  });
}

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '1280x800', width: 1280, height: 800 },
];

for (const vp of VIEWPORTS) {
  test.describe(`LLM-REPLY-GROUNDED Dual-Gate [${vp.name}]`, () => {
    test(`Live Ask flow displays model-written replies without Why/Confirm UI at ${vp.name}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        permissions: ['geolocation'],
        geolocation: FIX,
        isMobile: vp.width < 768,
        hasTouch: vp.width < 768,
      });
      const page = await context.newPage();
      await routeMockServices(page);

      // 1. Open app in Live mode and fetch nearby places
      await page.goto(`${APP}/?mode=live`);
      await page.waitForSelector('.app-layout[data-context-mode="live"]');
      await page.locator('#btn-request-location').click();
      await page.locator('#btn-nearby-now').click();
      await expect(page.locator('.v2-candidate-card').first()).toBeVisible({ timeout: 10000 });

      // 2. Open Ask Sheet
      const askBar = page.locator('#ask-bar');
      await expect(askBar).toBeVisible();
      await askBar.click();

      const overlay = page.locator('#conversation-overlay');
      await expect(overlay).toBeVisible();

      // 3. User submits "somewhere quieter"
      const input = page.locator('#conversation-input');
      await input.fill('somewhere quieter');
      await page.locator('#conversation-send-btn').click();

      // Check transcript displays user message and model-written reply
      const transcript = page.locator('#conversation-transcript');
      await expect(transcript).toContainText('somewhere quieter');
      await expect(transcript).toContainText('Updated lunch options to quieter spots—Near Cafe is your top pick.');

      // Invariant checks: No Why button, no confirmation prompt
      await expect(page.locator('button:has-text("Why")')).toHaveCount(0);
      await expect(page.locator('button:has-text("Confirm")')).toHaveCount(0);
      await expect(page.locator('button:has-text("Looks good")')).toHaveCount(0);

      // Screenshot settled state 1 (Lunch reply)
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `lunch-reply-${vp.name}.png`),
      });

      // 4. User asks free question: "is it far?"
      await input.fill('is it far?');
      await page.locator('#conversation-send-btn').click();

      // Check transcript displays grounded answer
      await expect(transcript).toContainText('is it far?');
      await expect(transcript).toContainText('Near Cafe is about 45m away, just a short walk.');

      // Settle evidence screenshot 2 (Free question reply)
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `free-question-${vp.name}.png`),
      });

      await context.close();
    });

    test(`Live Ask flow displays model-written reply for depart scenario at ${vp.name}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        permissions: ['geolocation'],
        geolocation: FIX,
        isMobile: vp.width < 768,
        hasTouch: vp.width < 768,
      });
      const page = await context.newPage();

      // Seed confirmed prep and buffer memory facts in localStorage
      await page.addInitScript(() => {
        const now = new Date().toISOString();
        localStorage.setItem('yori_state_v1', JSON.stringify({
          schemaVersion: 1,
          createdAt: now,
          updatedAt: now,
          payload: {
            memoryFacts: [
              {
                key: 'prep_buffer_minutes',
                value: 20,
                status: 'confirmed',
                provenance: 'user',
                updatedAt: now,
              },
              {
                key: 'prep_duration_minutes',
                value: 20,
                status: 'confirmed',
                provenance: 'user',
                updatedAt: now,
              },
            ],
            proposals: [],
            suppressions: [],
            promptBudget: { date: now.slice(0, 10), count: 0 },
            acceptedPlanIds: [],
          },
        }));
      });

      await routeMockServices(page, { withDepartPlan: true });

      // 1. Open app in Live mode
      await page.goto(`${APP}/?mode=live`);
      await page.waitForSelector('.app-layout[data-context-mode="live"]');
      await page.locator('#btn-request-location').click();

      // Ensure departure plan card is visible
      await expect(page.locator('.now-card')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('.now-card')).toContainText('Piano lesson');

      // 2. Open Ask Sheet
      const askBar = page.locator('#ask-bar');
      await expect(askBar).toBeVisible();
      await askBar.click();

      const overlay = page.locator('#conversation-overlay');
      await expect(overlay).toBeVisible();

      // 3. User submits "leave 15 minutes later"
      const input = page.locator('#conversation-input');
      await input.fill('leave 15 minutes later');
      await page.locator('#conversation-send-btn').click();

      // Check transcript displays user message and model-written reply
      const transcript = page.locator('#conversation-transcript');
      await expect(transcript).toContainText('leave 15 minutes later');
      await expect(transcript).toContainText('Updated your plan to leave 15 minutes later.');

      // Invariant checks: No Why button, no confirmation prompt
      await expect(page.locator('button:has-text("Why")')).toHaveCount(0);
      await expect(page.locator('button:has-text("Confirm")')).toHaveCount(0);
      await expect(page.locator('button:has-text("Looks good")')).toHaveCount(0);

      // Check header chip reflects live model engine (not offline fallback)
      const pill = page.locator('#conversation-model-status-pill');
      await expect(pill).toBeVisible();
      await expect(pill).toHaveAttribute('data-engine-status', 'meta_model_live');
      await expect(pill).toContainText('Meta model · live');
      await expect(pill).not.toContainText('Offline fallback');

      // Screenshot settled state 3 (Depart reply)
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `depart-reply-${vp.name}.png`),
      });

      await context.close();
    });
  });
}
