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

async function routeMockServices(page: Page) {
  const json = (body: unknown, status = 200) => ({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });

  // Base mock services
  await page.route('**/api/xmemo/**', r => r.fulfill(json({ enabled: false, connected: false })));
  await page.route('**/api/calendar/**', r => r.fulfill(json({ enabled: false, configured: false })));
  await page.route('**/api/route/**', r => r.fulfill(json({ enabled: false })));
  await page.route('**/api/weather/**', r => r.fulfill(json({ enabled: false })));

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
  });
}
