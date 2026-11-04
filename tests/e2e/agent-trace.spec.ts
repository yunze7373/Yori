/**
 * Playwright E2E Spec: Real Agent Activity Timeline & Top Pick Presentation
 * Governed by Task: ASK-AGENT-TRACE (TID: INBOX-20261104-533A59)
 *
 * Verifies:
 * 1. Observable activity timeline during and after assistant generation.
 * 2. Privacy invariant: Never exposes raw coordinates, tokens, keys, CoT, or system prompts.
 * 3. Honesty invariant: Real monotonic durations, truthful badges ('offline' vs 'live'), no synthetic fake progress.
 * 4. Result card: Grounded candidate fields only (name, distance, opening status, rating, cuisine, attribution).
 * 5. Expandable trace toggle: Accessible button with aria-expanded toggling execution trace details.
 * 6. Dual-viewport testing (390x844 Mobile, 1280x800 Desktop) on isolated port 4289 (never 4173).
 * 7. Visual evidence captured in docs/evidence/agent-trace/*.png.
 */

import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const APP = process.env.APP_URL || 'http://localhost:4289';
const EVIDENCE_DIR = path.resolve(process.cwd(), 'docs/evidence/agent-trace');
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
      cuisine: 'Cafe / Light Fare',
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
      cuisine: 'Tonkotsu Ramen',
      straightLineDistanceMeters: 125,
      straightLineDistanceLabel: '125m',
      openingStatus: 'open',
      rating: 4.2,
      userRatingCount: 310,
      priceLevel: 1,
      attribution: 'Powered by Google',
    },
  ];
}

