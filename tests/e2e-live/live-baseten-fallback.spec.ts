/**
 * D8-BASETEN-FALLBACK recorded e2e (DEMO_RESCUE rev12, TID INBOX-20261103-037D63).
 * /api/model/candidates answers with RECORDED responses in the exact shape the D8 proxy emits after a
 * proven Muse Spark timeout (tests/proxy-boundary/baseten-fallback.test.ts proves it against the
 * real handler with a fake fetch). Zero live Muse Spark or Baseten calls.
 * - The card names the fallback engine ('Baseten fallback · gpt-oss-120b', data-engine
 *   baseten_fallback); the header pill says 'Baseten fallback'
 *   (data-provenance fallback_engine); 'Meta Muse Spark' appears nowhere.
 * - Ask "why" is answered by the same labelled engine; the decision log records baseten_fallback.
 * - D3 floor (lunch): the hero candidate and its labelled reason line are above the fold at first
 *   paint (scroll top), clear of the docked Ask bar, at 390 and 1280.
 */

import { test, expect, type Page, type Browser } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { getEvidenceDir } from '../e2e/helpers/evidence-dir.js';

const EVIDENCE_DIR = getEvidenceDir('demo-rescue-d8');
const FIX = { latitude: 35.689487, longitude: 139.691706 };
const LABEL = 'Baseten fallback · gpt-oss-120b';

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

async function setup(page: Page) {
  const calls: string[] & { clientWaits?: string[] } = [];
  calls.clientWaits = [];
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/xmemo/**', r => r.fulfill(json({ enabled: false, connected: false })));
  await page.route('**/api/calendar/**', r => r.fulfill(json({ enabled: false, configured: false })));
  await page.route('**/api/route/**', r => r.fulfill(json({ enabled: false })));
  await page.route('**/api/weather/**', r => r.fulfill(json({ enabled: false })));
  await page.route(u => u.pathname === '/api/places/status', r =>
    r.fulfill(json({ enabled: true, provider: 'google', discovery: 'google', attribution: 'Powered by Google', outboundHosts: [{ purpose: 'nearby places and photos', host: 'places.googleapis.com' }] }))
  );
  await page.route(u => u.pathname === '/api/places', r => r.fulfill(json({ enabled: true, discovery: 'google', places: places(), attribution: 'Powered by Google' })));
  await page.route(u => u.pathname === '/api/model/command', r =>
    r.fulfill(json({ result: null, usedFallback: true, fallbackReason: 'disabled', engineStatus: 'offline_deterministic' }))
  );
  // Recorded D8 responses: Muse Spark hit its deadline; Baseten answered once, post-checked.
  await page.route(u => u.pathname === '/api/model/candidates', async r => {
    const body = JSON.parse(r.request().postData() || '{}');
    calls.push(body.request);
    calls.clientWaits!.push(r.request().headers()['x-yori-client-wait-ms'] ?? 'missing');
    const reason =
      body.request === 'why'
        ? 'Mid Ramen is open now, rated 4.2 by 310 people and 125 m away.'
        : 'Mid Ramen is open now and 125 m away, a short walk for a hot lunch.';
    return r.fulfill(
      json({
        result: { order: ['google-B', 'google-A'], reason, citedFactKeys: [] },
        usedFallback: false,
        engineStatus: 'baseten_fallback',
        engineLabel: LABEL,
        primaryFailure: 'timeout',
        // Realistic: the 30 s Muse Spark deadline fired, then Baseten answered in 6.8 s.
        latencyMs: 36800,
        ledger: { callCount: 38, cap: 100 },
      })
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

async function openNearby(page: Page, query = '') {
  await page.goto(`/?mode=live${query}`);
  await page.waitForSelector('.app-layout[data-context-mode="live"]');
  await page.locator('#btn-request-location').click();
  await page.locator('#btn-nearby-now').click();
  await expect(page.locator('.v2-candidate-card').first()).toBeVisible({ timeout: 10000 });
}

/**
 * D3 lunch floor at first paint (same criterion as d3-visual-floor (f)): the top candidate's name,
 * distance, open state, basis, Directions AND the labelled engine reason line end above the fold,
 * clear of the docked Ask bar (90 px). At 1280 the same elements must be inside the viewport.
 */
async function expectHeroAboveFold(page: Page, vp: { width: number; height: number }) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
  const hero = page.locator('.v2-candidate-card').first();
  for (const sel of ['.v2-candidate-name', '.v2-distance-chip', '.v2-open-chip', '.v2-candidate-basis', '#candidate-model-reason', '.v2-directions-btn']) {
    const box = await hero.locator(sel).first().boundingBox();
    expect(box && box.y + box.height <= vp.height - (vp.width < 768 ? 90 : 0), `${sel} above the fold`).toBe(true);
  }
}

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '1280x800', width: 1280, height: 800 },
];

