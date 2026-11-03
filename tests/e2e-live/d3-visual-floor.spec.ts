/**
 * D3-VISUAL-PASS floor (DEMO_RESCUE rev11, TID INBOX-20261102-60744A).
 *
 * Drives the four demo surfaces on Live with recorded provider data (no external calls) at
 * 390x844 and 1280x800 — home/now (weather near you), lunch candidates, weather, Ask Yori — and
 * asserts the measurable floor (a)-(h) from the dispatch. Screenshots go to
 * <evidence>/demo-rescue-d3/<phase>-<surface>-<viewport>.png where phase = D3_PHASE (default
 * "after"); test-results/ unless UPDATE_EVIDENCE=1.
 */

import { test, expect, type Page, type Browser } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import fs from 'node:fs';
import { getEvidenceDir } from '../e2e/helpers/evidence-dir.js';

const EVIDENCE_DIR = getEvidenceDir('demo-rescue-d3');
const PHASE = process.env.D3_PHASE || 'after';
const FIX = { latitude: 35.689487, longitude: 139.691706 }; // Tokyo-Shinjuku fixture

/** Etc/GMT zone whose local hour is 18 now (outside the meal window; deterministic any time). */
function eveningTimezone(): string {
  const utcHour = new Date().getUTCHours();
  let offset = (18 - utcHour + 24) % 24;
  if (offset > 14) offset -= 24;
  if (offset === 0) return 'Etc/GMT';
  return offset > 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${-offset}`;
}

const OBSERVED_ISO = new Date(Math.floor((Date.now() - 15 * 60000) / 900000) * 900000).toISOString();

function places() {
  const fetchedAt = new Date().toISOString();
  return [
    { placeId: 'overpass-node-4242001', osmId: 4242001, name: 'Shinjuku Soba Tei', cuisine: 'soba', category: 'restaurant', coords: { lat: 35.6899, lng: 139.6921 }, source: 'live', fetchedAt, straightLineDistanceMeters: 56, straightLineDistanceLabel: '56 m (straight-line)', openingStatus: 'open' },
    { placeId: 'overpass-way-4242002', osmId: 4242002, name: 'Nishi Curry House', cuisine: 'curry', category: 'restaurant', coords: { lat: 35.6902, lng: 139.693 }, source: 'live', fetchedAt, straightLineDistanceMeters: 136, straightLineDistanceLabel: '136 m (straight-line)' },
  ];
}

async function setup(page: Page, opts: { placesFail?: boolean; placesEmpty?: boolean } = {}) {
  const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/xmemo/**', r => r.fulfill(json({ enabled: false, connected: false })));
  await page.route('**/api/calendar/**', r => r.fulfill(json({ enabled: false, configured: false })));
  await page.route('**/api/route/**', r => r.fulfill(json({ enabled: false })));
  await page.route(u => u.pathname === '/api/weather/status', r =>
    r.fulfill(json({ enabled: true, provider: 'open-meteo', attribution: { text: 'Weather data by Open-Meteo.com', url: 'https://open-meteo.com/', license: 'CC BY 4.0' }, outboundHosts: [{ purpose: 'weather', host: 'api.open-meteo.com' }] }))
  );
  await page.route(u => u.pathname === '/api/weather/current', r =>
    r.fulfill(
      json({
        enabled: true,
        source: 'Open-Meteo',
        fetchedAt: new Date().toISOString(),
        coordinate: { kind: 'device_fix', latitude: 35.689, longitude: 139.692, decimals: 3 },
        attribution: { text: 'Weather data by Open-Meteo.com', url: 'https://open-meteo.com/', license: 'CC BY 4.0' },
        signals: [{ kind: 'weather', source: 'real', label: 'real', issuedAt: OBSERVED_ISO, validFor: 3600000, confidence: 1, consentScope: 'device_only', value: { condition: 'cloudy', precipProbability: 0.1, temperatureC: 14.2, weatherCode: 1, city: 'Near you' } }],
      })
    )
  );
  await page.route(u => u.pathname === '/api/places/status', r =>
    r.fulfill(json({ enabled: true, provider: 'overpass', attribution: 'OpenStreetMap via Overpass (ODbL)', outboundHosts: [{ purpose: 'nearby places', host: 'overpass-api.de/api/interpreter' }] }))
  );
  await page.route(u => u.pathname === '/api/places', r => {
    if (opts.placesFail) return r.fulfill(json({ error: 'Failed to fetch places' }, 500));
    return r.fulfill(json({ enabled: true, places: opts.placesEmpty ? [] : places(), attribution: 'OpenStreetMap via Overpass (ODbL)' }));
  });
}

async function device(browser: Browser, vp: { width: number; height: number }) {
  const context = await browser.newContext({
    viewport: vp,
    timezoneId: eveningTimezone(),
    permissions: ['geolocation'],
    geolocation: FIX,
    isMobile: vp.width < 768,
    hasTouch: vp.width < 768,
  });
  return { context, page: await context.newPage() };
}

async function grant(page: Page) {
  await page.goto('/?mode=live');
  await page.waitForSelector('.app-layout[data-context-mode="live"]');
  await page.locator('#btn-request-location').click();
  await expect(page.locator('#live-weather-now')).toBeVisible({ timeout: 10000 });
}

async function shot(page: Page, surface: string, vp: string) {
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${PHASE}-${surface}-${vp}.png`) });
}

