import { test, expect, type Page } from '@playwright/test';
import { configuredUrl } from '../e2e/helpers/isolation-guard.js';
import * as path from 'path';

const SHIPPING_PREVIEW_URL = configuredUrl('YORI_SHIPPING_URL');
const TEST_BUILD_URL = configuredUrl('YORI_TEST_BUILD_URL');

/**
 * D2 (DEMO_RESCUE): the shipping build defaults the keyless trio ON after the owner §9
 * confirmation. The e2e preview servers pin the flags OFF to stay offline, so these tests answer
 * the three /status endpoints with the exact default-on payloads the real proxy serves (same
 * shape, same hosts) and abort every provider DATA request, counting it.
 */
const DEFAULT_ON_STATUS: Record<string, unknown> = {
  '/api/places/status': {
    enabled: true,
    provider: 'overpass',
    attribution: 'OpenStreetMap via Overpass (ODbL)',
    outboundHosts: [{ purpose: 'nearby places', host: 'overpass-api.de/api/interpreter' }],
  },
  '/api/route/status': {
    enabled: true,
    provider: 'osrm',
    tilesEnabled: false,
    outboundHosts: [
      { purpose: 'driving routes', host: 'router.project-osrm.org' },
      { purpose: 'walking routes', host: 'routing.openstreetmap.de/routed-foot' },
    ],
  },
  '/api/weather/status': {
    enabled: true,
    provider: 'open-meteo',
    attribution: { text: 'Weather data by Open-Meteo.com', url: 'https://open-meteo.com/', license: 'CC BY 4.0' },
    outboundHosts: [{ purpose: 'weather', host: 'api.open-meteo.com' }],
  },
};

async function routeDefaultOnTrio(page: Page): Promise<string[]> {
  const dataRequests: string[] = [];
  await page.route(
    u => u.pathname.startsWith('/api/'),
    async route => {
      const u = new URL(route.request().url());
      const status = DEFAULT_ON_STATUS[u.pathname];
      if (status) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(status) });
      }
      if (/^\/api\/(places|route|weather\/current)/.test(u.pathname)) {
        dataRequests.push(u.pathname + u.search);
        return route.abort();
      }
      return route.continue();
    }
  );
  return dataRequests;
}

const FORBIDDEN_FIXTURE_TEXTS = [
  'Piano lesson',
  'Fiore Caffe',
  'fuel station',
  'Demo timeline',
  'simulated time',
];

const ALLOWLISTED_FIXTURE_SELECTORS = [
  '.feed-now-card', // Feed mirror of now-card under labelled feed container
  '.ahead-card', // Feed upcoming plans under labelled feed container
  '.feed-empty-card', // Empty upcoming plans state
  '.sources-item', // Sources modal list item
  '.desktop-quiet-card', // Quiet panel in desktop IA
  '.quiet-panel-card',
  '.desktop-panel-titlebar', // Titlebar of desktop contextual details panel
  '.desktop-status-pill', // Status pill inside desktop contextual panel
  '.desktop-candidate-tile', // Candidate tiles inside desktop lunch panel
  '.trip-stats-grid', // Stats grid inside desktop map card
];

/**
 * Asserts that 100% of visible [data-provenance="fixture"] elements carry an explicit
 * simulated label or sit inside a container carrying a SIMULATED/simulated badge or chip,
 * with an explicit allowlist for fixture-tagged empty states and feed mirror items.
 */