test.describe('D8-BASETEN-FALLBACK: labelled fallback engine after a proven Muse Spark timeout (recorded)', () => {
  test.beforeAll(() => fs.mkdirSync(EVIDENCE_DIR, { recursive: true }));
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'viewports are driven explicitly; run once');
  });

  for (const vp of VIEWPORTS) {
    test(`the fallback answer is labelled as Baseten, never as Muse Spark @${vp.name}`, async ({ browser }) => {
      const { context, page } = await device(browser, vp);
      const calls = await setup(page);
      await openNearby(page);
      const reason = page.locator('#candidate-model-reason');
      await expect(reason).toHaveAttribute('data-engine', 'baseten_fallback', { timeout: 10000 });
      await expect(reason.locator('.model-reason-status')).toHaveText(LABEL);
      await expect(page.locator('.v2-candidate-card').first().locator('.v2-candidate-name')).toHaveText('Mid Ramen');
      expect(await page.locator('body').innerText()).not.toContain('Meta Muse Spark');
      expect(calls.filter(c => c === 'rank')).toHaveLength(1);
      // The app declares a wait that covers the Muse deadline + the Baseten attempt (30 + 8 + 2 s).
      expect(calls.clientWaits).toEqual(['40000']);
      await expectHeroAboveFold(page, vp);
      await page.screenshot({ path: path.join(EVIDENCE_DIR, `d8-baseten-fallback-${vp.name}.png`) });
      // UI-QUIET-PRECISION: the engine status pill lives in the Sources sheet, one tap from Home.
      await page.locator('#pill-context-status').click();
      const pill = page.locator('#model-status-pill');
      await expect(pill).toHaveAttribute('data-engine-status', 'baseten_fallback');
      await expect(pill).toHaveAttribute('data-provenance', 'fallback_engine');
      await expect(pill).toContainText('Baseten fallback');
      // The pill stays within the viewport at every width (no clipped engine label).
      const pillBox = await pill.boundingBox();
      expect(pillBox && pillBox.x + pillBox.width <= vp.width).toBe(true);
      await context.close();
    });
  }

  test('Ask "why" is answered by the same labelled engine, with one status line in the Ask header', async ({ browser }) => {
    const { context, page } = await device(browser, { width: 390, height: 844 });
    await setup(page);
    await openNearby(page);
    await expect(page.locator('#candidate-model-reason')).toHaveAttribute('data-engine', 'baseten_fallback', { timeout: 10000 });
    await page.locator('#ask-bar').click();
    await page.locator('#conversation-input').fill('why this restaurant?');
    await page.locator('#conversation-send-btn').click();
    const transcript = page.locator('#conversation-transcript');
    await expect(transcript).toContainText(`Mid Ramen is open now, rated 4.2 by 310 people and 125 m away. · ${LABEL}`, { timeout: 10000 });
    expect(await transcript.innerText()).not.toContain('Meta Muse Spark');
    // The Ask header keeps exactly one visible status line (D3 floor (a)).
    const statusCount = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.conversation-subtitle-row > *')).filter(e => e.getBoundingClientRect().height > 0).length
    );
    expect(statusCount).toBe(1);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'd8-ask-why-390x844.png') });
    await context.close();
  });

  test('the redacted decision log records engine baseten_fallback for rank and why (?dev=1 inspector)', async ({ browser }) => {
    const { context, page } = await device(browser, { width: 390, height: 844 });
    await setup(page);
    await openNearby(page, '&dev=1');
    await expect(page.locator('#candidate-model-reason')).toHaveAttribute('data-engine', 'baseten_fallback', { timeout: 10000 });
    await page.locator('#ask-bar').click();
    await page.locator('#conversation-input').fill('why this restaurant?');
    await page.locator('#conversation-send-btn').click();
    await expect(page.locator('#conversation-transcript')).toContainText(LABEL, { timeout: 10000 });
    await page.locator('#btn-toggle-decision-log').click();
    const log = JSON.parse((await page.locator('#decision-log-content').textContent()) ?? '[]') as any[];
    const engines = log.filter(e => String(e.templateId).startsWith('candidates_')).map(e => [e.templateId, e.engineStatus]);
    expect(engines).toEqual(expect.arrayContaining([['candidates_rank', 'baseten_fallback'], ['candidates_why', 'baseten_fallback']]));
    expect(JSON.stringify(log)).not.toContain('meta_model_live');
    await context.close();
  });
});
