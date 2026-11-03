/**
 * UI-QUIET-PRECISION acceptance (owner directive 2026-11-03 17:05 / 17:08 JST, TID
 * INBOX-20261103-A22CFB). Recorded responses only (zero live calls); providers are pinned off.
 * - Header band (owner reference 04): wordmark, greeting, ONE 'Live context' pill; no status
 *   line, LIVE badge, engine pill or connector N/A chips. The honest time / weather / place line
 *   stays in the DOM for assistive tech (visually hidden).
 * - Fold at 390: reference 04 places the hero title at ~282 px, so the card starts <= 260 px and
 *   its title <= 300 px (the earlier 180 px budget predates the binding 04 header); at most one
 *   status pill above the fold; Accept and Not now are hit-testable at scroll top (D3 floor).
 * - No visible 'deterministic', latency 'ms', 'fallback ·' or '(straight-line)' on Home / lunch /
 *   depart cards; the same facts stay one tap away (Sources sheet engine status, details view).
 * - Contrast: body text and the primary button meet WCAG AA (computed colours).
 * - Defect (b): any consented fix gets its weather request (no 60 s wait); with no fix the
 *   header names the missing location instead of 'Weather unavailable'.
 */

import { test, expect, type Page, type Browser } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { getEvidenceDir } from '../e2e/helpers/evidence-dir.js';

const EVIDENCE_DIR = getEvidenceDir('ui-quiet-precision');
const FIX = { latitude: 35.689487, longitude: 139.691706 }; // public Shinjuku fixture point

function places() {
  const fetchedAt = new Date().toISOString();
  const base = { category: 'restaurant', source: 'live', provenance: 'google', fetchedAt, attribution: 'Powered by Google' };
  return [
    { ...base, placeId: 'google-A', coords: { lat: 35.6893, lng: 139.6921 }, name: 'Near Cafe', cuisine: 'cafe', straightLineDistanceMeters: 45, straightLineDistanceLabel: '45 m (straight-line)', openingStatus: 'open', rating: 4.6, userRatingCount: 1204, priceLevel: 2 },
    { ...base, placeId: 'google-B', coords: { lat: 35.6905, lng: 139.6925 }, name: 'Mid Ramen', cuisine: 'ramen', straightLineDistanceMeters: 125, straightLineDistanceLabel: '125 m (straight-line)', openingStatus: 'open', rating: 4.2, userRatingCount: 310 },
    { ...base, placeId: 'google-C', coords: { lat: 35.6915, lng: 139.6935 }, name: 'Soba Corner', cuisine: 'soba', straightLineDistanceMeters: 260, straightLineDistanceLabel: '260 m (straight-line)', openingStatus: 'open', rating: 4.4, userRatingCount: 512 },
  ];
}

interface Watch {
  weatherCurrent: string[];
}

