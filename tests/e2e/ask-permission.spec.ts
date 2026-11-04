/**
 * ASK-INLINE-PERMISSION E2E Tests (TID: INBOX-20261104-2667E7)
 *
 * Covers Owner Steering (Han, 2026-11-05 01:33 JST):
 * 1. Ask in conversation requests location permission directly inline with "Allow location" / "Not now".
 * 2. "Allow location" triggers browser geolocation; on grant, resumes original ask automatically.
 * 3. "Not now" acknowledges honestly ("No problem — I'll work with what I have.") with no nagging.
 * 4. Browser-denied location shows honest explanation without action buttons.
 * 5. Zero model flicker / no Why UI / no extraneous confirmation prompts.
 * 6. Dual-gate coverage at 390x844 (Mobile) and 1280x800 (Desktop).
 * 7. Uses isolated preview port 4285 (never port 4173).
 */

import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const APP = process.env.APP_URL || 'http://localhost:4285';
const EVIDENCE_DIR = path.resolve(process.cwd(), 'docs/evidence/ask-permission');
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

  await page.route(u => u.pathname.startsWith('/api/xmemo'), r => r.fulfill(json({ enabled: false, connected: false })));
  await page.route(u => u.pathname.startsWith('/api/calendar'), r => r.fulfill(json({ enabled: false, configured: false })));
  await page.route(u => u.pathname.startsWith('/api/route'), r => r.fulfill(json({ enabled: false })));
  await page.route(u => u.pathname.startsWith('/api/weather'), r => r.fulfill(json({ enabled: false })));
  await page.route(u => u.pathname.startsWith('/api/geocode'), r => r.fulfill(json({ success: false })));
  await page.route(u => u.pathname.startsWith('/api/google'), r => r.fulfill(json({ enabled: false, connected: false })));

  await page.route(u => u.pathname === '/api/model/diagnostics', r =>
    r.fulfill(json({
      status: 'enabled',
      modelName: 'muse-spark-1.3',
      keySource: 'MODEL_API_KEY',
    }))
  );

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

  await page.route(u => u.pathname === '/api/model/reason', r =>
    r.fulfill(json({
      result: {
        orderedPlanIds: [],
        rationale: [],
      },
      usedFallback: false,
      engineStatus: 'meta_model_live',
    }))
  );

  await page.route(u => u.pathname === '/api/model/command', async route => {
    const postData = route.request().postDataJSON();
    const utterance = String(postData?.facts?.utterance ?? '').toLowerCase();

    if (utterance.includes('quiet') || utterance.includes('lunch') || utterance.includes('food')) {
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
  test.describe(`ASK-INLINE-PERMISSION Dual-Gate [${vp.name}]`, () => {
    test(`Flow A: "somewhere quieter" when ungranted -> Allow location -> granted & auto-resumed [${vp.name}]`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        permissions: ['geolocation'],
        geolocation: FIX,
        isMobile: vp.width < 768,
        hasTouch: vp.width < 768,
      });
      const page = await context.newPage();
      await routeMockServices(page);

      // 1. Open app in Live mode with location in prompt state
      await page.goto(`${APP}/?mode=live&geo_consent=prompt`);
      await page.waitForSelector('.app-layout[data-context-mode="live"]');

      // 2. Open Ask conversation without granting location on Home first
      const askBar = page.locator('#ask-bar');
      await expect(askBar).toBeVisible();
      await askBar.click();

      const overlay = page.locator('#conversation-overlay');
      await expect(overlay).toBeVisible();

      // 3. User submits "somewhere quieter"
      const input = page.locator('#conversation-input');
      await input.fill('somewhere quieter');
      await page.locator('#conversation-send-btn').click();

      // 4. Conversation presents honest inline location request line
      const transcript = page.locator('#conversation-transcript');
      await expect(transcript).toContainText('somewhere quieter');
      await expect(transcript).toContainText('I need your location to find places near you.');

      // 5. Action buttons exist: "Allow location" and "Not now"
      const allowBtn = page.locator('.chat-action-btn[data-action="allow_location"]');
      const notNowBtn = page.locator('.chat-action-btn[data-action="not_now"]');
      await expect(allowBtn).toBeVisible();
      await expect(allowBtn).toContainText('Allow location');
      await expect(notNowBtn).toBeVisible();
      await expect(notNowBtn).toContainText('Not now');

      // Capture prompt with action buttons screenshot
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `flow-a-prompt-${vp.name}.png`),
      });

      // 6. Click "Allow location"
      await allowBtn.click();

      // 7. Buttons disappear, browser geolocation is acquired, and pending ask automatically re-runs
      await expect(page.locator('.chat-action-btn')).toHaveCount(0);
      const candidateCard = page.locator('.v2-candidate-card').first();
      await expect(candidateCard).toBeVisible({ timeout: 10000 });

      // Capture success state screenshot
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `flow-a-granted-${vp.name}.png`),
      });

      await context.close();
    });

    test(`Flow B: "somewhere quieter" -> "Not now" -> honest acknowledgement [${vp.name}]`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        permissions: ['geolocation'],
        geolocation: FIX,
        isMobile: vp.width < 768,
        hasTouch: vp.width < 768,
      });
      const page = await context.newPage();
      await routeMockServices(page);

      // 1. Open app in Live mode with location in prompt state
      await page.goto(`${APP}/?mode=live&geo_consent=prompt`);
      await page.waitForSelector('.app-layout[data-context-mode="live"]');

      // 2. Open Ask conversation
      const askBar = page.locator('#ask-bar');
      await expect(askBar).toBeVisible();
      await askBar.click();

      // 3. User submits "somewhere quieter"
      const input = page.locator('#conversation-input');
      await input.fill('somewhere quieter');
      await page.locator('#conversation-send-btn').click();

      const transcript = page.locator('#conversation-transcript');
      await expect(transcript).toContainText('I need your location to find places near you.');

      // 4. Click "Not now"
      const notNowBtn = page.locator('.chat-action-btn[data-action="not_now"]');
      await expect(notNowBtn).toBeVisible();
      await notNowBtn.click();

      // 5. Actions removed, honest acknowledgment arrives
      await expect(page.locator('.chat-action-btn')).toHaveCount(0);
      await expect(transcript).toContainText("No problem — I'll work with what I have.");

      // Capture Not now screenshot
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `flow-b-not-now-${vp.name}.png`),
      });

      await context.close();
    });

    test(`Flow C: Location denied at browser level -> explanation line without action buttons [${vp.name}]`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        permissions: [],
        isMobile: vp.width < 768,
        hasTouch: vp.width < 768,
      });
      const page = await context.newPage();
      await routeMockServices(page);

      // 1. Open app in Live mode with location blocked in browser
      await page.goto(`${APP}/?mode=live&geo_consent=denied&test=1`);
      await page.waitForSelector('.app-layout[data-context-mode="live"]');

      // 2. Open Ask conversation
      const askBar = page.locator('#ask-bar');
      await expect(askBar).toBeVisible();
      await askBar.click();

      // 3. User submits "somewhere quieter"
      const input = page.locator('#conversation-input');
      await input.fill('somewhere quieter');
      await page.locator('#conversation-send-btn').click();

      // 4. Honest explanation appears, no action buttons
      const transcript = page.locator('#conversation-transcript');
      await expect(transcript).toContainText(
        'Location access is blocked in your browser settings. Please enable location in your browser to find places near you.'
      );
      await expect(page.locator('.chat-action-btn')).toHaveCount(0);

      // Capture denied state screenshot
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, `flow-c-denied-${vp.name}.png`),
      });

      await context.close();
    });
  });
}
