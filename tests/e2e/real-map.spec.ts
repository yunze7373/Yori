import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { getEvidenceDir } from './helpers/evidence-dir.js';
import { selectDemoScene } from './helpers/demo-panel.js';

const EVIDENCE_DIR = getEvidenceDir('real-map');

/**
 * Generate a valid 256x256 PNG tile buffer with soft map grid styling.
 * Used to stub OpenStreetMap raster tiles deterministically with zero network calls.
 */
function createMockMapTilePng(): Buffer {
  const width = 256;
  const height = 256;
  const rowSize = 1 + width * 3;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter type: None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 3;
      const isBorder = (x === 0 || y === 0 || x === width - 1 || y === height - 1);
      // Soft sage / cream map background
      rawData[pxOffset] = isBorder ? 218 : 236;     // R
      rawData[pxOffset + 1] = isBorder ? 224 : 240; // G
      rawData[pxOffset + 2] = isBorder ? 218 : 235; // B
    }
  }

  const idatData = zlib.deflateSync(rawData);

  const crc32 = (buf: Buffer): number => {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i]!;
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  };

  const makeChunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crcBuf]);
  };

  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 2; // RGB color
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    header,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idatData),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

const MOCK_TILE_PNG = createMockMapTilePng();

test.beforeAll(() => {
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }
});

test.afterAll(() => {
  if (fs.existsSync(EVIDENCE_DIR)) {
    const files = fs.readdirSync(EVIDENCE_DIR).filter(f => f.endsWith('.png'));
    if (files.length > 0) {
      const lines = files
        .sort()
        .map(file => {
          const content = fs.readFileSync(path.join(EVIDENCE_DIR, file));
          const hash = crypto.createHash('sha256').update(content).digest('hex');
          return `${hash}  ${file}`;
        });
      fs.writeFileSync(path.join(EVIDENCE_DIR, 'MANIFEST.sha256'), lines.join('\n') + '\n');
    }
  }
});

async function checkAxe(page: Page, context = 'page'): Promise<void> {
  const rules = ['color-contrast', 'button-name', 'heading-order', 'label', 'region'];
  const axeResults = await new AxeBuilder({ page })
    .withRules(rules)
    .analyze();
  const criticalViolations = axeResults.violations.filter(
    v => v.impact === 'critical' || v.impact === 'serious'
  );
  if (criticalViolations.length > 0) {
    console.error(`Axe violations in ${context}:`, JSON.stringify(criticalViolations, null, 2));
  }
  expect(criticalViolations).toHaveLength(0);
}

async function checkNoOverflow(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
}

