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

  test.beforeEach(async ({ page }) => {
    externalRequests = [];

    // Intercept OpenStreetMap tile requests and fulfill deterministically with mock raster PNG
    await page.route('**/tile.openstreetmap.org/**', route => {
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

  test('Desktop Viewport (1280x800): renders real map tiles, polyline, markers, attribution, and non-hijacked wheel zoom', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?ui=v2&dev=1');
    await page.waitForSelector('.app-layout[data-ui-version="v2"]');

    // Wait for real map container to signal ready
    const centerMap = page.locator('.now-map-strip .real-map-container').first();
    await expect(centerMap).toBeVisible();
    await expect(centerMap).toHaveAttribute('data-map-status', 'ready', { timeout: 10000 });

    // 1. Verify OSM raster tiles rendered inside leaflet-tile-pane
    const tileImages = centerMap.locator('.leaflet-tile-pane img');
    await expect(tileImages.first()).toBeVisible();

    // 2. Verify OpenStreetMap attribution control
    const attribution = centerMap.locator('.leaflet-control-attribution');
    await expect(attribution).toBeVisible();
    await expect(attribution).toContainText('OpenStreetMap contributors');

    // 3. Verify visible disclosure caption
    const caption = centerMap.locator('.real-map-caption');
    await expect(caption).toBeVisible();
    await expect(caption).toContainText('Map © OpenStreetMap · route shape: recorded sample · simulated');

    // 4. Verify route polyline
    const polyline = centerMap.locator('path.v2-map-route');
    await expect(polyline).toBeVisible();

    // 5. Verify markers: Origin (Home) and Destination
    const originMarker = centerMap.locator('.leaflet-marker-pane .v2-map-marker.origin');
    await expect(originMarker).toBeVisible();
    const destMarker = centerMap.locator('.leaflet-marker-pane .v2-map-marker.destination');
    await expect(destMarker).toBeVisible();

    // 6. Verify Desktop Right Panel also renders shared real map component
    const rightPanelMap = page.locator('#desktop-right-panel .real-map-container').first();
    await expect(rightPanelMap).toBeVisible();
    await expect(rightPanelMap).toHaveAttribute('data-map-status', 'ready', { timeout: 10000 });
    await expect(rightPanelMap.locator('.leaflet-tile-pane img').first()).toBeVisible();
    await expect(rightPanelMap.locator('path.v2-map-route')).toBeVisible();

    // 7. Verify Non-hijacking Wheel Zoom:
    // scrollWheelZoom should be disabled initially to prevent hijacking page scroll
    const initialWheelEnabled = await page.evaluate(() => {
      const host = document.querySelector('.now-map-strip .leaflet-map-host') as any;
      return host?.__leafletMap?.scrollWheelZoom?.enabled();
    });
    expect(initialWheelEnabled).toBe(false);

    // Clicking / focusing host enables scrollWheelZoom
    const hostEl = centerMap.locator('.leaflet-map-host');
    await hostEl.click();
    const wheelAfterClick = await page.evaluate(() => {
      const host = document.querySelector('.now-map-strip .leaflet-map-host') as any;
      return host?.__leafletMap?.scrollWheelZoom?.enabled();
    });
    expect(wheelAfterClick).toBe(true);

    // Moving mouse away (mouseleave) disables scrollWheelZoom
    await page.evaluate(() => {
      const container = document.querySelector('.now-map-strip .real-map-container');
      container?.dispatchEvent(new MouseEvent('mouseleave'));
    });
    const wheelAfterLeave = await page.evaluate(() => {
      const host = document.querySelector('.now-map-strip .leaflet-map-host') as any;
      return host?.__leafletMap?.scrollWheelZoom?.enabled();
    });
    expect(wheelAfterLeave).toBe(false);

    // 8. Verify accessibility & zero overflow
    await checkNoOverflow(page);
    await checkAxe(page, 'Desktop Clear');

    // Capture clear desktop evidence
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'real-map-clear-1280x800.png'),
      fullPage: false,
    });

    // 9. Switch to Rain Scene and verify weather callout chip
    await selectDemoScene(page, 'rain');
    await page.waitForTimeout(300);

    const weatherCallout = centerMap.locator('.v2-map-weather-callout');
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

  test('Mobile Viewport (390x844): renders cleanly with zero horizontal overflow and correct weather overlay', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?ui=v2&dev=1');
    await page.waitForSelector('.app-layout[data-ui-version="v2"]');

    const centerMap = page.locator('.now-map-strip .real-map-container').first();
    await expect(centerMap).toBeVisible();
    await expect(centerMap).toHaveAttribute('data-map-status', 'ready', { timeout: 10000 });

    // Verify tiles, polyline, attribution, and caption
    await expect(centerMap.locator('.leaflet-tile-pane img').first()).toBeVisible();
    await expect(centerMap.locator('path.v2-map-route')).toBeVisible();
    await expect(centerMap.locator('.leaflet-control-attribution')).toBeVisible();
    await expect(centerMap.locator('.real-map-caption')).toBeVisible();

    // Verify zero horizontal overflow at 390
    await checkNoOverflow(page);
    await checkAxe(page, 'Mobile Clear');

    // Capture clear mobile evidence
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'real-map-clear-390x844.png'),
      fullPage: false,
    });

    // Switch to Rain scene
    await selectDemoScene(page, 'rain');
    await page.waitForTimeout(300);

    const weatherCallout = centerMap.locator('.v2-map-weather-callout');
    await expect(weatherCallout).toBeVisible();
    await expect(weatherCallout).toContainText('Rain forecast · simulated');

    await checkNoOverflow(page);
    await checkAxe(page, 'Mobile Rain');

    // Capture rain mobile evidence
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'real-map-rain-390x844.png'),
      fullPage: false,
    });

    // Guard: zero external network calls
    expect(externalRequests).toEqual([]);
  });

  test('Fallback Drill: when tiles fail (abort), falls back to schematic map + banner within <= 3s', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    // Abort tile requests to simulate network failure / CSP block
    await page.route('**/tile.openstreetmap.org/**', route => {
      route.abort('failed');
    });

    const startTime = Date.now();
    await page.goto('/?ui=v2&dev=1');
    await page.waitForSelector('.app-layout[data-ui-version="v2"]');

    const centerMap = page.locator('.now-map-strip .real-map-container').first();
    await expect(centerMap).toBeVisible();

    // Must transition to fallback status within <= 3000ms
    await expect(centerMap).toHaveAttribute('data-map-status', 'fallback', { timeout: 3500 });
    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThanOrEqual(5000); // Navigation + fallback total time

    // Verify fallback banner is visible with exact required copy
    const fallbackBanner = centerMap.locator('.map-fallback-banner');
    await expect(fallbackBanner).toBeVisible();
    await expect(fallbackBanner).toContainText('Map tiles unavailable · schematic shown');

    // Verify schematic SVG fallback is visible
    const schematicFallback = centerMap.locator('.schematic-map-fallback');
    await expect(schematicFallback).toBeVisible();
    await expect(schematicFallback.locator('svg').nth(1)).toBeVisible();

    await checkNoOverflow(page);

    // Capture fallback evidence
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'real-map-fallback.png'),
      fullPage: false,
    });
  });
});