async function setup(page: Page, opts: { weather?: 'ok' | 'off' } = {}): Promise<Watch> {
  const watch: Watch = { weatherCurrent: [] };
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  const fetchedAt = new Date().toISOString();
  await page.route('**/api/xmemo/**', r => r.fulfill(json({ enabled: false, connected: false })));
  await page.route('**/api/calendar/**', r => r.fulfill(json({ enabled: false, configured: false })));
  await page.route('**/api/route/**', r => r.fulfill(json({ enabled: false })));
  await page.route(u => u.pathname === '/api/weather/status', r =>
    r.fulfill(json(opts.weather === 'off' ? { enabled: false } : { enabled: true, attribution: { text: 'Weather data by Open-Meteo.com', url: 'https://open-meteo.com/' } }))
  );
  await page.route(u => u.pathname === '/api/weather/current', r => {
    watch.weatherCurrent.push(new URL(r.request().url()).search ? 'coords' : 'none');
    return r.fulfill(json({
      enabled: true, source: 'Open-Meteo', fetchedAt, coordinate: { kind: 'device_fix' },
      signals: [{ kind: 'weather', value: { condition: 'cloudy', temperatureC: 14 }, source: 'real', label: 'real', provenance: 'open-meteo', issuedAt: fetchedAt, validFor: 3600000, confidence: 0.9 }],
    }));
  });
  await page.route('**/api/weather/forecast**', r => r.fulfill(json({ enabled: false })));
  await page.route(u => u.pathname === '/api/places/status', r =>
    r.fulfill(json({ enabled: true, provider: 'google', discovery: 'google', attribution: 'Powered by Google', outboundHosts: [{ purpose: 'nearby places and photos', host: 'places.googleapis.com' }] }))
  );
  await page.route(u => u.pathname === '/api/places', r => r.fulfill(json({ enabled: true, discovery: 'google', places: places(), attribution: 'Powered by Google' })));
  await page.route(u => u.pathname === '/api/model/command', r => r.fulfill(json({ result: null, usedFallback: true, fallbackReason: 'disabled', engineStatus: 'offline_deterministic' })));
  // The disabled answers the isolated test server gives (own test ports are outside the API Host
  // allowlist, so unmocked routes would be refused there).
  await page.route(u => u.pathname === '/api/model/reason', r => r.fulfill(json({ usedFallback: true, fallbackReason: 'disabled', engineStatus: 'offline_deterministic' })));
  await page.route(u => u.pathname === '/api/google/status', r => r.fulfill(json({ enabled: false, configured: false })));
  await page.route(u => u.pathname === '/api/model/candidates', r =>
    r.fulfill(json({
      result: { order: ['google-B', 'google-A', 'google-C'], reason: 'Mid Ramen is open now, rated 4.2 by 310 people and 125 m away.', citedFactKeys: [] },
      usedFallback: false, engineStatus: 'meta_model_live', latencyMs: 9000, ledger: { callCount: 38, cap: 100 },
    }))
  );
  await page.route('https://lh3.googleusercontent.com/**', r => r.fulfill({ status: 404 }));
  return watch;
}

async function device(browser: Browser, vp: { width: number; height: number }) {
  const context = await browser.newContext({
    viewport: vp, timezoneId: 'Asia/Tokyo', permissions: ['geolocation'], geolocation: FIX,
    isMobile: vp.width < 768, hasTouch: vp.width < 768,
  });
  return { context, page: await context.newPage() };
}

async function openLiveLunch(page: Page) {
  await page.goto('/?mode=live');
  await page.waitForSelector('.app-layout[data-context-mode="live"]');
  await page.locator('#btn-request-location').click();
  await page.locator('#btn-nearby-now').click();
  await expect(page.locator('.v2-candidate-card').first()).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#candidate-model-reason')).toHaveAttribute('data-engine', 'meta_model_live', { timeout: 10000 });
  await settle(page);
}

async function openDemoDepart(page: Page) {
  await page.goto('/?mode=demo&test=1&scene=rain');
  await page.waitForSelector('.now-card');
  await settle(page);
}

async function settle(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
}

