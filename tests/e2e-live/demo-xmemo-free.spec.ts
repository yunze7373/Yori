/**
 * DEMO-XMEMO-FREE e2e (owner directive 2026-11-03 15:52 JST: "XMemo must not appear in the demo
 * video"; TID INBOX-20261103-BA32D4).
 * Runs against the 4286 server started with YORI_DEMO_HIDE_XMEMO=1 (playwright.config.ts). On
 * every reachable screen, at 390x844 and 1280x800, document.body.innerText AND every attribute
 * value of every element contain no case-insensitive 'xmemo', and the page makes ZERO requests to
 * /api/xmemo. Memory stays honest and local ('saved on this device'). Zero paid calls: places are
 * recorded; model/route/weather providers are pinned off. D3 floor: the lunch hero is above the
 * docked Ask bar at first paint (scroll top). Fail closed: the build carries the recording marker
 * (VITE_YORI_DEMO_HIDE_XMEMO=1), so a failed / aborted / slow status answer cannot bring XMemo back.
 */

import { test, expect, type Page, type Browser } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { getEvidenceDir } from '../e2e/helpers/evidence-dir.js';
import { configuredUrl } from '../e2e/helpers/isolation-guard.js';

const APP = configuredUrl('YORI_DEMO_URL');
const EVIDENCE_DIR = getEvidenceDir('demo-xmemo-free');
const FIX = { latitude: 35.689487, longitude: 139.691706 };

function places() {
  const fetchedAt = new Date().toISOString();
  return [
    { placeId: 'google-A', coords: { lat: 35.6893, lng: 139.6921 }, name: 'Near Cafe', category: 'restaurant', source: 'live', provenance: 'google', fetchedAt, cuisine: 'cafe', straightLineDistanceMeters: 45, straightLineDistanceLabel: '45 m (straight-line)', openingStatus: 'open', rating: 4.6, userRatingCount: 1204, priceLevel: 2, attribution: 'Powered by Google' },
    { placeId: 'google-B', coords: { lat: 35.6905, lng: 139.6925 }, name: 'Mid Ramen', category: 'restaurant', source: 'live', provenance: 'google', fetchedAt, cuisine: 'ramen', straightLineDistanceMeters: 125, straightLineDistanceLabel: '125 m (straight-line)', openingStatus: 'open', rating: 4.2, userRatingCount: 310, attribution: 'Powered by Google' },
  ];
}

interface Watch {
  xmemoRequests: string[];
}

async function setup(page: Page): Promise<Watch> {
  const watch: Watch = { xmemoRequests: [] };
  page.on('request', r => {
    if (new URL(r.url()).pathname.toLowerCase().startsWith('/api/xmemo')) watch.xmemoRequests.push(r.url());
  });
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  // Only places are recorded (so the lunch card exists); everything else is the real demo server.
  await page.route(u => u.pathname === '/api/places/status', r =>
    r.fulfill(json({ enabled: true, provider: 'google', discovery: 'google', attribution: 'Powered by Google', outboundHosts: [{ purpose: 'nearby places and photos', host: 'places.googleapis.com' }] }))
  );
  await page.route(u => u.pathname === '/api/places', r => r.fulfill(json({ enabled: true, discovery: 'google', places: places(), attribution: 'Powered by Google' })));
  await page.route('https://lh3.googleusercontent.com/**', r => r.fulfill({ status: 404 }));
  return watch;
}

/** Every visible character and every attribute value on the page, lower-cased. */
async function scanForXmemo(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const hits: string[] = [];
    if (/xmemo/i.test(document.body.innerText)) {
      const i = document.body.innerText.toLowerCase().indexOf('xmemo');
      hits.push(`text: …${document.body.innerText.slice(Math.max(0, i - 40), i + 40)}…`);
    }
    if (/xmemo/i.test(document.title)) hits.push(`title: ${document.title}`);
    document.querySelectorAll('*').forEach(el => {
      for (const a of Array.from(el.attributes)) {
        if (/xmemo/i.test(a.value)) hits.push(`${el.tagName.toLowerCase()}[${a.name}="${a.value.slice(0, 80)}"]`);
      }
    });
    return hits;
  });
}

async function device(browser: Browser, vp: { width: number; height: number }) {
  const context = await browser.newContext({
    viewport: vp, timezoneId: 'Asia/Tokyo', permissions: ['geolocation'], geolocation: FIX,
    isMobile: vp.width < 768, hasTouch: vp.width < 768,
  });
  return { context, page: await context.newPage() };
}

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '1280x800', width: 1280, height: 800 },
];

