/**
 * UI-QUIET-PRECISION area 2 (TID INBOX-20261103-ECC39C): every remaining surface to the owner's 04
 * bar. Recorded responses only (zero live calls); providers pinned off.
 * Surfaces, at 390x844 and 1280x800, captured after motion settles into
 * docs/evidence/ui-quiet-precision/area2-*.png (UPDATE_EVIDENCE=1):
 *   consent, Why (lunch + depart), Sources, restaurant detail, Ask panel + reply, trip detail,
 *   accepted state, designed empty / error / denied states, and (dev) the decision log.
 * Checks: no visible engineering jargon on user surfaces (provenance stays one tap away in the
 * Sources sheet and the dev decision log), zero console errors, and a <= 20 s webm of transitions.
 */

import { test, expect, type Page, type Browser } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { getEvidenceDir } from '../e2e/helpers/evidence-dir.js';

const EVIDENCE_DIR = getEvidenceDir('ui-quiet-precision');
const FIX = { latitude: 35.689487, longitude: 139.691706 }; // public Shinjuku fixture point

/** Engineering strings that must never be visible on a user surface. */
const JARGON: readonly (string | RegExp)[] = [
  'fails closed',
  'Overpass',
  'places lunch',
  'Not set up yet',
  'the owner adds',
  'deterministic',
  /\b\d+ms\b/,
  'Nearby dining',
];

const STAND_IN_PHOTO_URI = 'https://lh3.googleusercontent.com/places/recorded-mid-ramen=s800';
const STAND_IN_PHOTO = fs.readFileSync(path.resolve('tests/fixtures/google-mock/place-photo-stand-in.svg'));

function places() {
  const fetchedAt = new Date().toISOString();
  const base = { category: 'restaurant', source: 'live', provenance: 'google', fetchedAt, attribution: 'Powered by Google' };
  return [
    { ...base, placeId: 'google-A', coords: { lat: 35.6893, lng: 139.6921 }, name: 'Near Cafe', cuisine: 'cafe', straightLineDistanceMeters: 45, straightLineDistanceLabel: '45 m (straight-line)', openingStatus: 'open', rating: 4.6, userRatingCount: 1204, priceLevel: 2 },
    { ...base, placeId: 'google-B', coords: { lat: 35.6905, lng: 139.6925 }, name: 'Mid Ramen', cuisine: 'ramen', straightLineDistanceMeters: 125, straightLineDistanceLabel: '125 m (straight-line)', openingStatus: 'open', rating: 4.2, userRatingCount: 310,
      // A recorded keyless photo URI with its author credit; the test serves a local stand-in image for it.
      photo: { uri: STAND_IN_PHOTO_URI, widthPx: 800, heightPx: 600, authorAttributions: [{ displayName: 'Recorded author', uri: 'https://maps.google.com/maps/contrib/0' }] } },
    { ...base, placeId: 'google-C', coords: { lat: 35.6915, lng: 139.6935 }, name: 'Soba Corner', cuisine: 'soba', straightLineDistanceMeters: 260, straightLineDistanceLabel: '260 m (straight-line)', openingStatus: 'open', rating: 4.4, userRatingCount: 512 },
  ];
}

interface MockOpts {
  weatherOff?: boolean;
  noPlaces?: boolean;
  placesError?: boolean;
}