const LIVE_FORBIDDEN = /\b(fixture|simulated|replay|demo profile|demo scene)\b/i;

/** (e) every visible interactive control in the main surface is at least 44x44 CSS px. */
async function smallTargets(page: Page, scope: string) {
  // Measure after entrance motion settles (a mid-animation transform shrinks boxes below 44 px).
  await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => null))));
  return page.evaluate(sel => {
    const root = document.querySelector(sel) ?? document.body;
    const out: string[] = [];
    root.querySelectorAll<HTMLElement>('button, a[href], [role="button"], input, select').forEach(el => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') return;
      if (el.closest('[aria-hidden="true"]')) return;
      // Inline text links inside running copy are exempt (WCAG 2.5.8 inline exception).
      if (el.tagName === 'A' && cs.display === 'inline') return;
      if (r.width < 44 || r.height < 44) out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} ${Math.round(r.width)}x${Math.round(r.height)}`);
    });
    return out;
  }, scope);
}

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '1280x800', width: 1280, height: 800 },
];

test.describe('D3-VISUAL-PASS floor', () => {
  test.beforeAll(() => fs.mkdirSync(EVIDENCE_DIR, { recursive: true }));
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'viewports are driven explicitly; run once');
  });

  for (const vp of VIEWPORTS) {
    test(`home/now + weather @${vp.name}`, async ({ browser }) => {
      const { context, page } = await device(browser, vp);
      await setup(page);
      await grant(page);
      await shot(page, 'home', vp.name);
      await page.locator('#live-weather-now').scrollIntoViewIfNeeded();
      await shot(page, 'weather', vp.name);

      // (c) label audit on Live
      expect.soft(await page.locator('body').innerText(), '(c) no fixture/simulated/replay strings').not.toMatch(LIVE_FORBIDDEN);
      // (b) one provenance chip per card on home too
      const homeCards = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('main .card'))
          .filter(c => c.getBoundingClientRect().height > 0)
          .map(c => ({ id: c.className.split(' ').slice(0, 2).join('.'), chips: Array.from(c.querySelectorAll('.provenance-chip')).filter(ch => ch.closest('.card') === c).length }))
      );
      for (const c of homeCards) expect.soft(c.chips, `(b) ${c.id} has exactly one provenance chip (home)`).toBe(1);
      // (h) weather is a designed state (a card component with value + provenance), not a raw line
      await expect.soft(page.locator('#live-weather-now .live-weather-now-value')).toHaveText('Cloudy · 14.2°C');
      // (e) targets + AA
      expect.soft(await smallTargets(page, 'main'), '(e) touch targets >= 44px on home').toEqual([]);
      const axe = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
      expect.soft(axe.violations.map(v => v.nodes.map(n => n.target.join(' '))).flat(), '(e) AA contrast on home').toEqual([]);
      await context.close();
    });

    test(`lunch candidates @${vp.name}`, async ({ browser }) => {
      const { context, page } = await device(browser, vp);
      await setup(page);
      await grant(page);
      await page.evaluate(() => {
        (window as any).__d3cls = 0;
        new PerformanceObserver(list => {
          for (const e of list.getEntries() as any[]) if (!e.hadRecentInput) (window as any).__d3cls += e.value;
        }).observe({ type: 'layout-shift', buffered: false });
      });
      await page.locator('#btn-nearby-now').click();
      const hero = page.locator('.v2-candidate-card').first();
      await expect(hero).toBeVisible({ timeout: 10000 });
      await page.waitForTimeout(600);
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, 'lunch', vp.name);

      // (f) at 390 the top candidate leads above the fold: name, distance, open status, reason, Directions
      if (vp.width === 390) {
        for (const sel of ['.v2-candidate-name', '.v2-distance-chip', '.v2-open-chip', '.v2-candidate-basis', '.v2-directions-btn']) {
          const box = await hero.locator(sel).first().boundingBox();
          expect.soft(box && box.y + box.height <= vp.height - 90, `(f) ${sel} above the fold (clear of the Ask bar)`).toBe(true);
        }
        // secondary chrome folded: What-changed is a one-line disclosure (detail hidden until tapped);
        // the separate location row is gone (the header line already says "Location shared").
        await expect.soft(page.locator('#hero-cause-effect'), '(f) What-changed detail folded').toBeHidden();
        const summary = await page.locator('#what-changed-marker').boundingBox();
        expect.soft(summary && summary.height <= 40, '(f) What-changed summary is one line').toBe(true);
        await expect.soft(page.locator('.v2-active-location-bar'), '(f) location row folded').toHaveCount(0);
      }
      // (b) exactly one provenance chip per card
      // Chips are counted per nearest card (a nested map strip is its own card; the candidate tile
      // is content of the Now card, not a card of its own).
      const perCard = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('main .card'))
          .filter(c => c.getBoundingClientRect().height > 0)
          .map(c => ({
            id: c.id || c.className.split(' ').slice(0, 2).join('.'),
            chips: Array.from(c.querySelectorAll('.provenance-chip')).filter(ch => ch.closest('.card') === c).length,
          }))
      );
      for (const c of perCard) expect.soft(c.chips, `(b) ${c.id} has exactly one provenance chip`).toBe(1);
      // (c) label audit
      expect.soft(await page.locator('body').innerText(), '(c) no fixture/simulated/replay strings').not.toMatch(LIVE_FORBIDDEN);
      // (e) targets, AA, CLS on the morph
      expect.soft(await smallTargets(page, 'main'), '(e) touch targets >= 44px on lunch').toEqual([]);
      const axe = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
      expect.soft(axe.violations.map(v => v.nodes.map(n => n.target.join(' '))).flat(), '(e) AA contrast on lunch').toEqual([]);
      const cls = await page.evaluate(() => (window as any).__d3cls as number);
      expect.soft(cls, '(e) CLS <= 0.1 on the quiet -> lunch morph').toBeLessThanOrEqual(0.1);
      await context.close();
    });

    test(`Ask Yori @${vp.name}`, async ({ browser }) => {
      const { context, page } = await device(browser, vp);
      await setup(page);
      await grant(page);
      await page.locator('#ask-bar').click();
      const overlay = page.locator('#conversation-overlay');
      await expect(overlay).toBeVisible();
      await page.locator('#conversation-input').fill('why');
      await page.locator('#conversation-send-btn').click();
      await page.waitForTimeout(800);
      if (await overlay.count()) {
        await shot(page, 'ask', vp.name);
        // (a) one status line; dev tools only behind ?dev=1
        const statusCount = await page.evaluate(() =>
          Array.from(document.querySelectorAll<HTMLElement>('.conversation-subtitle-row > *')).filter(
            el => el.getBoundingClientRect().height > 0 && (el.innerText || '').trim().length > 0
          ).length
        );
        expect.soft(statusCount, '(a) exactly one status line in the Ask header').toBe(1);
        for (const sel of ['#btn-toggle-decision-log', '#btn-export-decision-log', '#decision-log-drawer', '#decision-log-content']) {
          await expect.soft(page.locator(sel), `(a) ${sel} absent without ?dev=1`).toHaveCount(0);
        }
        // (d) composer visible, unoccluded and submittable; Pin not clipped; transcript scrolls
        const hit = await page.evaluate(() => {
          const out: Record<string, boolean> = {};
          for (const id of ['conversation-input', 'conversation-send-btn', 'conversation-pin-btn']) {
            const el = document.getElementById(id);
            if (!el) { out[id] = false; continue; }
            const r = el.getBoundingClientRect();
            const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            out[id] = r.right <= window.innerWidth && r.bottom <= window.innerHeight && r.left >= 0 && (el === top || el.contains(top));
          }
          const t = document.getElementById('conversation-transcript');
          out.transcriptScrolls = !!t && ['auto', 'scroll'].includes(getComputedStyle(t).overflowY);
          return out;
        });
        for (const [k, v] of Object.entries(hit)) expect.soft(v, `(d) ${k} visible/unoccluded`).toBe(true);
        expect.soft(await page.locator('body').innerText(), '(c) no fixture/simulated/replay strings in Ask').not.toMatch(LIVE_FORBIDDEN);
      } else {
        await shot(page, 'ask', vp.name);
      }
      await context.close();
    });

    test(`deny + nearby failure/empty states @${vp.name}`, async ({ browser }) => {
      const { context, page } = await device(browser, vp);
      await setup(page);
      await page.goto('/?mode=live');
      await page.waitForSelector('.app-layout[data-context-mode="live"]');
      await page.locator('#btn-deny-location').click();
      await expect(page.locator('.v2-location-notice-banner.denied')).toBeVisible();
      await shot(page, 'deny', vp.name);
      // (g) the context pill lists only sources delivering data (no Weather/Location when denied)
      const pill = (await page.locator('#pill-context-status').first().innerText()).replace(/\s+/g, ' ');
      expect.soft(pill, '(g) deny-state pill does not claim Weather').not.toMatch(/Weather/);
      expect.soft(pill, '(g) deny-state pill does not claim Location').not.toMatch(/Location/);
      await context.close();

      // (h) nearby failure and empty are designed states
      for (const variant of ['fail', 'empty'] as const) {
        const d = await device(browser, vp);
        await setup(d.page, variant === 'fail' ? { placesFail: true } : { placesEmpty: true });
        await grant(d.page);
        const note = d.page.locator('#nearby-now-note');
        await expect.soft(note).toBeVisible();
        await expect.soft(note, `(h) nearby ${variant} uses the designed state component`).toHaveClass(/nearby-state/);
        // The card can re-render while async statuses land (the node is replaced): retry the scroll
        // instead of failing on a detached element (intermittent under full-suite load).
        await expect(async () => {
          await d.page.locator('#nearby-now').scrollIntoViewIfNeeded({ timeout: 1000 });
        }).toPass({ timeout: 8000 });
        await shot(d.page, `nearby-${variant}`, vp.name);
        await d.context.close();
      }
    });
  }
});