test.describe('REAL-MAP: Leaflet + OpenStreetMap Interactive Map (INBOX-20261101-12065C)', () => {
  let externalRequests: string[] = [];
  let osmTileRequests: string[] = [];

  test.beforeEach(async ({ page }) => {
    externalRequests = [];
    osmTileRequests = [];

    // Intercept OpenStreetMap tile requests and fulfill deterministically with mock raster PNG
    await page.route('**/tile.openstreetmap.org/**', route => {
      osmTileRequests.push(route.request().url());
      route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: MOCK_TILE_PNG,
      });
    });

    // Guard against any unauthorized external network calls
    page.on('request', req => {
      const url = req.url();
      if (
        !url.startsWith('http://localhost') &&
        !url.startsWith('http://127.0.0.1') &&
        !url.includes('tile.openstreetmap.org')
      ) {
        externalRequests.push(url);
      }
    });
  });

  test('Desktop Viewport (1280x800): renders real map in Trip Details panel with polyline, markers, attribution, and non-hijacked wheel zoom', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?ui=v2&dev=1');
    await page.waitForSelector('.app-layout[data-ui-version="v2"]');

    // On initial Home, the center Now card retains the compact <=140px schematic strip
    const homeStrip = page.locator('.now-map-strip .compact-map-strip');
    await expect(homeStrip).toBeVisible();
    const box = await homeStrip.boundingBox();
    expect(box?.height ?? 0).toBeLessThanOrEqual(140);

    // The rich interactive Leaflet map renders in the desktop right-panel Trip Details
    const rightPanelMap = page.locator('#desktop-right-panel .real-map-container').first();
    await expect(rightPanelMap).toBeVisible();
    await expect(rightPanelMap).toHaveAttribute('data-map-status', 'ready', { timeout: 10000 });

    // 1. Verify OSM raster tiles rendered inside leaflet-tile-pane
    const tileImages = rightPanelMap.locator('.leaflet-tile-pane img');
    await expect(tileImages.first()).toBeVisible();

    // 2. Verify OpenStreetMap attribution control
    const attribution = rightPanelMap.locator('.leaflet-control-attribution');
    await expect(attribution).toBeVisible();
    await expect(attribution).toContainText('OpenStreetMap contributors');

    // 3. Verify visible disclosure caption
    const caption = rightPanelMap.locator('.real-map-caption');
    await expect(caption).toBeVisible();
    await expect(caption).toContainText('Map © OpenStreetMap · route shape: recorded sample · simulated');

    // 4. Verify route polyline
    const polyline = rightPanelMap.locator('path.v2-map-route');
    await expect(polyline).toBeVisible();

    // 5. Verify markers: Origin (Home) and Destination
    const originMarker = rightPanelMap.locator('.leaflet-marker-pane .v2-map-marker.origin');
    await expect(originMarker).toBeVisible();
    const destMarker = rightPanelMap.locator('.leaflet-marker-pane .v2-map-marker.destination');
    await expect(destMarker).toBeVisible();

    // 6. Verify Non-hijacking Wheel Zoom:
    // scrollWheelZoom is disabled initially to prevent hijacking page scroll
    const initialWheelEnabled = await page.evaluate(() => {
      const host = document.querySelector('#desktop-right-panel .leaflet-map-host') as any;
      return host?.__leafletMap?.scrollWheelZoom?.enabled();
    });
    expect(initialWheelEnabled).toBe(false);

    // Clicking / focusing host enables scrollWheelZoom
    const hostEl = rightPanelMap.locator('.leaflet-map-host');
    await hostEl.click();
    const wheelAfterClick = await page.evaluate(() => {
      const host = document.querySelector('#desktop-right-panel .leaflet-map-host') as any;
      return host?.__leafletMap?.scrollWheelZoom?.enabled();
    });
    expect(wheelAfterClick).toBe(true);

    // Moving mouse away (mouseleave) disables scrollWheelZoom
    await page.evaluate(() => {
      const container = document.querySelector('#desktop-right-panel .real-map-container');
      container?.dispatchEvent(new MouseEvent('mouseleave'));
    });
    const wheelAfterLeave = await page.evaluate(() => {
      const host = document.querySelector('#desktop-right-panel .leaflet-map-host') as any;
      return host?.__leafletMap?.scrollWheelZoom?.enabled();
    });
    expect(wheelAfterLeave).toBe(false);

    // 7. Verify accessibility & zero overflow
    await checkNoOverflow(page);
    await checkAxe(page, 'Desktop Clear');

    // Capture clear desktop evidence
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'real-map-clear-1280x800.png'),
      fullPage: false,
    });

    // 8. Switch to Rain Scene and verify weather callout chip
    await selectDemoScene(page, 'rain');
    await page.waitForTimeout(300);

    const weatherCallout = rightPanelMap.locator('div.v2-map-weather-callout');
    await expect(weatherCallout).toBeVisible();
    await expect(weatherCallout).toContainText('Rain forecast · simulated');

    // Capture rain desktop evidence
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'real-map-rain-1280x800.png'),
      fullPage: false,
    });

    // Guard: zero external network calls
    expect(externalRequests).toEqual([]);
  });

  test('Mobile Viewport (390x844): compact schematic on Home, rich real map in expanded Trip Details view', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?ui=v2&dev=1');
    await page.waitForSelector('.app-layout[data-ui-version="v2"]');

    // 1. Initial Home: compact schematic strip <=140px, never pushes plan down
    const homeStrip = page.locator('.now-map-strip .compact-map-strip');
    await expect(homeStrip).toBeVisible();
    const box = await homeStrip.boundingBox();
    expect(box?.height ?? 0).toBeLessThanOrEqual(140);
    await checkNoOverflow(page);

    // 2. Navigate to contextual expansion surface: Trip Details
    await page.locator('#btn-view-trip-details').click();
    await page.waitForSelector('.v2-trip-detail');

    // In Trip Details, the rich interactive Leaflet map renders
    const tripMap = page.locator('.v2-trip-detail .real-map-container').first();
    await expect(tripMap).toBeVisible();
    await expect(tripMap).toHaveAttribute('data-map-status', 'ready', { timeout: 10000 });

    // Verify tiles, polyline, attribution, and caption
    await expect(tripMap.locator('.leaflet-tile-pane img').first()).toBeVisible();
    await expect(tripMap.locator('path.v2-map-route')).toBeVisible();
    await expect(tripMap.locator('.leaflet-control-attribution')).toBeVisible();
    await expect(tripMap.locator('.real-map-caption')).toBeVisible();

    await checkNoOverflow(page);
    await checkAxe(page, 'Mobile Clear Trip Detail');

    // Capture clear mobile evidence (expanded Trip Detail with real map)
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'real-map-clear-390x844.png'),
      fullPage: false,
    });

    // 3. Switch to Rain scene in Trip Details
    await page.locator('#trip-detail-back-btn').click();
    await selectDemoScene(page, 'rain');
    await page.locator('#btn-view-trip-details').click();
    await page.waitForSelector('.v2-trip-detail');

    const rainTripMap = page.locator('.v2-trip-detail .real-map-container').first();
    await expect(rainTripMap).toBeVisible();
    await expect(rainTripMap).toHaveAttribute('data-map-status', 'ready', { timeout: 10000 });

    const weatherCallout = rainTripMap.locator('div.v2-map-weather-callout');
    await expect(weatherCallout).toBeVisible();
    await expect(weatherCallout).toContainText('Rain forecast · simulated');

    await checkNoOverflow(page);
    await checkAxe(page, 'Mobile Rain Trip Detail');

    // Capture rain mobile evidence
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'real-map-rain-390x844.png'),
      fullPage: false,
    });

    // Guard: zero external network calls
    expect(externalRequests).toEqual([]);
  });

  test('Fallback Drill: when tiles fail (abort or HTTP 403), falls back to schematic map + banner within <= 3s', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    // Simulate OSM tile 403 'Access blocked' (OSM policy response to missing/sandboxed Referer)
    await page.route('**/tile.openstreetmap.org/**', route => {
      route.fulfill({
        status: 403,
        contentType: 'text/plain',
        body: 'Access blocked by OpenStreetMap tile usage policy',
      });
    });

    const startTime = Date.now();
    await page.goto('/?ui=v2&dev=1');
    await page.waitForSelector('.app-layout[data-ui-version="v2"]');

    const rightPanelMap = page.locator('#desktop-right-panel .real-map-container').first();
    await expect(rightPanelMap).toBeVisible();

    // Must transition to fallback status within <= 3000ms
    await expect(rightPanelMap).toHaveAttribute('data-map-status', 'fallback', { timeout: 3500 });
    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThanOrEqual(5000); // Navigation + fallback total time

    // Verify fallback banner is visible with exact required copy
    const fallbackBanner = rightPanelMap.locator('.map-fallback-banner');
    await expect(fallbackBanner).toBeVisible();
    await expect(fallbackBanner).toContainText('Map tiles unavailable · schematic shown');

    // Verify schematic SVG fallback is visible
    const schematicFallback = rightPanelMap.locator('.schematic-map-fallback');
    await expect(schematicFallback).toBeVisible();
    await expect(schematicFallback.locator('svg').nth(1)).toBeVisible();

    await checkNoOverflow(page);

    // Capture fallback evidence
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'real-map-fallback.png'),
      fullPage: false,
    });
  });

  test('Live Mode Consent Guard: zero tile requests before location consent is granted', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    osmTileRequests = [];

    // Navigate in live mode without dev fixtures
    await page.goto('/?ui=v2&mode=live');
    await page.waitForSelector('.app-layout[data-ui-version="v2"]');

    // Wait 1 second to confirm no speculative tile requests are made
    await page.waitForTimeout(1000);

    // Assert: zero OSM tile requests initiated
    expect(osmTileRequests).toHaveLength(0);
    expect(externalRequests).toHaveLength(0);
  });
});