test.describe('DEMO-XMEMO-FREE: no XMemo anywhere on the demo-recording build', () => {
  test.beforeAll(() => fs.mkdirSync(EVIDENCE_DIR, { recursive: true }));
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'viewports are driven explicitly; run once');
  });

  for (const vp of VIEWPORTS) {
    test(`every reachable screen is XMemo-free, with zero /api/xmemo requests @${vp.name}`, async ({ browser }) => {
      const { context, page } = await device(browser, vp);
      const watch = await setup(page);
      const visited: string[] = [];
      const check = async (name: string, shot = false) => {
        await page.waitForTimeout(400);
        expect(await scanForXmemo(page), `${name}: no 'xmemo' in text or attributes`).toEqual([]);
        visited.push(name);
        if (shot) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}-${vp.name}.png`) });
        }
      };

      // Live home before consent: the location consent sheet.
      await page.goto(`${APP}/?mode=live`);
      await page.waitForSelector('.app-layout[data-context-mode="live"]');
      await check('live-consent', true);
      // Live lunch card after consent.
      await page.locator('#btn-request-location').click();
      await page.locator('#btn-nearby-now').click();
      await expect(page.locator('.v2-candidate-card').first()).toBeVisible({ timeout: 10000 });
      await check('live-lunch', true);
      // D3 floor at first paint (scroll top): the hero candidate leads above the docked Ask bar.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
      const hero = page.locator('.v2-candidate-card').first();
      for (const sel of ['.v2-candidate-name', '.v2-distance-chip', '.v2-open-chip', '.v2-candidate-basis', '.v2-directions-btn']) {
        const box = await hero.locator(sel).first().boundingBox();
        expect(box && box.y + box.height <= vp.height - (vp.width < 768 ? 90 : 0), `D3: ${sel} above the fold`).toBe(true);
      }
      // Sources sheet (memory source), then the Why sheet.
      await page.locator('#pill-context-status').first().click();
      await expect(page.locator('#source-item-memory')).toContainText('saved on this device');
      await check('sources-sheet', true);
      await page.keyboard.press('Escape');
      const close = page.locator('#btn-close-why');
      if (await close.isVisible().catch(() => false)) await close.click();
      if (await page.locator('#btn-why').isVisible().catch(() => false)) {
        await page.locator('#btn-why').click();
        await check('why-sheet', true);
        if (await close.isVisible().catch(() => false)) await close.click();
      }
      // Ask panel.
      await page.locator('#ask-bar').click();
      await expect(page.locator('#conversation-input')).toBeVisible();
      await check('ask-panel', true);

      // Tabs and Settings > Connectors.
      for (const [name, url] of [
        ['plans', '/?mode=live&tab=plans'],
        ['for-you', '/?mode=live&tab=for-you'],
        ['me-memories', '/?mode=live&tab=me'],
        ['connectors', '/?mode=live&tab=connectors'],
      ] as const) {
        await page.goto(`${APP}${url}`);
        await page.waitForSelector('.app-layout');
        await check(name, true);
      }
      await expect(page.locator('#connector-row-calendar')).toBeVisible();

      // Demo mode (dev): depart (clear and rain), lunch, and the decision log + its export view.
      await page.goto(`${APP}/?mode=demo&dev=1`);
      await page.waitForSelector('.app-layout');
      await check('demo-home', true);
      for (const scene of ['rain', 'lunch']) {
        await page.goto(`${APP}/?mode=demo&dev=1&test=1&scene=${scene}`);
        await page.waitForSelector('.app-layout');
        await check(`demo-${scene}`, true);
      }
      await page.locator('#ask-bar').click();
      const logBtn = page.locator('#btn-toggle-decision-log');
      if (await logBtn.count()) {
        await logBtn.click();
        await check('decision-log', true);
      }

      expect(watch.xmemoRequests, 'zero /api/xmemo requests').toEqual([]);
      expect(visited).toEqual([
        'live-consent', 'live-lunch', 'sources-sheet', 'why-sheet', 'ask-panel', 'plans', 'for-you',
        'me-memories', 'connectors', 'demo-home', 'demo-rain', 'demo-lunch', 'decision-log',
      ]);
      await context.close();
    });
  }

  // Reviewer 51c59ea7: the recording build fails CLOSED even when the status route carrying the
  // server flag fails, is aborted, or is slower than the 5 s flag timeout.
  for (const mode of ['http500', 'aborted', 'delayed6s'] as const) {
    test(`fail closed: weather status ${mode} -> still no XMemo and zero /api/xmemo requests`, async ({ browser }) => {
      const { context, page } = await device(browser, { width: 390, height: 844 });
      const watch = await setup(page);
      await page.route(u => u.pathname === '/api/weather/status', async r => {
        if (mode === 'http500') return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' });
        if (mode === 'aborted') return r.abort('failed');
        await new Promise(res => setTimeout(res, 6000));
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: false }) });
      });
      await page.goto(`${APP}/?mode=live`);
      await page.waitForSelector('.app-layout[data-context-mode="live"]');
      await page.waitForTimeout(6500); // past the 5 s flag timeout (and the delayed answer)
      expect(await scanForXmemo(page), `live home (${mode})`).toEqual([]);
      await page.goto(`${APP}/?mode=live&tab=connectors`);
      await page.waitForSelector('.app-layout');
      await page.waitForTimeout(1500);
      expect(await scanForXmemo(page), `connectors (${mode})`).toEqual([]);
      expect(watch.xmemoRequests, `zero /api/xmemo requests (${mode})`).toEqual([]);
      await context.close();
    });
  }

  test('switch ON: the server exposes the flag and every XMemo route answers disabled', async ({ request }) => {
    const status = await (await request.get(`${APP}/api/weather/status`)).json();
    expect(status.demo).toEqual({ hideXmemo: true });
    const x = await request.get(`${APP}/api/xmemo/status`);
    expect(await x.json()).toEqual({ enabled: false, connected: false });
    expect((await request.post(`${APP}/api/xmemo/auth-url`)).status()).toBe(403);
  });
});