async function assertAllVisibleFixturesAreLabelled(page: Page) {
  const fixtureLocators = page.locator('[data-provenance="fixture"]');
  const count = await fixtureLocators.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i++) {
    const loc = fixtureLocators.nth(i);
    const isVisible = await loc.isVisible();
    if (!isVisible) continue;

    const auditResult = await loc.evaluate((el: HTMLElement, allowlist: string[]) => {
      // 0. Explicit allowlist check
      for (const sel of allowlist) {
        if (el.matches(sel) || el.closest(sel)) {
          return { labelled: true };
        }
      }

      const hasSimulated = (text: string | null) => Boolean(text && /simulated/i.test(text));

      // 1. Element itself has simulated text or attributes
      if (
        hasSimulated(el.textContent) ||
        hasSimulated(el.getAttribute('aria-label')) ||
        hasSimulated(el.getAttribute('title'))
      ) {
        return { labelled: true };
      }

      // 2. Direct child badge
      const badge = el.querySelector(
        '.card-badge, .simulated-badge, .demo-chip, .badge, .context-pill-title, .context-pill-subtitle'
      );
      if (badge && hasSimulated(badge.textContent)) {
        return { labelled: true };
      }

      // 3. Nearest card or container
      const container = el.parentElement?.closest(
        '.card, section, .feed-now-card, .v2-now-card, .v2-map-card, .desktop-panel, .context-pill, .timeline-controls-bar, .v2-home-container, .main-container'
      );
      if (container) {
        if (
          hasSimulated(container.getAttribute('aria-label')) ||
          hasSimulated(container.getAttribute('title'))
        ) {
          return { labelled: true };
        }
        const containerBadge = container.querySelector(
          '.card-badge, .simulated-badge, .demo-chip, .badge, #living-header-chip, #pill-context-status'
        );
        if (containerBadge && hasSimulated(containerBadge.textContent)) {
          return { labelled: true };
        }
      }

      return {
        labelled: false,
        tag: el.tagName,
        className: el.className,
        id: el.id,
        text: el.textContent?.slice(0, 100),
      };
    }, ALLOWLISTED_FIXTURE_SELECTORS);

    expect(
      auditResult.labelled,
      `Unlabelled fixture element: <${auditResult.tag} class="${auditResult.className}" id="${auditResult.id}">: ${auditResult.text}`
    ).toBe(true);
  }
}