async function setup(page: Page, opts: MockOpts = {}) {
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  const fetchedAt = new Date().toISOString();
  await page.route('**/api/xmemo/**', r => r.fulfill(json({ enabled: false, connected: false })));
  await page.route('**/api/calendar/**', r => r.fulfill(json({ enabled: false, configured: false })));
  await page.route('**/api/google/**', r => r.fulfill(json({ enabled: false, configured: false })));
  await page.route('**/api/route/**', r => r.fulfill(json({ enabled: false })));
  await page.route('**/api/geocode/**', r => r.fulfill(json({ enabled: false })));
  await page.route(u => u.pathname === '/api/weather/status', r =>
    r.fulfill(json(opts.weatherOff ? { enabled: false } : { enabled: true, attribution: { text: 'Weather data by Open-Meteo.com', url: 'https://open-meteo.com/' } }))
  );
  await page.route(u => u.pathname === '/api/weather/current', r =>
    r.fulfill(json({
      enabled: true, source: 'Open-Meteo', fetchedAt, coordinate: { kind: 'device_fix' },
      signals: [{ kind: 'weather', value: { condition: 'cloudy', temperatureC: 14 }, source: 'real', provenance: 'open-meteo', issuedAt: fetchedAt, validFor: 3600000, confidence: 0.9 }],
    }))
  );
  await page.route('**/api/weather/forecast**', r => r.fulfill(json({ enabled: false })));
  await page.route(u => u.pathname === '/api/places/status', r =>
    r.fulfill(json({ enabled: true, provider: 'google', discovery: 'google', attribution: 'Powered by Google', outboundHosts: [{ purpose: 'nearby places and photos', host: 'places.googleapis.com' }] }))
  );
  await page.route(u => u.pathname === '/api/places', r =>
    opts.placesError
      ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"recorded failure"}' })
      : r.fulfill(json({ enabled: true, discovery: 'google', places: opts.noPlaces ? [] : places(), attribution: 'Powered by Google' }))
  );
  await page.route(u => u.pathname === '/api/model/candidates', r =>
    r.fulfill(json({
      result: { order: ['google-B', 'google-A', 'google-C'], reason: 'Mid Ramen is open now, rated 4.2 by 310 people and 125 m away.', citedFactKeys: [] },
      usedFallback: false, engineStatus: 'meta_model_live', latencyMs: 9000, ledger: { callCount: 38, cap: 100 },
    }))
  );
  await page.route(u => u.pathname === '/api/model/command', r => r.fulfill(json({ result: null, usedFallback: true, fallbackReason: 'disabled', engineStatus: 'offline_deterministic' })));
  await page.route(u => u.pathname === '/api/model/reason', r => r.fulfill(json({ usedFallback: true, fallbackReason: 'disabled', engineStatus: 'offline_deterministic' })));
  await page.route('https://lh3.googleusercontent.com/**', r => r.fulfill({ status: 404 }));
  // Registered last, so it wins for the one recorded photo URI (no real photo is fetched in tests).
  await page.route(STAND_IN_PHOTO_URI, r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: STAND_IN_PHOTO }));
}

async function device(browser: Browser, vp: { width: number; height: number }, geo = true) {
  const context = await browser.newContext({
    viewport: vp, timezoneId: 'Asia/Tokyo', isMobile: vp.width < 768, hasTouch: vp.width < 768,
    ...(geo ? { permissions: ['geolocation'], geolocation: FIX } : {}),
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', e => errors.push(`pageerror: ${String(e).slice(0, 160)}`));
  return { context, page, errors };
}

/** Motion settled: every running animation finished, then two frames. */
async function settle(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => null))));
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
}

/** Text a sighted user can see (skips display:none, visibility:hidden and clipped nodes). */
async function visibleText(page: Page, selector = 'body'): Promise<string> {
  return page.evaluate(sel => {
    const root = document.querySelector(sel);
    if (!root) return '';
    const hidden = (el: Element | null): boolean => {
      for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden') return true;
        if (cs.clip && cs.clip !== 'auto' && /rect\(0(px)?,? 0(px)?/.test(cs.clip)) return true;
      }
      return false;
    };
    const out: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.textContent && n.textContent.trim() && !hidden(n.parentElement)) out.push(n.textContent);
    }
    return out.join(' ');
  }, selector);
}

async function expectNoJargon(page: Page, surface: string, selector = 'body') {
  const text = await visibleText(page, selector);
  for (const j of JARGON) {
    if (typeof j === 'string') expect(text, `${surface}: '${j}' visible`).not.toContain(j);
    else expect(text, `${surface}: ${j} visible`).not.toMatch(j);
  }
}