/** Text a sighted user can see inside `root` (skips display:none, visibility:hidden and clipped nodes). */
async function visibleText(page: Page, selector: string): Promise<string> {
  return page.evaluate(sel => {
    const root = document.querySelector(sel);
    if (!root) return '';
    const hidden = (el: Element | null): boolean => {
      for (let e = el; e && e !== document.body; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden') return true;
        if (cs.clip && cs.clip !== 'auto' && /rect\(0(px)?,? 0(px)?/.test(cs.clip)) return true;
        if (e.getAttribute('aria-hidden') === 'true' && cs.position === 'absolute') return true;
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

async function hitTestable(page: Page, selector: string): Promise<boolean> {
  return page.evaluate(sel => {
    const b = document.querySelector(sel) as HTMLElement | null;
    if (!b) return false;
    const r = b.getBoundingClientRect();
    if (r.bottom > window.innerHeight) return false;
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!el && (el === b || b.contains(el));
  }, selector);
}

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '1280x800', width: 1280, height: 800 },
];

test.describe('UI-QUIET-PRECISION: Home header band, Now card and Lunch', () => {
  test.beforeAll(() => fs.mkdirSync(EVIDENCE_DIR, { recursive: true }));
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'viewports are driven explicitly; run once');
  });

  for (const vp of VIEWPORTS) {
    test(`header band: editorial greeting + one ambient line, no dashboard chrome @${vp.name}`, async ({ browser }) => {
      const { context, page } = await device(browser, vp);
      await setup(page);
      await openLiveLunch(page);
      const header = page.locator('.qp-header');
      await expect(header.locator('.greeting-title')).toBeVisible();
      await expect(header.locator('#living-header-ambient .qp-ambient-seg')).toHaveCount(3);
      await expect(page.locator('#living-header-line')).toContainText('Cloudy');
      const pill = page.locator('#pill-context-status');
      await expect(pill).toBeVisible();
      await expect(pill.locator('.context-pill-title')).toHaveText('Live context');
      await expect(pill.locator('.context-pill-subtitle')).toContainText('Weather');
      await expect(page.locator('#weather-attribution')).toContainText('Weather data by Open-Meteo.com');
      // Gone from Home: connector chips (N/A), the engine pill and the LIVE pill.
      await expect(page.locator('#desktop-connector-strip')).toHaveCount(0);
      await expect(page.locator('.connector-status-chip')).toHaveCount(0);
      await expect(header.locator('#model-status-pill')).toHaveCount(0);
      const headerText = await visibleText(page, '.qp-header');
      for (const jargon of ['N/A', 'Disconnected', 'deterministic', 'ms', 'Offline fallback']) {
        expect(headerText, jargon).not.toMatch(new RegExp(`\\b${jargon}\\b`));
      }
      await page.screenshot({ path: path.join(EVIDENCE_DIR, `home-lunch-${vp.name}.png`) });
      await context.close();
    });
  }

  test('fold at 390: card <= 260 px, title <= 300 px, one status pill at most, Accept and Not now hit-testable', async ({ browser }) => {
    const { context, page } = await device(browser, { width: 390, height: 844 });
    await setup(page);
    for (const [name, open] of [['depart', openDemoDepart], ['lunch', openLiveLunch]] as const) {
      await open(page);
      const first = await page.evaluate(() => {
        const top = (s: string) => { const el = document.querySelector(s); return el ? Math.round(el.getBoundingClientRect().top) : 9999; };
        return { card: Math.min(top('.v2-insight-banner'), top('.now-card')), title: Math.min(top('.now-card .qp-hero-title'), top('.now-card .now-subject')) };
      });
      expect(first.card, `${name}: hero card top`).toBeLessThanOrEqual(260);
      expect(first.title, `${name}: hero title top`).toBeLessThanOrEqual(300);
      const pills = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.model-status-pill, .connector-status-chip, .live-runtime-pill, .card-badge.live-badge'))
          .filter(e => { const r = e.getBoundingClientRect(); return r.height > 0 && r.top < window.innerHeight; }).length
      );
      expect(pills, `${name}: status pills above the fold`).toBeLessThanOrEqual(1);
      expect(await hitTestable(page, '#btn-accept'), `${name}: Accept hit-testable`).toBe(true);
      expect(await hitTestable(page, '#btn-dismiss'), `${name}: Not now hit-testable`).toBe(true);
      await page.screenshot({ path: path.join(EVIDENCE_DIR, `fold-${name}-390x844.png`) });
    }
    await context.close();
  });

  test('no provider jargon on the cards; the same facts stay one tap away', async ({ browser }) => {
    const { context, page } = await device(browser, { width: 390, height: 844 });
    await setup(page);
    await openLiveLunch(page);
    const lunchText = await visibleText(page, '.now-card');
    for (const jargon of ['deterministic', '(straight-line)', 'fallback ·', '9000ms', 'Powered by Google Powered by Google']) {
      expect(lunchText, jargon).not.toContain(jargon);
    }
    expect(lunchText).not.toMatch(/\b\d+ms\b/);
    // The qualifier is still in the card's text (screen readers, tooltip), just not shown.
    await expect(page.locator('.v2-candidate-card').first().locator('.v2-distance-chip')).toHaveAttribute('title', '125 m (straight-line)');
    await expect(page.locator('.v2-candidate-card').first().locator('.v2-distance-chip')).toContainText('(straight-line)');
    // Engine status (with latency) lives in the Sources sheet.
    await page.locator('#pill-context-status').click();
    const pill = page.locator('#model-status-pill');
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAttribute('data-engine-status', 'meta_model_live');
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'sources-sheet-390x844.png') });
    await page.keyboard.press('Escape');
    // Depart: the two facts and one primary action, no jargon.
    await openDemoDepart(page);
    const departText = await visibleText(page, '.now-card');
    expect(departText).not.toContain('deterministic');
    expect(departText).not.toMatch(/\b\d+ms\b/);
    await expect(page.locator('.now-card #now-title')).toContainText('Get ready at');
    await context.close();
  });

  test('contrast: body text and the primary button meet WCAG AA', async ({ browser }) => {
    const { context, page } = await device(browser, { width: 390, height: 844 });
    await setup(page);
    await openDemoDepart(page);
    const ratios = await page.evaluate(() => {
      const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
      const lum = ([r, g, b]: number[]) => {
        const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
      };
      const bgOf = (el: Element): number[] => {
        for (let e: Element | null = el; e; e = e.parentElement) {
          const c = parse(getComputedStyle(e).backgroundColor);
          if (c.length >= 3 && (c.length < 4 || c[3]! > 0.9)) return c.slice(0, 3);
        }
        return [247, 245, 239];
      };
      const ratio = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const fg = lum(parse(getComputedStyle(el).color).slice(0, 3));
        const bg = lum(bgOf(el));
        return Math.round(((Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05)) * 100) / 100;
      };
      return {
        greetingSub: ratio('.greeting-subheading'),
        pill: ratio('#pill-context-status .context-pill-subtitle'),
        heroTitle: ratio('.now-card .qp-hero-title'),
        title: ratio('.now-card .now-subject'),
        factLabel: ratio('.v2-journey-card #now-title [data-slot="chrome"]'),
        rationale: ratio('.now-card .now-rationale-line'),
        accept: ratio('#btn-accept'),
        secondary: ratio('#btn-dismiss'),
      };
    });
    for (const [k, v] of Object.entries(ratios)) {
      expect(v, `${k} contrast`).not.toBeNull();
      expect(v!, `${k} contrast ${v}`).toBeGreaterThanOrEqual(4.5);
    }
    await context.close();
  });

  for (const vp of VIEWPORTS) {
    test(`Settings > Connectors: one card per connector, quiet status lines @${vp.name}`, async ({ browser }) => {
      const { context, page } = await device(browser, vp);
      await setup(page);
      await page.goto('/?mode=live&tab=connectors');
      await expect(page.locator('#connector-row-location')).toBeVisible();
      await expect(page.locator('.connectors-title')).toHaveText('Connectors');
      // Status details are plain lines (no nested grey boxes).
      const detailBg = await page.locator('#connector-row-location .connector-detail').evaluate(e => getComputedStyle(e).backgroundColor);
      expect(detailBg === 'rgba(0, 0, 0, 0)' || detailBg === 'transparent').toBe(true);
      await page.screenshot({ path: path.join(EVIDENCE_DIR, `connectors-${vp.name}.png`) });
      await context.close();
    });
  }

  for (const vp of VIEWPORTS) {
    test(`zero console errors and no layout shift after load (CLS ~ 0) @${vp.name}`, async ({ browser }) => {
      const { context, page } = await device(browser, vp);
      const errors: string[] = [];
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
      page.on('pageerror', e => errors.push(`pageerror: ${String(e).slice(0, 160)}`));
      const failed: string[] = [];
      page.on('response', r => { if (r.status() >= 400) failed.push(`${r.status()} ${new URL(r.url()).pathname}`); });
      await setup(page);
      await page.addInitScript(() => {
        (window as any).__qpCls = 0;
        new PerformanceObserver(list => {
          for (const e of list.getEntries() as any[]) if (!e.hadRecentInput) (window as any).__qpCls += e.value;
        }).observe({ type: 'layout-shift', buffered: true });
      });
      const cls: Record<string, number> = {};
      for (const [name, open] of [
        ['depart', openDemoDepart],
        ['lunch', openLiveLunch],
        ['connectors', async (p: Page) => { await p.goto('/?mode=live&tab=connectors'); await expect(p.locator('#connector-row-location')).toBeVisible(); }],
      ] as const) {
        await open(page);
        await page.waitForTimeout(1200);
        cls[name] = await page.evaluate(() => Math.round(((window as any).__qpCls ?? 0) * 1000) / 1000);
      }
      console.log('QP_CLS', vp.name, JSON.stringify(cls), 'FAILED', JSON.stringify([...new Set(failed)]));
      for (const [name, v] of Object.entries(cls)) expect(v, `${name} CLS`).toBeLessThanOrEqual(0.02);
      // The recorded routes answer every API call; the only allowed noise is the deliberately
      // 404ed photo host (no real photo is fetched in tests).
      expect(errors.filter(e => !/lh3\.googleusercontent|Failed to load resource: the server responded with a status of 404/.test(e))).toEqual([]);
      await context.close();
    });
  }

  test('2x component crops for the review pack (header, hero, lunch row, Ask bar, connector card)', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: 'Asia/Tokyo',
      permissions: ['geolocation'], geolocation: FIX, isMobile: true, hasTouch: true,
    });
    const page = await context.newPage();
    await setup(page);
    await openDemoDepart(page);
    await page.locator('.qp-header').screenshot({ path: path.join(EVIDENCE_DIR, 'crop-2x-header.png') });
    await page.locator('.v2-journey-card').screenshot({ path: path.join(EVIDENCE_DIR, 'crop-2x-hero-card.png') });
    await page.locator('#ask-bar').screenshot({ path: path.join(EVIDENCE_DIR, 'crop-2x-ask-bar.png') });
    await openLiveLunch(page);
    await page.locator('.now-card .v2-candidate-list').screenshot({ path: path.join(EVIDENCE_DIR, 'crop-2x-lunch-row.png') });
    await page.goto('/?mode=live&tab=connectors');
    await expect(page.locator('#connector-row-location')).toBeVisible();
    await page.locator('#connector-row-location').screenshot({ path: path.join(EVIDENCE_DIR, 'crop-2x-connector-card.png') });
    await context.close();
  });

  test('screen recording (<= 20 s): press states, the Sources sheet and the lunch row', async ({ browser }) => {
    const videoDir = path.join(EVIDENCE_DIR, '.video-tmp');
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Tokyo', permissions: ['geolocation'], geolocation: FIX,
      isMobile: true, hasTouch: true, recordVideo: { dir: videoDir, size: { width: 390, height: 844 } },
    });
    const page = await context.newPage();
    await setup(page);
    const started = Date.now();
    await openDemoDepart(page);
    await page.waitForTimeout(800);
    const accept = page.locator('#btn-accept');
    const box = (await accept.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(250);
    await page.mouse.up();
    await page.waitForTimeout(700);
    await openLiveLunch(page);
    await page.waitForTimeout(600);
    await page.locator('.now-card .v2-candidate-list').evaluate(e => e.scrollTo({ left: 260, behavior: 'smooth' }));
    await page.waitForTimeout(900);
    await page.locator('#pill-context-status').click();
    await page.waitForTimeout(1200);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    const video = page.video();
    await context.close();
    expect(Date.now() - started).toBeLessThanOrEqual(20000);
    if (video) {
      const file = await video.path();
      fs.copyFileSync(file, path.join(EVIDENCE_DIR, 'screen-recording-390x844.webm'));
    }
    fs.rmSync(videoDir, { recursive: true, force: true });
  });

  test('defect (b): a fix from Connectors gets its weather request at once; no fix names the missing location', async ({ browser }) => {
    const { context, page } = await device(browser, { width: 1280, height: 800 });
    const watch = await setup(page);
    // No consented fix yet: the header says what is missing (not that weather failed).
    await page.goto('/?mode=live');
    await page.waitForSelector('.app-layout[data-context-mode="live"]');
    await expect(page.locator('#living-header-line')).toContainText('Weather needs location', { timeout: 5000 });
    expect(watch.weatherCurrent).not.toContain('coords');
    // Connect location from Settings > Connectors (in-app, no reload): the weather request for the
    // new fix follows immediately (it used to wait for a focus event or the 60 s refresh).
    await page.goto('/?mode=live&tab=connectors');
    await page.waitForSelector('.app-layout');
    await page.locator('#btn-connect-location').click();
    await expect.poll(() => watch.weatherCurrent.filter(x => x === 'coords').length, { timeout: 5000 }).toBe(1);
    await context.close();
  });

  test('defect (b): first paint after consent shows the weather (granted geolocation)', async ({ browser }) => {
    const { context, page } = await device(browser, { width: 390, height: 844 });
    const watch = await setup(page);
    await page.goto('/?mode=live');
    await page.waitForSelector('.app-layout[data-context-mode="live"]');
    await page.locator('#btn-request-location').click();
    await expect(page.locator('#living-header-line')).toContainText('Cloudy', { timeout: 5000 });
    await expect(page.locator('#living-header-line')).not.toContainText('unavailable');
    expect(watch.weatherCurrent.filter(x => x === 'coords')).toHaveLength(1);
    await context.close();
  });
});