test.describe('S2-LIVE-DEFAULT: Production Live Default and Dev Mode Gating', () => {
  test('Prod build defaults to Live mode on first open without ?mode (honest consent gate, zero fixture provenance)', async ({
    page,
  }, testInfo) => {
    // Navigate to clean shipping preview root with no query parameters
    await page.goto(`${SHIPPING_PREVIEW_URL}/`);
    await page.waitForSelector('.app-layout');

    // 1. Context mode attribute must be strictly 'live'
    const appLayout = page.locator('.app-layout');
    await expect(appLayout).toHaveAttribute('data-context-mode', 'live');

    // 2. Living header shows 'live' chip
    const headerChip = page.locator('#living-header-chip');
    await expect(headerChip).toBeVisible();
    await expect(headerChip).toHaveText('live');

    // 3. Honest gated quiet state
    const quietTitle = page.locator('#quiet-title');
    await expect(quietTitle).toBeVisible();
    await expect(quietTitle).toContainText('Use your location'); // UI-QUIET-PRECISION increment 2

    const quietSubtitle = page.locator('#quiet-subtitle');
    await expect(quietSubtitle).toContainText('Yori uses it to find lunch places near you.');

    const requestLocationBtn = page.locator('#btn-request-location');
    await expect(requestLocationBtn).toBeVisible();
    await expect(requestLocationBtn).toHaveText('Use my location');

    // 4. Zero fixture provenance anywhere in DOM
    const fixtureElements = page.locator('[data-provenance="fixture"]');
    await expect(fixtureElements).toHaveCount(0);

    // 5. Zero demo copy in rendered text
    const fullBodyText = await page.locator('body').innerText();
    for (const forbidden of FORBIDDEN_FIXTURE_TEXTS) {
      expect(fullBodyText).not.toContain(forbidden);
    }

    // 6. Capture visual evidence according to project viewport
    const isMobile = testInfo.project.name === 'mobile';
    const evidencePath = isMobile
      ? path.resolve(process.cwd(), 'docs/evidence/live-default/01-default-live-first-open-390.png')
      : path.resolve(process.cwd(), 'docs/evidence/live-default/02-default-live-first-open-1280.png');

    await page.screenshot({ path: evidencePath, fullPage: true });
  });

  test('Prod build strictly ignores mode overrides (?mode, ?default_mode, window.__YORI_DEFAULT_MODE__)', async ({
    page,
  }) => {
    // Inject window.__YORI_DEFAULT_MODE__ = 'demo' before page load
    await page.addInitScript(() => {
      (window as any).__YORI_DEFAULT_MODE__ = 'demo';
    });

    // Case A: ?mode=demo
    await page.goto(`${SHIPPING_PREVIEW_URL}/?mode=demo`);
    await page.waitForSelector('.app-layout');
    await expect(page.locator('.app-layout')).toHaveAttribute('data-context-mode', 'live');
    await expect(page.locator('#quiet-title')).toBeVisible();
    await expect(page.locator('[data-provenance="fixture"]')).toHaveCount(0);

    // Case B: ?default_mode=demo
    await page.goto(`${SHIPPING_PREVIEW_URL}/?default_mode=demo`);
    await page.waitForSelector('.app-layout');
    await expect(page.locator('.app-layout')).toHaveAttribute('data-context-mode', 'live');
    await expect(page.locator('#quiet-title')).toBeVisible();
    await expect(page.locator('[data-provenance="fixture"]')).toHaveCount(0);

    // Case C: ?mode=demo&default_mode=demo
    await page.goto(`${SHIPPING_PREVIEW_URL}/?mode=demo&default_mode=demo`);
    await page.waitForSelector('.app-layout');
    await expect(page.locator('.app-layout')).toHaveAttribute('data-context-mode', 'live');
    await expect(page.locator('#quiet-title')).toBeVisible();
    await expect(page.locator('[data-provenance="fixture"]')).toHaveCount(0);

    // Check that window.__YORI_DEFAULT_MODE__ was present on window but ignored by app
    const defaultMode = await page.evaluate(() => {
      return (window as any).__YORI_DEFAULT_MODE__;
    });
    expect(defaultMode).toBe('demo');
    // In prod, window.__YORI_DEFAULT_MODE__ was ignored by app:
    await expect(page.locator('.app-layout')).toHaveAttribute('data-context-mode', 'live');
  });

  test('Prod rollback path /?ui=v1 dev-gates mode switch and scene switcher (P1)', async ({
    page,
  }) => {
    // 1. In prod preview, /?ui=v1 without ?dev=1 defaults to Live and does NOT render Demo switch or Scene selector
    await page.goto(`${SHIPPING_PREVIEW_URL}/?ui=v1`);
    await page.waitForSelector('.app-layout');

    const appLayout = page.locator('.app-layout');
    await expect(appLayout).toHaveAttribute('data-context-mode', 'live');

    // Mode switch group and #btn-mode-demo must NOT be rendered
    await expect(page.locator('#btn-mode-demo')).toHaveCount(0);
    await expect(page.locator('#scene-select')).toHaveCount(0);

    // Live runtime badge is rendered instead
    await expect(page.locator('#pill-live-runtime')).toBeVisible();
    await expect(page.locator('#chip-live-context')).toBeVisible();

    // Body does NOT contain fixture text
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('Piano lesson');
    expect(bodyText).not.toContain('Piano Studio');

    // 2. In prod preview with ?ui=v1&dev=1, demo mode is unlocked with simulated indicators
    await page.goto(`${SHIPPING_PREVIEW_URL}/?ui=v1&dev=1`);
    await page.waitForSelector('.app-layout');

    await expect(appLayout).toHaveAttribute('data-context-mode', 'demo');
    await expect(page.locator('#btn-mode-demo')).toBeVisible();
    await expect(page.locator('#scene-select')).toBeVisible();

    const devBodyText = await page.locator('body').innerText();
    expect(devBodyText).toContain('Piano lesson');
  });

  test('Prod build honours ?dev=1 and renders Demo mode with SIMULATED labels (Label audit)', async ({
    page,
  }) => {
    // Navigating with ?dev=1 in production preview unlocks demo mode
    await page.goto(`${SHIPPING_PREVIEW_URL}/?dev=1`);
    await page.waitForSelector('.app-layout');

    // Context mode is demo
    const appLayout = page.locator('.app-layout');
    await expect(appLayout).toHaveAttribute('data-context-mode', 'demo');

    // Living header chip displays 'simulated'
    const headerChip = page.locator('#living-header-chip');
    await expect(headerChip).toBeVisible();
    await expect(headerChip).toHaveText('simulated');

    // Demo timeline status pill displays simulated text
    const pill = page.locator('#pill-context-status');
    await expect(pill).toBeVisible();
    await expect(pill).toContainText('Demo timeline · simulated time');

    // Thorough label audit: every single visible fixture render carries an explicit simulated label
    await assertAllVisibleFixturesAreLabelled(page);

    // HABIT-LEARN addendum 2: the pill opens Settings > Connectors (no Sources sheet). The page it
    // opens still claims nothing live in Demo.
    await pill.click();
    await expect(page.locator('#connectors-page')).toBeVisible();
    await expect(page.locator('.sources-modal-card')).toHaveCount(0);
    await assertAllVisibleFixturesAreLabelled(page);
  });

  test('Label audit: Live mode has exactly 0 unlabelled simulated renders and 0 fixture elements', async ({
    page,
  }) => {
    await page.goto(`${SHIPPING_PREVIEW_URL}/`);
    await page.waitForSelector('.app-layout');

    // Verify 0 elements have data-provenance="fixture"
    await expect(page.locator('[data-provenance="fixture"]')).toHaveCount(0);

    // Verify 0 simulated badges exist anywhere
    await expect(page.locator('.simulated-badge')).toHaveCount(0);

    // HABIT-LEARN addendum 2: the pill opens Settings > Connectors (no Sources sheet); that page
    // has zero fixture provenance and zero simulated badges in Live.
    const pill = page.locator('#pill-context-status');
    await expect(pill).toBeVisible();
    await pill.click();
    await expect(page.locator('#connectors-page')).toBeVisible();
    await expect(page.locator('.sources-modal-card')).toHaveCount(0);
    await expect(page.locator('#connectors-page [data-provenance="fixture"]')).toHaveCount(0);
    await expect(page.locator('#connectors-page .simulated-badge')).toHaveCount(0);
  });

  test('Dev/test build on port 4173 honours mode overrides and supports ?dev=1, ?mode=demo, and ?mode=live', async ({
    page,
  }) => {
    // Port 4173 is the dev/test build
    // Case 1: With ?dev=1 -> unlocks demo mode and passes label audit
    await page.goto(`${TEST_BUILD_URL}/?dev=1`);
    await page.waitForSelector('.app-layout');
    await expect(page.locator('.app-layout')).toHaveAttribute('data-context-mode', 'demo');
    await expect(page.locator('#living-header-chip')).toHaveText('simulated');
    await assertAllVisibleFixturesAreLabelled(page);

    // Case 2: With ?mode=demo
    await page.goto(`${TEST_BUILD_URL}/?mode=demo`);
    await page.waitForSelector('.app-layout');
    await expect(page.locator('.app-layout')).toHaveAttribute('data-context-mode', 'demo');
    await expect(page.locator('#living-header-chip')).toHaveText('simulated');

    // Case 3: With ?mode=live
    await page.goto(`${TEST_BUILD_URL}/?mode=live`);
    await page.waitForSelector('.app-layout');
    await expect(page.locator('.app-layout')).toHaveAttribute('data-context-mode', 'live');
    await expect(page.locator('#living-header-chip')).toHaveText('live');
  });

  test('D2 shipping default-on trio: zero provider data requests before consent and after Deny; Connectors says weather follows your location', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const dataRequests = await routeDefaultOnTrio(page);
    await page.goto(SHIPPING_PREVIEW_URL);
    await page.waitForSelector('.app-layout[data-context-mode="live"]');
    await expect(page.locator('#btn-request-location')).toBeVisible();
    // UI-QUIET-PRECISION defect (b): after Deny there is no fix, so the header names it.
    await expect(page.locator('#living-header-line')).toContainText('Weather needs location');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(500);
    expect(dataRequests, 'no provider data request before location consent').toEqual([]);

    await page.locator('#btn-header-avatar').click();
    await page.locator('#btn-me-connectors').click();
    await expect(page.locator('#connector-detail-weather')).toHaveText(
      'Open-Meteo · follows your shared location (rounded ~100 m)'
    );
    await page.goto(SHIPPING_PREVIEW_URL);
    await page.waitForSelector('.app-layout[data-context-mode="live"]');

    await page.locator('#btn-deny-location').click();
    await expect(page.locator('.v2-location-notice-banner.denied')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(500);
    expect(dataRequests, 'no provider data request after Deny').toEqual([]);
  });
});