/** The rain label on a large map covers no route and no place label (owner: map label overlap). */
async function expectRainLabelClear(page: Page): Promise<number> {
  const result = await page.evaluate(() => {
    const hits: string[] = [];
    let checked = 0;
    for (const canvas of Array.from(document.querySelectorAll('.v2-map-canvas.prominent'))) {
      const label = canvas.querySelector('.v2-map-weather-callout rect') as SVGGraphicsElement | null;
      if (!label || !(label as unknown as HTMLElement).getClientRects().length) continue;
      const r = label.getBoundingClientRect();
      if (r.width === 0) continue;
      checked++;
      const inside = (x: number, y: number) => x > r.left && x < r.right && y > r.top && y < r.bottom;
      for (const line of Array.from(canvas.querySelectorAll('polyline'))) {
        const geo = line as SVGPolylineElement;
        const ctm = geo.getScreenCTM();
        const total = geo.getTotalLength();
        if (!ctm) continue;
        for (let d = 0; d <= total; d += 2) {
          const pt = geo.getPointAtLength(d).matrixTransform(ctm);
          if (inside(pt.x, pt.y)) { hits.push(`route ${geo.id} at ${Math.round(d)}`); break; }
        }
      }
      for (const text of Array.from(canvas.querySelectorAll('.v2-map-marker text'))) {
        // Clear by at least 40 px, so the two never read as one cluster (review 2ebf8df1 P3).
        const t = text.getBoundingClientRect();
        const gap = 40;
        if (t.left < r.right + gap && t.right > r.left - gap && t.top < r.bottom + gap && t.bottom > r.top - gap) hits.push(`label "${text.textContent?.trim()}"`);
      }
    }
    return { hits, checked };
  });
  expect(result.hits).toEqual([]);
  return result.checked;
}

async function shot(page: Page, name: string, vp: string) {
  await settle(page);
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `area2-${name}-${vp}.png`) });
}

const benign = (e: string) => /lh3\.googleusercontent|status of 404/.test(e);

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '1280x800', width: 1280, height: 800 },
];

