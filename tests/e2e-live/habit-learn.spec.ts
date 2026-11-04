/**
 * HABIT-LEARN (INBOX-20261104-1565F0): learn-and-correct memory, end to end in Live.
 *
 * Two lunches (yesterday and today: Accept is one lunch per day) where ramen is accepted, then a
 * search where a cafe is closer: ramen leads with the learned basis on the card, in Why, in Ask and
 * on Me, with no Confirm/Reject control anywhere. Forget on Me -> ranking falls back to open now /
 * distance and the habit does not come back after a reload.
 *
 * Isolation: every provider is a recorded route; the model answers as an offline fallback (zero
 * billed calls); no real photo or place request leaves the page.
 */

import { test, expect, type Page, type Browser } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { getEvidenceDir } from '../e2e/helpers/evidence-dir.js';

const EVIDENCE_DIR = getEvidenceDir('habit-learn');
const FIX = { latitude: 35.689487, longitude: 139.691706 }; // public Shinjuku fixture point
const DAY = 24 * 60 * 60 * 1000;

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '1280x800', width: 1280, height: 800 },
];

type Phase = 'ramen-nearest' | 'cafe-nearest';

function places(phase: Phase) {
  const fetchedAt = new Date().toISOString();
  const base = { category: 'restaurant', source: 'live', provenance: 'google', fetchedAt, attribution: 'Powered by Google', openingStatus: 'open' };
  const ramenM = phase === 'ramen-nearest' ? 40 : 125;
  const cafeM = phase === 'ramen-nearest' ? 140 : 45;
  return [
    { ...base, placeId: 'google-cafe', coords: { lat: 35.6893, lng: 139.6921 }, name: 'Near Cafe', cuisine: 'cafe', straightLineDistanceMeters: cafeM, straightLineDistanceLabel: `${cafeM} m (straight-line)`, rating: 4.6, userRatingCount: 1204 },
    { ...base, placeId: 'google-ramen', coords: { lat: 35.6905, lng: 139.6925 }, name: 'Mid Ramen', cuisine: 'ramen', straightLineDistanceMeters: ramenM, straightLineDistanceLabel: `${ramenM} m (straight-line)`, rating: 4.2, userRatingCount: 310 },
    { ...base, placeId: 'google-soba', coords: { lat: 35.6915, lng: 139.6935 }, name: 'Soba Corner', cuisine: 'soba', straightLineDistanceMeters: 260, straightLineDistanceLabel: '260 m (straight-line)', rating: 4.4, userRatingCount: 512 },
  ];
}

