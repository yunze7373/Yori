/**
 * D4-MODEL-REASONING-ON recorded-plus-budgeted E2E (DEMO_RESCUE rev12, TID INBOX-20261102-0CA653).
 * /api/model/candidates and /api/model/command are answered with recorded responses in the exact
 * shape the D4 proxy emits (tests/proxy-boundary/model-candidates-proxy.test.ts proves it); zero
 * billed calls. Verifies:
 * - live reasoning reorders the REAL candidates and the card shows ONE honest status
 *   ('Meta Muse Spark · live'); the labelled fallback shows 'Reasoned locally';
 * - one ranking call per candidate set (no repeat on re-render), declaring the app's 31 s wait;
 * - zero /api/model/reason calls for a Live lunch plan set (the candidate reasoner covers it);
 * - while the live answer is pending, the labelled local answer is shown; only an accepted live
 *   answer replaces it (delayed recorded response);
 * - Ask 'why' / 'closer' answer from the reasoner in the transcript, with the status.
 */

import { test, expect, type Page, type Browser } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { getEvidenceDir } from '../e2e/helpers/evidence-dir.js';

const EVIDENCE_DIR = getEvidenceDir('demo-rescue-d4');
const FIX = { latitude: 35.689487, longitude: 139.691706 };

function eveningTimezone(): string {
  const utcHour = new Date().getUTCHours();
  let offset = (18 - utcHour + 24) % 24;
  if (offset > 14) offset -= 24;
  if (offset === 0) return 'Etc/GMT';
  return offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
}

function places() {
  const fetchedAt = new Date().toISOString();
  return [
    { placeId: 'google-A', coords: { lat: 35.6893, lng: 139.6921 }, name: 'Near Cafe', category: 'restaurant', source: 'live', provenance: 'google', fetchedAt, cuisine: 'cafe', straightLineDistanceMeters: 45, straightLineDistanceLabel: '45 m (straight-line)', openingStatus: 'open', rating: 4.6, userRatingCount: 1204, priceLevel: 2, attribution: 'Powered by Google' },
    { placeId: 'google-B', coords: { lat: 35.6905, lng: 139.6925 }, name: 'Mid Ramen', category: 'restaurant', source: 'live', provenance: 'google', fetchedAt, cuisine: 'ramen', straightLineDistanceMeters: 125, straightLineDistanceLabel: '125 m (straight-line)', openingStatus: 'open', rating: 4.2, userRatingCount: 310, attribution: 'Powered by Google' },
  ];
}

interface Calls {
  candidates: { request: string; ids: string[]; clientWait: string | undefined }[];
  reason: number;
}