test.describe('UI-QUIET-PRECISION area 2: every remaining surface at the 04 bar', () => {
  test.beforeAll(() => fs.mkdirSync(EVIDENCE_DIR, { recursive: true }));
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'viewports are driven explicitly; run once');
  });

  for (const vp of VIEWPORTS) {
    test(`Live surfaces: consent, Why, Sources, restaurant detail, Ask + reply @${vp.name}`, async ({ browser }) => {
      const { context, page, errors } = await device(browser, vp);
      await setup(page);
      await page.goto('/?mode=live');
      await page.waitForSelector('.app-layout[data-context-mode="live"]');
      await shot(page, 'consent', vp.name);
      await expectNoJargon(page, 'consent');
      // Increment 2: one sentence-case title, one plain line, the disclosure, then two clear actions.
      const consent = await visibleText(page, '.quiet-card');
      expect(consent).toContain('Use your location');
      expect(consent).toContain('Yori uses it to find lunch places near you.');
      for (const banned of ['coordinates manually', 'Location Needed', 'Location Permission Needed', 'Grant permission', 'Use My Location']) {
        expect(consent, `consent shows "${banned}"`).not.toContain(banned);
      }
      // At first paint, with no scrolling, both buttons are hit-testable at every corner (nothing,
      // including the floating Ask bar, covers them).
      for (const id of ['#btn-request-location', '#btn-deny-location']) {
        const covered = await page.locator(id).evaluate(el => {
          const r = el.getBoundingClientRect();
          // Inset past the rounded corners (pill buttons), so a corner sample lands on the button.
          const ix = Math.min(r.width / 2, r.height / 2 + 2);
          const pts = [[r.left + ix, r.top + 3], [r.right - ix, r.top + 3], [r.left + ix, r.bottom - 3], [r.right - ix, r.bottom - 3], [r.left + r.width / 2, r.top + r.height / 2]];
          return pts
            .map(([x, y]) => { const hit = document.elementFromPoint(x!, y!); return !hit || hit === el || el.contains(hit) ? '' : `${Math.round(x!)},${Math.round(y!)} ${hit.className}`; })
            .filter(Boolean);
        });
        expect(covered, `${id} covered at first paint`).toEqual([]);
      }
      expect(await page.evaluate(() => window.scrollY)).toBe(0);

      await page.locator('#btn-request-location').click();
      await page.locator('#btn-nearby-now').click();
      await expect(page.locator('#candidate-model-reason')).toHaveAttribute('data-engine', 'meta_model_live', { timeout: 10000 });

      await page.locator('#btn-why').click();
      await expect(page.locator('#why-sheet')).toBeVisible();
      await expect(page.locator('#why-sheet')).toContainText('Nearby places');
      await shot(page, 'why-lunch', vp.name);
      await expectNoJargon(page, 'why-lunch', '#why-sheet');
      await page.keyboard.press('Escape');
      await expect(page.locator('#why-sheet')).toHaveCount(0);

      // Sources keeps the technical provenance (engine status with latency) one tap away.
      await page.locator('#pill-context-status').click();
      await expect(page.locator('#model-status-pill')).toBeVisible();
      await shot(page, 'sources', vp.name);
      await page.keyboard.press('Escape');

      await page.locator('.v2-candidate-card .v2-view-detail-link').first().click();
      await expect(page.locator('.v2-restaurant-detail')).toBeVisible();
      // The detail keeps the facts (the straight-line qualifier lives here), with no empty map box.
      await expect(page.locator('.v2-restaurant-detail')).toContainText('(straight-line)');
      expect(await page.locator('.v2-map-card:has(.map-unavailable-canvas)').evaluateAll(els => els.filter(e => (e as HTMLElement).offsetHeight > 0).length)).toBe(0);
      // Increment 3: the place's own photo leads (loaded, credited); Save/Directions sit at the foot.
      const photo = page.locator('.v2-restaurant-hero-photo img');
      await expect(photo).toHaveAttribute('alt', 'Photo of Mid Ramen');
      await expect.poll(() => photo.evaluate(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await expect(page.locator('.v2-restaurant-hero-photo .qp-photo-credit')).toHaveText('Photo: Recorded author');
      await expect(page.locator('.v2-restaurant-hero-art')).toHaveCount(0);
      expect(await visibleText(page, '.v2-restaurant-detail')).not.toMatch(/\bmin walk\b/);
      await shot(page, 'restaurant-detail', vp.name);
      await expectNoJargon(page, 'restaurant-detail', 'main');
      await page.goBack();
      await expect(page.locator('.v2-candidate-card').first()).toBeVisible();

      await page.locator('#ask-bar').click();
      await expect(page.locator('#conversation-input')).toBeVisible();
      await shot(page, 'ask-open', vp.name);
      await page.locator('#conversation-input').fill('why this restaurant?');
      await page.locator('#conversation-send-btn').click();
      await expect(page.locator('#conversation-transcript')).toContainText('Mid Ramen is open now', { timeout: 10000 });
      // The Ask header shows one engine status without latency (latency lives in Sources).
      await expect(page.locator('#conversation-model-status-pill')).not.toContainText('ms');
      await shot(page, 'ask-reply', vp.name);
      await expectNoJargon(page, 'ask-reply', '.conversation-shell');

      expect(errors.filter(e => !benign(e))).toEqual([]);
      await context.close();
    });

    test(`Demo surfaces: Why (depart), trip detail with map panel, accepted state @${vp.name}`, async ({ browser }) => {
      const { context, page, errors } = await device(browser, vp);
      // Weather off: a recorded live reading would replace the demo scene's simulated rain.
      await setup(page, { weatherOff: true });
      await page.goto('/?ui=v2&timeline=1');
      await page.waitForSelector('.app-layout');
      await page.evaluate(() => (window as any).__YORI_TIMELINE__.goTo('S3'));
      await expect(page.locator('.v2-journey-card .qp-hero-glyph')).toBeVisible();

      await page.locator('#btn-why').click();
      await expect(page.locator('#why-sheet')).toBeVisible();
      await shot(page, 'why-depart', vp.name);
      await expectNoJargon(page, 'why-depart', '#why-sheet');
      await page.keyboard.press('Escape');

      await page.locator('#btn-view-trip-details').click();
      await expect(page.locator('.v2-mode-tab').first()).toBeVisible();
      await shot(page, 'trip-detail', vp.name);
      await expectNoJargon(page, 'trip-detail', 'main');
      await expectRainLabelClear(page);
      await page.goBack();

      await expect(page.locator('#btn-accept')).toBeVisible();
      await page.locator('#btn-accept').click();
      await expect(page.locator('#btn-undo-accept')).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, 'accepted', vp.name);
      // Desktop: the rail map is large and carries the rain label; it must sit clear of the route.
      if (vp.width >= 1024) expect(await expectRainLabelClear(page)).toBeGreaterThan(0);
      else await expectRainLabelClear(page);
      expect(errors.filter(e => !benign(e))).toEqual([]);
      await context.close();
    });

    test(`Designed states: empty, error, location denied @${vp.name}`, async ({ browser }) => {
      for (const [name, opts, geo] of [
        ['state-empty', { noPlaces: true }, true],
        ['state-error', { placesError: true }, true],
      ] as const) {
        const { context, page, errors } = await device(browser, vp, geo);
        await setup(page, opts);
        await page.goto('/?mode=live');
        await page.waitForSelector('.app-layout[data-context-mode="live"]');
        await page.locator('#btn-request-location').click();
        await page.locator('#btn-nearby-now').click();
        await page.waitForTimeout(1200);
        await shot(page, name, vp.name);
        await expectNoJargon(page, name, 'main');
        if (name === 'state-error') {
          // Increment 2: one failure line and Retry; nothing claims "all caught up" beside it.
          const card = await visibleText(page, '.quiet-card');
          expect(card).toContain("Nearby places didn't load.");
          expect(card).not.toMatch(/all caught up|No proactive reminders/i);
          await expect(page.locator('#btn-nearby-now')).toHaveText('Retry');
        }
        expect(errors.filter(e => !benign(e) && !/status of 500/.test(e))).toEqual([]);
        await context.close();
      }
      const { context, page } = await device(browser, vp, false);
      await setup(page);
      await page.goto('/?mode=live');
      await page.waitForSelector('.app-layout[data-context-mode="live"]');
      await page.locator('#btn-deny-location').click();
      await expect(page.locator('#living-header-line')).toContainText('Weather needs location');
      await shot(page, 'state-denied', vp.name);
      await expectNoJargon(page, 'state-denied', 'main');
      expect(await visibleText(page, '.quiet-card')).not.toContain('coordinates manually');
      await context.close();
    });
  }

  for (const width of [1280, 1440]) {
    test(`desktop rail: Destination weather sits whole inside its card, clear of the Ask bar @${width}`, async ({ browser }) => {
      const { context, page, errors } = await device(browser, { width, height: 800 });
      await setup(page, { weatherOff: true });
      await page.goto('/?ui=v2&timeline=1');
      await page.waitForSelector('.app-layout');
      await page.evaluate(() => (window as any).__YORI_TIMELINE__.goTo('S3'));
      const card = page.locator('.desktop-right-panel .desktop-weather-card');
      await expect(card).toBeVisible();
      await settle(page);

      // The Ask dock stays inside the centre column at any desktop width.
      const geometry = await page.evaluate(() => {
        const dock = document.querySelector('.qp-ask-dock .ask-bar') as HTMLElement;
        const rail = document.querySelector('.desktop-right-panel') as HTMLElement;
        const side = document.querySelector('.desktop-sidebar, .app-layout > :first-child') as HTMLElement;
        return { dock: dock.getBoundingClientRect().toJSON(), rail: rail.getBoundingClientRect().toJSON(), sideRight: side.getBoundingClientRect().right };
      });
      expect(geometry.dock.right).toBeLessThanOrEqual(geometry.rail.left);
      expect(geometry.dock.left).toBeGreaterThanOrEqual(geometry.sideRight);

      // Increment 3: the rail map says "schematic" once (the badge), like the Home strip.
      const railMap = page.locator('.desktop-right-panel .desktop-map-card').first();
      await expect(railMap.locator('.card-badge').first()).toHaveText('Schematic · simulated');
      expect((await visibleText(page, '.desktop-right-panel .desktop-map-card')).match(/schematic/gi)?.length ?? 0).toBe(1);

      // Scrolled to the bottom of the rail, the eyebrow and the temperature are inside the card and
      // nothing covers them (hit-test at each box's corners and centre).
      await page.locator('.desktop-right-panel').evaluate(el => { el.scrollTop = el.scrollHeight; });
      await settle(page);
      const result = await card.evaluate(cardEl => {
        const c = cardEl.getBoundingClientRect();
        const problems: string[] = [];
        for (const sel of ['.section-label', '.desktop-weather-temp', '.desktop-weather-time']) {
          const el = cardEl.querySelector(sel) as HTMLElement | null;
          if (!el) { problems.push(`${sel} missing`); continue; }
          const r = el.getBoundingClientRect();
          if (r.left < c.left || r.right > c.right || r.top < c.top || r.bottom > c.bottom) problems.push(`${sel} outside card`);
          if (el.scrollWidth > el.clientWidth + 1) problems.push(`${sel} text clipped`);
          const midY = r.top + r.height / 2;
          for (const x of [r.left + 2, r.right - 2, r.left + r.width / 2]) {
            const y = midY;
            const hit = document.elementFromPoint(x, y);
            if (!hit || !(el === hit || el.contains(hit))) problems.push(`${sel} covered at ${Math.round(x)},${Math.round(y)} by ${hit?.className || hit?.tagName}`);
          }
        }
        return problems;
      });
      expect(result).toEqual([]);
      await page.screenshot({ path: path.join(EVIDENCE_DIR, `inc2-rail-${width}x800.png`) });
      expect(errors.filter(e => !benign(e))).toEqual([]);
      await context.close();
    });
  }

  test('dev decision log (developer surface, ?dev=1) on the same tokens', async ({ browser }) => {
    const { context, page } = await device(browser, { width: 390, height: 844 });
    await setup(page);
    await page.goto('/?mode=live&dev=1');
    await page.waitForSelector('.app-layout[data-context-mode="live"]');
    await page.locator('#btn-request-location').click();
    await page.locator('#btn-nearby-now').click();
    await expect(page.locator('#candidate-model-reason')).toHaveAttribute('data-engine', 'meta_model_live', { timeout: 10000 });
    await page.locator('#ask-bar').click();
    await page.locator('#btn-toggle-decision-log').click();
    await expect(page.locator('#decision-log-content')).toBeVisible();
    await shot(page, 'decision-log', '390x844');
    await context.close();
  });

  test('screen recording (<= 20 s): sheet, Ask reply and detail transitions', async ({ browser }) => {
    const videoDir = path.join(EVIDENCE_DIR, '.video-tmp-area2');
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Tokyo', permissions: ['geolocation'], geolocation: FIX,
      isMobile: true, hasTouch: true, recordVideo: { dir: videoDir, size: { width: 390, height: 844 } },
    });
    const page = await context.newPage();
    await setup(page);
    const started = Date.now();
    await page.goto('/?mode=live');
    await page.waitForSelector('.app-layout[data-context-mode="live"]');
    await page.locator('#btn-request-location').click();
    await page.locator('#btn-nearby-now').click();
    await expect(page.locator('#candidate-model-reason')).toHaveAttribute('data-engine', 'meta_model_live', { timeout: 10000 });
    await page.waitForTimeout(500);
    await page.locator('#btn-why').click();
    await page.waitForTimeout(1200);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.locator('.v2-candidate-card .v2-view-detail-link').first().click();
    await page.waitForTimeout(1200);
    await page.goBack();
    await page.waitForTimeout(600);
    await page.locator('#ask-bar').click();
    await page.locator('#conversation-input').fill('why this restaurant?');
    await page.locator('#conversation-send-btn').click();
    await page.waitForTimeout(1500);
    const video = page.video();
    await context.close();
    expect(Date.now() - started).toBeLessThanOrEqual(20000);
    if (video) fs.copyFileSync(await video.path(), path.join(EVIDENCE_DIR, 'area2-screen-recording-390x844.webm'));
    fs.rmSync(videoDir, { recursive: true, force: true });
  });
});