async function setup(page: Page, phase: () => Phase) {
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/xmemo/**', r => r.fulfill(json({ enabled: false, connected: false })));
  await page.route('**/api/calendar/**', r => r.fulfill(json({ enabled: false, configured: false })));
  await page.route('**/api/google/**', r => r.fulfill(json({ enabled: false, configured: false })));
  await page.route('**/api/route/**', r => r.fulfill(json({ enabled: false })));
  await page.route('**/api/geocode/**', r => r.fulfill(json({ enabled: false })));
  await page.route('**/api/weather/**', r => r.fulfill(json({ enabled: false })));
  await page.route(u => u.pathname === '/api/places/status', r =>
    r.fulfill(json({ enabled: true, provider: 'google', discovery: 'google', attribution: 'Powered by Google', outboundHosts: [{ purpose: 'nearby places and photos', host: 'places.googleapis.com' }] }))
  );
  await page.route(u => u.pathname === '/api/places', r =>
    r.fulfill(json({ enabled: true, discovery: 'google', places: places(phase()), attribution: 'Powered by Google' }))
  );
  // Offline fallback for every model route: zero billed calls; the order stays the app's own.
  for (const p of ['/api/model/candidates', '/api/model/command', '/api/model/reason']) {
    await page.route(u => u.pathname === p, r => r.fulfill(json({ result: null, usedFallback: true, fallbackReason: 'disabled', engineStatus: 'offline_deterministic' })));
  }
  await page.route('https://lh3.googleusercontent.com/**', r => r.fulfill({ status: 404 }));
}

async function device(browser: Browser, vp: { width: number; height: number }) {
  const context = await browser.newContext({
    viewport: vp, timezoneId: 'Asia/Tokyo', isMobile: vp.width < 768, hasTouch: vp.width < 768,
    permissions: ['geolocation'], geolocation: FIX,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', e => errors.push(`pageerror: ${String(e).slice(0, 160)}`));
  return { context, page, errors };
}

async function settle(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => null))));
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
}

async function shot(page: Page, name: string, vp: string) {
  await settle(page);
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}-${vp}.png`) });
}

/** Opens Live, shares the location (the one platform permission tap) and runs Nearby now. */
async function openLunch(page: Page) {
  await page.goto('/?mode=live');
  await page.waitForSelector('.app-layout[data-context-mode="live"]');
  await page.locator('#btn-request-location').click();
  await page.locator('#btn-nearby-now').click();
  await expect(page.locator('.v2-candidate-card').first()).toBeVisible({ timeout: 10000 });
}

const heroName = (page: Page) => page.locator('.v2-candidate-card').first().locator('.v2-candidate-name');
const heroBasis = (page: Page) => page.locator('.v2-candidate-card').first();

/** No Confirm / Reject memory-proposal control exists anywhere in the DOM. */
async function expectNoConfirmControls(page: Page, where: string) {
  const n = await page.locator('.btn-confirm-proposal, .btn-reject-proposal, .proposal-actions button, .v2-proposal-actions button').count();
  expect(n, `${where}: a Confirm/Reject proposal control is rendered`).toBe(0);
  const text = await page.locator('body').innerText();
  expect(text, `${where}: a "Remember …?" question is shown`).not.toMatch(/Remember (preference|departure|preferred)[^?]*\?/);
}

/** ADDENDUM 2: no Why action, no Why sheet, no evidence rows, no "Based on …" footer. */
async function expectNoWhy(page: Page, where: string) {
  await expect(page.locator('#btn-why'), `${where}: Why action`).toHaveCount(0);
  await expect(page.locator('#why-sheet'), `${where}: Why sheet`).toHaveCount(0);
  await expect(page.locator('.signal-tile, .now-basis, .v2-candidate-basis, .desktop-candidate-basis'), `${where}: evidence rows`).toHaveCount(0);
}

async function openMe(page: Page, isMobile: boolean) {
  if (isMobile) await page.locator('#tab-me').click();
  else await page.locator('#desktop-nav-me').click();
  await expect(page.locator('#learned-habits-list')).toBeVisible();
}

test.describe('HABIT-LEARN: Yori learns from your choices and applies it without asking', () => {
  test.beforeAll(() => fs.mkdirSync(EVIDENCE_DIR, { recursive: true }));
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'viewports are driven explicitly; run once');
  });

  for (const vp of VIEWPORTS) {
    test(`Accept ramen on two lunches -> ramen leads with the learned basis; Forget falls back @${vp.name}`, async ({ browser }) => {
      const isMobile = vp.width < 768;
      const { context, page, errors } = await device(browser, vp);
      let phase: Phase = 'ramen-nearest';
      await setup(page, () => phase);

      // Lunch 1 (yesterday): ramen is the nearest open place; Accept it.
      await page.clock.install({ time: new Date(Date.now() - DAY) });
      await openLunch(page);
      await expect(heroName(page)).toHaveText('Mid Ramen');
      await expect(heroBasis(page)).not.toContainText('You often pick');
      await expectNoConfirmControls(page, 'Home lunch (before)');
      await expectNoWhy(page, 'Home lunch (before)');
      await page.locator('#btn-accept').click();
      await expect(page.locator('#btn-undo-accept')).toBeVisible();
      // One lunch teaches nothing yet.
      await expect(heroBasis(page)).not.toContainText('You often pick');

      // Lunch 2 (today): Accept ramen again -> the habit is learned (no prompt, no confirm step).
      await page.clock.setSystemTime(new Date());
      await openLunch(page);
      await expect(heroName(page)).toHaveText('Mid Ramen');
      await page.locator('#btn-accept').click();
      await expect(page.locator('#btn-undo-accept')).toBeVisible();
      await expectNoConfirmControls(page, 'Home lunch (after learning)');

      // Next search: a cafe is now closer, but ramen leads. ADDENDUM 2: the habit shows only as the
      // choice itself; the card states no reason, has no Why action and no evidence rows.
      phase = 'cafe-nearest';
      await openLunch(page);
      await expect(heroName(page)).toHaveText('Mid Ramen');
      await expect(page.locator('.v2-candidate-card').nth(1).locator('.v2-candidate-name')).toHaveText('Near Cafe');
      // The lunch card itself (and its candidates) states no reason; the habit shows as the order.
      const statedReasons = await page.locator('.now-card').first().evaluate(el =>
        (el.textContent ?? '').match(/[^.\n]{0,60}(You often pick|Matches your confirmed taste|Based on (your|taste))[^.\n]{0,60}/g) ?? []
      );
      expect(statedReasons).toEqual([]);
      await expectNoWhy(page, 'Home lunch (after learning)');
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, '01-home-lunch-learned', vp.name);

      // The detail describes the place; no reason line, no Why.
      await page.locator('.v2-candidate-card').first().locator('.v2-view-detail-link').click();
      await expect(page.locator('.v2-restaurant-detail')).toBeVisible();
      await expect(page.locator('.v2-restaurant-detail')).not.toContainText(/You often pick|Based on taste|Why/);
      await expectNoWhy(page, 'Restaurant detail');
      await shot(page, '02-detail-no-why', vp.name);
      await page.locator('#restaurant-detail-back-btn').click();

      // Ask: no "Why this restaurant?" suggestion; asked anyway -> one short plain sentence.
      await page.locator('#ask-bar').click();
      await expect(page.locator('#conversation-transcript')).not.toContainText('Why this restaurant?');
      const input = page.locator('#conversation-input');
      await input.fill('why this restaurant?');
      await input.press('Enter');
      await expect(page.locator('#conversation-transcript')).toContainText('Mid Ramen, because you often pick ramen.', { timeout: 10000 });
      await expectNoConfirmControls(page, 'Ask');
      await shot(page, '03-ask-why-plain', vp.name);
      await page.keyboard.press('Escape');

      // Me: "What Yori has learned" lists the habit with its basis and a quiet Forget.
      await openMe(page, isMobile);
      const row = page.locator('#learned-habits-list .learned-row[data-habit-key="learned_lunch_cuisine"]');
      await expect(row).toContainText('Lunch habit');
      await expect(row).toContainText('You often pick ramen · 2 of your last 2 lunches');
      await expect(row).toContainText('Learned from your choices');
      await expectNoConfirmControls(page, 'Me');
      await shot(page, '04-me-learned', vp.name);

      // Forget -> gone from Me, ranking falls back to open now / distance, and it stays gone after reload.
      await row.locator('.btn-forget-habit').click();
      await expect(page.locator('#learned-habits-list .learned-row[data-habit-key="learned_lunch_cuisine"]')).toHaveCount(0);
      await shot(page, '05-me-after-forget', vp.name);

      await openLunch(page);
      await expect(heroName(page)).toHaveText('Near Cafe');
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, '06-home-after-forget', vp.name);
      await openMe(page, isMobile);
      await expect(page.locator('#learned-habits-list .learned-row[data-habit-key="learned_lunch_cuisine"]')).toHaveCount(0);

      // The journal holds only in-app choices (no coordinates), and the tombstone is recorded.
      const journal = await page.evaluate(() => window.localStorage.getItem('yori_habits_v1'));
      expect(journal).not.toMatch(/35\.68|139\.69|lat|lng/);
      expect(JSON.parse(journal!).tombstones.map((t: { cuisine: string }) => t.cuisine)).toEqual(['ramen']);

      expect(errors.filter(e => !/lh3\.googleusercontent|status of 404/.test(e))).toEqual([]);
      await context.close();
    });
  }

  test('Ask "I\'m vegetarian" is saved as stated, shown on Me as "You told Yori", with no confirm step', async ({ browser }) => {
    const { context, page } = await device(browser, { width: 390, height: 844 });
    await setup(page, () => 'cafe-nearest');
    await openLunch(page);
    await page.locator('#ask-bar').click();
    const input = page.locator('#conversation-input');
    await input.fill("I'm vegetarian");
    await input.press('Enter');
    await expect(page.locator('#conversation-transcript')).toContainText("Got it: you're vegetarian.");
    await expectNoConfirmControls(page, 'Ask statement');
    await page.keyboard.press('Escape');
    await openMe(page, true);
    const row = page.locator('#learned-habits-list .learned-row[data-habit-key="dietary_preference"]');
    await expect(row).toContainText('Vegetarian');
    await expect(row).toContainText('You told Yori');
    await shot(page, '07-me-told-yori', '390x844');
    await context.close();
  });
});