async function setup(page: Page, mode: 'live' | 'fallback', delayMs = 0): Promise<Calls> {
  const calls: Calls = { candidates: [], reason: 0 };
  const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/xmemo/**', r => r.fulfill(json({ enabled: false, connected: false })));
  await page.route('**/api/calendar/**', r => r.fulfill(json({ enabled: false, configured: false })));
  await page.route('**/api/route/**', r => r.fulfill(json({ enabled: false })));
  await page.route('**/api/weather/**', r => r.fulfill(json({ enabled: false })));
  await page.route(u => u.pathname === '/api/places/status', r =>
    r.fulfill(json({ enabled: true, provider: 'google', discovery: 'google', attribution: 'Powered by Google', outboundHosts: [{ purpose: 'nearby places and photos', host: 'places.googleapis.com' }] }))
  );
  await page.route(u => u.pathname === '/api/places', r =>
    r.fulfill(json({ enabled: true, discovery: 'google', places: places(), attribution: 'Powered by Google' }))
  );
  // D4: the S5 plan-reasoning path billed on EVERY render (unstable key), and its 2 s client wait
  // abandoned every live answer; a Live lunch plan set now sends none at all.
  await page.route(u => u.pathname === '/api/model/reason', r => {
    calls.reason += 1;
    return r.fulfill(json({ result: { orderedPlanIds: [], rationale: [] }, usedFallback: true, fallbackReason: 'disabled', engineStatus: 'offline_deterministic' }));
  });
  // The live command interpreter falls back to the deterministic grammar in this recording.
  await page.route(u => u.pathname === '/api/model/command', r =>
    r.fulfill(json({ result: null, usedFallback: true, fallbackReason: 'disabled', engineStatus: 'offline_deterministic' }))
  );
  await page.route(u => u.pathname === '/api/model/candidates', async r => {
    const body = JSON.parse(r.request().postData() || '{}');
    calls.candidates.push({ request: body.request, ids: (body.candidates ?? []).map((c: any) => c.id), clientWait: r.request().headers()['x-yori-client-wait-ms'] });
    if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
    if (mode === 'fallback') {
      return r.fulfill(
        json({
          result: { order: ['google-A', 'google-B'], reason: 'Near Cafe: open now, 45 m away, rated 4.6.', citedFactKeys: [] },
          usedFallback: true, fallbackReason: 'budget_exhausted', engineStatus: 'offline_deterministic', ledger: { callCount: 100, cap: 100 },
        })
      );
    }
    const live = {
      rank: { order: ['google-B', 'google-A'], reason: 'Mid Ramen is open now and only 125 m away, a short walk for a hot lunch.' },
      why: { order: ['google-B', 'google-A'], reason: 'Mid Ramen is open now, rated 4.2 by 310 people and 125 m away.' },
      closer: { order: ['google-A', 'google-B'], reason: 'Near Cafe is the closest at 45 m and open now.' },
      quieter: { order: ['google-A', 'google-B'], reason: 'The data does not describe noise, so I cannot tell which is quieter.' },
    }[body.request as 'rank' | 'why' | 'closer' | 'quieter'];
    return r.fulfill(
      json({ result: { ...live, citedFactKeys: [] }, usedFallback: false, engineStatus: 'meta_model_live', latencyMs: 2140, ledger: { callCount: 23 + calls.candidates.length - 1, cap: 100 } })
    );
  });
  await page.route('https://lh3.googleusercontent.com/**', r => r.fulfill({ status: 404 }));
  return calls;
}

async function device(browser: Browser, vp: { width: number; height: number }) {
  const context = await browser.newContext({
    viewport: vp, timezoneId: eveningTimezone(), permissions: ['geolocation'], geolocation: FIX,
    isMobile: vp.width < 768, hasTouch: vp.width < 768,
  });
  return { context, page: await context.newPage() };
}

async function openNearby(page: Page) {
  await page.goto('/?mode=live');
  await page.waitForSelector('.app-layout[data-context-mode="live"]');
  await page.locator('#btn-request-location').click();
  await page.locator('#btn-nearby-now').click();
  await expect(page.locator('.v2-candidate-card').first()).toBeVisible({ timeout: 10000 });
}

async function ask(page: Page, text: string) {
  await page.locator('#ask-bar').click();
  await page.locator('#conversation-input').fill(text);
  await page.locator('#conversation-send-btn').click();
}

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '1280x800', width: 1280, height: 800 },
];

test.describe('D4-MODEL-REASONING-ON: live reasoning over real candidates (recorded)', () => {
  test.beforeAll(() => fs.mkdirSync(EVIDENCE_DIR, { recursive: true }));
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'viewports are driven explicitly; run once');
  });

  for (const vp of VIEWPORTS) {
    test(`live rank reorders the real candidates with one honest status @${vp.name}`, async ({ browser }) => {
      const { context, page } = await device(browser, vp);
      const calls = await setup(page, 'live');
      await openNearby(page);
      const reason = page.locator('#candidate-model-reason');
      await expect(reason).toBeVisible({ timeout: 10000 });
      await expect(reason).toHaveAttribute('data-engine', 'meta_model_live');
      await expect(reason.locator('.model-reason-status')).toHaveText('Meta Muse Spark · live');
      await expect(reason.locator('.model-reason-text')).toHaveText('Mid Ramen is open now and only 125 m away, a short walk for a hot lunch.');
      // Ranking visibly changed: the model's pick leads (distance-first order had Near Cafe first).
      await expect(page.locator('.v2-candidate-card').first().locator('.v2-candidate-name')).toHaveText('Mid Ramen');
      // Exactly one ranking call for this candidate set, with the real ids.
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.waitForTimeout(600);
      expect(calls.candidates.filter(c => c.request === 'rank')).toEqual([{ request: 'rank', ids: ['google-A', 'google-B'], clientWait: '31000' }]);
      // Many renders (grant, places, weather, focus refresh) and no plan-reasoning call for Live lunch.
      expect(calls.reason).toBe(0);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(EVIDENCE_DIR, `d4-live-rank-${vp.name}.png`) });
      await context.close();
    });
  }

  test('fallback (budget exhausted) is labelled and keeps the deterministic order', async ({ browser }) => {
    const { context, page } = await device(browser, { width: 390, height: 844 });
    await setup(page, 'fallback');
    await openNearby(page);
    const reason = page.locator('#candidate-model-reason');
    await expect(reason).toHaveAttribute('data-engine', 'offline_deterministic', { timeout: 10000 });
    await expect(reason.locator('.model-reason-status')).toHaveText('Reasoned locally');
    await expect(page.locator('.v2-candidate-card').first().locator('.v2-candidate-name')).toHaveText('Near Cafe');
    expect(await page.locator('body').innerText()).not.toContain('Meta Muse Spark · live');
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'd4-fallback-390x844.png') });
    await context.close();
  });

  test('while the live answer is pending the labelled local answer shows; the accepted live answer replaces it', async ({ browser }) => {
    const { context, page } = await device(browser, { width: 390, height: 844 });
    const calls = await setup(page, 'live', 4000);
    await openNearby(page);
    const reason = page.locator('#candidate-model-reason');
    // Pending: deterministic distance order and the honest local label, no live claim.
    await expect(reason).toHaveAttribute('data-engine', 'offline_deterministic', { timeout: 3000 });
    await expect(reason.locator('.model-reason-status')).toHaveText('Reasoned locally');
    await expect(reason.locator('.model-reason-text')).toHaveText('Near Cafe: open now, 45 m away, rated 4.6.');
    await expect(page.locator('.v2-candidate-card').first().locator('.v2-candidate-name')).toHaveText('Near Cafe');
    expect(calls.candidates.length).toBe(1);
    // Accepted live answer arrives: it replaces the local one and reorders.
    await expect(reason).toHaveAttribute('data-engine', 'meta_model_live', { timeout: 10000 });
    await expect(reason.locator('.model-reason-status')).toHaveText('Meta Muse Spark · live');
    await expect(page.locator('.v2-candidate-card').first().locator('.v2-candidate-name')).toHaveText('Mid Ramen');
    expect(calls.candidates.filter(c => c.request === 'rank')).toHaveLength(1);
    expect(calls.reason).toBe(0);
    await context.close();
  });

  test('Ask "why this restaurant?" and "closer" are answered by live reasoning, with the status', async ({ browser }) => {
    const { context, page } = await device(browser, { width: 390, height: 844 });
    const calls = await setup(page, 'live');
    await openNearby(page);
    await expect(page.locator('#candidate-model-reason')).toBeVisible({ timeout: 10000 });

    await ask(page, 'why this restaurant?');
    const transcript = page.locator('#conversation-transcript');
    await expect(transcript).toContainText('Mid Ramen is open now, rated 4.2 by 310 people and 125 m away. · Meta Muse Spark · live', { timeout: 10000 });
    // The Ask header still shows exactly one status line (D3 floor a).
    const statusCount = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.conversation-subtitle-row > *')).filter(e => e.getBoundingClientRect().height > 0).length
    );
    expect(statusCount).toBe(1);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'd4-ask-why-390x844.png') });

    await page.locator('#conversation-input').fill('closer');
    await page.locator('#conversation-send-btn').click();
    await expect(transcript).toContainText('Near Cafe is the closest at 45 m and open now. · Meta Muse Spark · live', { timeout: 10000 });
    expect(calls.candidates.map(c => c.request)).toEqual(['rank', 'why', 'closer']);
    expect(calls.reason).toBe(0);
    await context.close();
  });
});