async function setupMockRoutes(page: Page) {
  const json = (body: unknown, status = 200) => ({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });

  // Calendar / Weather routes
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

  // Places
  await page.route(u => u.pathname === '/api/places/status', r =>
    r.fulfill(json({
      enabled: true,
      provider: 'google',
      discovery: 'google',
      attribution: 'Powered by Google',
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

  // Candidates ranking
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

  // Command Interpreter
  await page.route(u => u.pathname === '/api/model/command', async route => {
    const postData = route.request().postDataJSON();
    const utterance = (postData?.utterance || '').toLowerCase();

    if (utterance.includes('quiet') || utterance.includes('lunch') || utterance.includes('eat')) {
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

    await route.fulfill(json({
      result: null,
      usedFallback: true,
      fallbackReason: 'schema_invalid',
      engineStatus: 'offline_deterministic',
    }));
  });
}

test.describe('ASK-AGENT-TRACE: Real Activity Timeline & Top Pick Presentation', () => {
  test('Live Mode: Shows agent activity summary, expandable trace steps, and top pick card', async ({
    browser,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';
    const vp = isMobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };

    const context = await browser.newContext({
      viewport: vp,
      permissions: ['geolocation'],
      geolocation: FIX,
      isMobile: vp.width < 768,
      hasTouch: vp.width < 768,
    });
    const page = await context.newPage();
    await setupMockRoutes(page);

    // 1. Open app in Live mode and fetch nearby dining options
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

    // 4. Verify assistant reply appears with agent activity summary toggle
    const transcript = page.locator('#conversation-transcript');
    await expect(transcript).toContainText('somewhere quieter');
    await expect(transcript).toContainText('Near Cafe is open now and 45m away.');

    // Agent activity toggle button
    const toggleBtn = page.locator('.trace-summary-toggle').first();
    await expect(toggleBtn).toBeVisible();
    await expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
    await expect(toggleBtn).toContainText('Meta Muse Spark · live');

    // Top Pick result card
    const resultCard = page.locator('.chat-result-card').first();
    await expect(resultCard).toBeVisible();
    await expect(resultCard).toContainText('Near Cafe');
    await expect(resultCard).toContainText('45m');
    await expect(resultCard).toContainText('4.6');
    await expect(resultCard).toContainText('Powered by Google');

    // Capture screenshot: Collapsed trace + Top Pick card
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `01-live-lunch-card-collapsed-${viewName}.png`),
    });

    // 5. Expand trace details
    await toggleBtn.click();
    await expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');

    const traceDetails = page.locator('.trace-details').first();
    await expect(traceDetails).toBeVisible();

    // Verify individual trace steps exist
    const stepItems = traceDetails.locator('.trace-step-item');
    expect(await stepItems.count()).toBeGreaterThanOrEqual(2);

    // Privacy Invariant Check: Verify no raw GPS coordinates or API secrets leaked in trace
    const traceText = await traceDetails.innerText();
    expect(traceText).not.toContain('35.689487');
    expect(traceText).not.toContain('139.691706');
    expect(traceText).not.toContain('AIza');
    expect(traceText).not.toContain('Bearer');
    expect(traceText).not.toContain('<prompt>');

    // Capture screenshot: Expanded trace timeline
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `02-live-lunch-trace-expanded-${viewName}.png`),
    });

    await context.close();
  });

  test('Offline Demo Mode: Shows truthful offline badges and deterministic execution trace', async ({
    browser,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';
    const vp = isMobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };

    const context = await browser.newContext({
      viewport: vp,
      isMobile: vp.width < 768,
      hasTouch: vp.width < 768,
    });
    const page = await context.newPage();

    // Open in demo mode
    await page.goto(`${APP}/?mode=demo&ui=v2&scene=depart`);
    await page.waitForSelector('.app-layout');

    // Open Ask Sheet
    const askBar = page.locator('#ask-bar');
    await expect(askBar).toBeVisible();
    await askBar.click();

    // User submits deterministic command
    const input = page.locator('#conversation-input');
    await input.fill('Leave 15m later');
    await page.locator('#conversation-send-btn').click();

    // Verify transcript received assistant reply
    const transcript = page.locator('#conversation-transcript');
    await expect(transcript).toContainText('Leave 15m later');

    // Verify trace toggle reflects deterministic offline execution
    const toggleBtn = page.locator('.trace-summary-toggle').first();
    await expect(toggleBtn).toBeVisible();
    await expect(toggleBtn).toContainText('Local plan · deterministic');

    // Expand and verify offline badges
    await toggleBtn.click();
    const traceDetails = page.locator('.trace-details').first();
    await expect(traceDetails).toBeVisible();

    const offlineBadges = traceDetails.locator('.trace-badge-offline');
    expect(await offlineBadges.count()).toBeGreaterThanOrEqual(1);

    // Verify steps include Grammar match, Answer presentation (and no false Grounding check)
    const traceText = await traceDetails.innerText();
    expect(traceText).toContain('Grammar match');
    expect(traceText).toContain('Answer presentation');
    expect(traceText).not.toContain('Grounding check');

    // Capture screenshot: Offline deterministic trace
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `03-offline-demo-trace-${viewName}.png`),
    });

    await context.close();
  });

  test('In-Flight Execution: Displays live timeline spinner and handles user cancellation', async ({
    browser,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';
    const vp = isMobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };

    const context = await browser.newContext({
      viewport: vp,
      permissions: ['geolocation'],
      geolocation: FIX,
      isMobile: vp.width < 768,
      hasTouch: vp.width < 768,
    });
    const page = await context.newPage();
    await setupMockRoutes(page);

    // Override /api/model/candidates with an artificial delay so in-flight state is observable
    await page.route(u => u.pathname === '/api/model/candidates', async route => {
      await new Promise(r => setTimeout(r, 2500));
      try {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            result: {
              order: ['google-A', 'google-B'],
              reason: 'Near Cafe is open now and 45m away.',
              citedFactKeys: [],
            },
            usedFallback: false,
            engineStatus: 'meta_model_live',
          }),
        });
      } catch {
        // Request may be aborted on client cancel
      }
    });

    await page.goto(`${APP}/?mode=live`);
    await page.waitForSelector('.app-layout[data-context-mode="live"]');
    await page.locator('#btn-request-location').click();
    await page.locator('#btn-nearby-now').click();
    await expect(page.locator('.v2-candidate-card').first()).toBeVisible({ timeout: 10000 });

    const askBar = page.locator('#ask-bar');
    await askBar.click();

    const input = page.locator('#conversation-input');
    await input.fill('somewhere quieter');
    await page.locator('#conversation-send-btn').click();

    // Verify in-flight bubble with spinner and cancel button
    const inflightBubble = page.locator('.chat-bubble-assistant.is-inflight');
    await expect(inflightBubble).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#inflight-status-text')).toContainText('Working on your request');
    const cancelBtn = page.locator('#btn-cancel-inflight');
    await expect(cancelBtn).toBeVisible();

    // In-flight timeline has Model reasoning step
    await expect(inflightBubble.locator('.trace-timeline')).toBeVisible();

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `04-inflight-timeline-${viewName}.png`),
    });

    // Cancel in-flight request
    await cancelBtn.click();

    // Verify cancellation
    const transcript = page.locator('#conversation-transcript');
    await expect(transcript).toContainText('Request cancelled.');

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, `05-cancelled-request-${viewName}.png`),
    });

    await context.close();
  });
});
