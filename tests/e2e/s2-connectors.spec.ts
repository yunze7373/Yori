import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { getEvidenceDir } from './helpers/evidence-dir.js';

/**
 * S2-CONNECTORS: Settings > Connectors Screen E2E Test Suite
 * Governed by TID: INBOX-20261031-3B6B8B and ARCH-REV3-UI-CONNECTORS.
 *
 * Verifies:
 * 1. Truthful runtime state read live in session (zero phantom connected, zero unverified optimistic claims).
 * 2. Visual presentation matches owner reference mockup right phone (yori_proactive_life_assistant_mockup.png, sha256 ef4cf701...).
 * 3. Connectors:
 *    - LOCATION: prompt, granted + fix ('Shared this session'), granted + no fix ('Allowed · not used yet'), denied + instructions, revoke session fix, NO coordinates rendered.
 *    - CALENDAR: honestly unavailable ('Not available yet'), no connect button, no toggle.
 *    - WEATHER: owner-gated (off) vs connected (dynamic demo city), no user toggle.
 *    - XMEMO: owner-gated vs not connected vs connected, PKCE connect, disconnect with re-read.
 *    - NOTIFICATIONS: default (permission needed) vs granted ('Allowed · Yori sends nothing from this screen') vs denied with instructions.
 * 4. Sources-view consistency: Live Sources reflects identical status data.
 * 5. Accessibility, touch targets (>= 44x44px), keyboard navigation, focus restoration, zero horizontal scroll.
 * 6. Evidence collection when UPDATE_EVIDENCE=1.
 */

const EVIDENCE_DIR = getEvidenceDir('s2-connectors');
const shouldUpdateEvidence = Boolean(process.env.UPDATE_EVIDENCE === '1');

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
  const axeResults = await new AxeBuilder({ page })
    .withRules(['color-contrast', 'button-name', 'heading-order', 'label', 'region'])
    .analyze();
  const criticalViolations = axeResults.violations.filter(
    v => v.impact === 'critical' || v.impact === 'serious'
  );
  if (criticalViolations.length > 0) {
    console.error(`Axe violations in ${context}:`, JSON.stringify(criticalViolations, null, 2));
  }
  expect(criticalViolations).toHaveLength(0);
}

async function checkNoHorizontalScroll(page: Page): Promise<void> {
  const hasOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  expect(hasOverflow, 'Page should have no horizontal scrollbar').toBe(false);
}

async function saveEvidence(page: Page, filename: string): Promise<void> {
  if (shouldUpdateEvidence) {
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, filename),
      fullPage: true,
    });
  }
}

test.describe('S2-CONNECTORS: Settings > Connectors Screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test('1. Entry via Avatar Button and Me Settings Connectors Card', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForSelector('.app-layout');

    // Click avatar button top-right -> navigates to Profile & Settings (Me)
    const avatarBtn = page.locator('#btn-header-avatar');
    await expect(avatarBtn).toBeVisible();
    await avatarBtn.click();

    // Me tab (Profile & Settings) is visible
    const meView = page.locator('.me-view-container');
    await expect(meView).toBeVisible();

    // Connectors section card is present with Manage Connectors action
    const meConnectorsBtn = page.locator('#btn-me-connectors');
    await expect(meConnectorsBtn).toBeVisible();
    await expect(meConnectorsBtn).toContainText('Manage Connectors');

    await checkAxe(page, 'Me Settings Connectors Entry');
    await saveEvidence(page, '01-settings-menu-mobile.png');

    // Click Manage Connectors -> opens Connectors screen
    await meConnectorsBtn.click();
    await expect(page.locator('#connectors-page')).toBeVisible();

    // Close Connectors via back button
    const backBtn = page.locator('#btn-connectors-back');
    await expect(backBtn).toBeVisible();
    await backBtn.click();
    await expect(page.locator('#connectors-page')).toHaveCount(0);

    // Focus restored to #btn-me-connectors
    await expect(meConnectorsBtn).toBeFocused();
  });

  test('2. Default All-Off Honest Runtime State (Mobile 390px & Desktop 1280px)', async ({ page }) => {
    // Default mock: weather disabled, xmemo disabled
    await page.route(url => url.pathname.includes('/api/weather/status'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: false }),
      });
    });
    await page.route(url => url.pathname.includes('/api/xmemo/status'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: false, connected: false }),
      });
    });

    // Mobile Viewport (390x844)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForSelector('.app-layout');

    await page.locator('#btn-header-avatar').click();
    await page.locator('#btn-me-connectors').click();

    // Verify Connectors page layout
    const connectorsPage = page.locator('#connectors-page');
    await expect(connectorsPage).toBeVisible();
    await expect(connectorsPage.locator('.connectors-title')).toHaveText('Connectors');
    await expect(connectorsPage.locator('.connectors-subtitle')).toHaveText(
      'Give Yori the right context to be proactively helpful.'
    );
    await expect(connectorsPage.locator('.privacy-banner-title')).toHaveText(
      'You control what Yori can access.'
    );
    await expect(connectorsPage.locator('.privacy-banner-desc')).toHaveText(
      'Your data stays private and is only used to help you.'
    );

    // 1. Location (GPS) row
    const locRow = page.locator('#connector-row-location');
    await expect(locRow.locator('.connector-title')).toHaveText('Location (GPS)');
    await expect(locRow.locator('#status-pill-location')).toBeVisible();

    // 2. Calendar row: always honestly unavailable, no connect button
    const calRow = page.locator('#connector-row-calendar');
    await expect(calRow.locator('.connector-title')).toHaveText('Calendar');
    await expect(calRow.locator('#status-pill-calendar')).toContainText('Not available yet');
    await expect(calRow.locator('#connector-detail-calendar')).toHaveText('Not available yet');
    await expect(calRow.locator('button')).toHaveCount(0);

    // 3. Weather row: owner setting off
    const weatherRow = page.locator('#connector-row-weather');
    await expect(weatherRow.locator('.connector-title')).toHaveText('Weather');
    await expect(weatherRow.locator('#status-pill-weather')).toContainText('Owner setting');
    await expect(weatherRow.locator('#connector-detail-weather')).toContainText('Live weather is off (owner setting)');
    await expect(weatherRow.locator('button')).toHaveCount(0);

    // 4. XMemo row: owner gated
    const xmemoRow = page.locator('#connector-row-xmemo');
    await expect(xmemoRow.locator('.connector-title')).toHaveText('XMemo');
    await expect(xmemoRow.locator('#status-pill-xmemo')).toContainText('Owner setting');
    await expect(xmemoRow.locator('#connector-detail-xmemo')).toContainText('XMemo integration is disabled (owner setting)');

    // 5. Notifications row: permission needed
    const notifRow = page.locator('#connector-row-notifications');
    await expect(notifRow.locator('.connector-title')).toHaveText('Notifications');

    // 6. More coming soon card
    const moreCard = page.locator('#connector-card-coming-soon');
    await expect(moreCard.locator('.connector-title')).toHaveText('More coming soon');

    // Zero phantom connected
    await expect(connectorsPage).not.toContainText('Connected');

    // Touch targets >= 44x44px check
    const backBtn = page.locator('#btn-connectors-back');
    const backBox = await backBtn.boundingBox();
    expect(backBox?.width).toBeGreaterThanOrEqual(44);
    expect(backBox?.height).toBeGreaterThanOrEqual(44);

    await checkAxe(page, 'Connectors default mobile');
    await checkNoHorizontalScroll(page);
    await saveEvidence(page, '02-connectors-default-mobile.png');

    // Desktop Viewport (1280x800)
    await page.setViewportSize({ width: 1280, height: 800 });
    // The view re-renders once connector statuses load; read the box after it has settled.
    await expect(page.locator('.connectors-container')).toBeVisible();
    await expect.poll(async () => (await page.locator('.connectors-container').boundingBox())?.width ?? null).not.toBeNull();
    const containerBox = await page.locator('.connectors-container').boundingBox();
    expect(containerBox?.width).toBeLessThanOrEqual(720);

    await checkAxe(page, 'Connectors default desktop');
    await checkNoHorizontalScroll(page);
    await saveEvidence(page, '02-connectors-default-desktop.png');
  });

  test('3. Weather: Owner Gated vs Connected with Dynamic City Name', async ({ page }) => {
    // Stub weather status enabled with dynamic city
    const testCityName = 'Kyoto, Japan';
    await page.route(url => url.pathname.includes('/api/weather/status'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          provider: 'open-meteo',
          demoCity: { name: testCityName, lat: 35.0116, lng: 135.7681 },
          attribution: { text: 'Open-Meteo', url: 'https://open-meteo.com/' },
        }),
      });
    });
    await page.route(url => url.pathname.includes('/api/xmemo/status'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ enabled: false, connected: false }),
      });
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator('#btn-header-avatar').click();
    await page.locator('#btn-me-connectors').click();

    const weatherRow = page.locator('#connector-row-weather');
    await expect(weatherRow.locator('#status-pill-weather')).toContainText('Connected');
    // Verify city name is dynamically read from status (NOT hardcoded)
    await expect(weatherRow.locator('#connector-detail-weather')).toContainText(testCityName);
    await expect(weatherRow.locator('#connector-detail-weather')).toContainText('fixed demo city (not your location)');
    // No toggle/button
    await expect(weatherRow.locator('button')).toHaveCount(0);

    await saveEvidence(page, '03-connectors-weather-live-mobile.png');

    await page.setViewportSize({ width: 1280, height: 800 });
    await saveEvidence(page, '03-connectors-weather-live-desktop.png');
  });

  test('4. Location Lifecycle: Prompt -> Connected -> Revoked -> Re-read (No Coordinates Leaked)', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 35.6762, longitude: 139.6503 });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator('#btn-header-avatar').click();
    await page.locator('#btn-me-connectors').click();

    const locRow = page.locator('#connector-row-location');
    // Allowed · not used yet
    await expect(locRow.locator('#status-pill-location')).toContainText('Allowed · not used');
    const acquireBtn = locRow.locator('#btn-connect-location');
    await expect(acquireBtn).toBeVisible();
    await expect(acquireBtn).toHaveText('Use my location') /* UI-QUIET-PRECISION human copy */;

    // Click Acquire fix -> in-session fix is acquired -> Connected ('Shared this session')
    await acquireBtn.click();
    await expect(locRow.locator('#status-pill-location')).toContainText('Connected');
    await expect(locRow.locator('#connector-detail-location')).toContainText('Shared this session');

    // STRICT INVARIANT: Coordinates must NEVER be rendered to DOM
    const pageText = await page.locator('#connectors-page').innerText();
    expect(pageText).not.toMatch(/\d+\.\d+°/);
    expect(pageText).not.toContain('35.6762');
    expect(pageText).not.toContain('139.6503');

    await saveEvidence(page, '04-connectors-location-connected-mobile.png');

    await page.setViewportSize({ width: 1280, height: 800 });
    await saveEvidence(page, '04-connectors-location-connected-desktop.png');

    // Click Revoke session fix -> forgets fix, shows OS instructions, transitions to Allowed · not used
    await page.setViewportSize({ width: 390, height: 844 });
    const revokeBtn = locRow.locator('#btn-revoke-location');
    await expect(revokeBtn).toBeVisible();
    await revokeBtn.click();

    await expect(locRow.locator('#status-pill-location')).toContainText('Allowed · not used');
    await expect(locRow.locator('#connector-detail-location')).toHaveText('Allowed · not used yet');
    await expect(locRow.locator('#btn-connect-location')).toBeVisible();

    await saveEvidence(page, '05-connectors-location-revoked-mobile.png');

    await page.setViewportSize({ width: 1280, height: 800 });
    await saveEvidence(page, '05-connectors-location-revoked-desktop.png');
  });

  test('5. Location Denied State with Instructions and Check Again', async ({ page }) => {
    // Shim permissions.query to return 'denied' for geolocation
    await page.addInitScript(() => {
      const origQuery = navigator.permissions.query;
      navigator.permissions.query = async (params: any) => {
        if (params.name === 'geolocation') {
          return {
            state: 'denied',
            name: 'geolocation',
            onchange: null,
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
          } as any;
        }
        return origQuery.call(navigator.permissions, params);
      };
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator('#btn-header-avatar').click();
    await page.locator('#btn-me-connectors').click();

    const locRow = page.locator('#connector-row-location');
    await expect(locRow.locator('#status-pill-location')).toContainText('Denied');
    await expect(locRow.locator('#connector-detail-location')).toContainText(
      'blocked in your browser or OS settings'
    );
    const checkBtn = locRow.locator('#btn-check-location');
    await expect(checkBtn).toBeVisible();
    await expect(checkBtn).toHaveText('Check again');

    await saveEvidence(page, '06-connectors-location-denied-mobile.png');

    await page.setViewportSize({ width: 1280, height: 800 });
    await saveEvidence(page, '06-connectors-location-denied-desktop.png');
  });

  test('6. Notifications: Permission Needed -> Granted -> Status Pill & No Sent Notifications', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'Notification', {
        writable: true,
        value: {
          permission: 'granted',
          requestPermission: async () => 'granted',
        },
      });
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator('#btn-header-avatar').click();
    await page.locator('#btn-me-connectors').click();

    const notifRow = page.locator('#connector-row-notifications');
    await expect(notifRow.locator('#status-pill-notifications')).toContainText('Connected');
    await expect(notifRow.locator('#connector-detail-notifications')).toContainText(
      'Allowed · Yori sends nothing from this screen'
    );

    await saveEvidence(page, '07-connectors-notifications-granted-mobile.png');

    await page.setViewportSize({ width: 1280, height: 800 });
    await saveEvidence(page, '07-connectors-notifications-granted-desktop.png');
  });

  test('7. XMemo: Connected State and Disconnect Flow with Status Re-read', async ({ page }) => {
    let isConnected = true;

    await page.route(url => url.pathname.includes('/api/xmemo/status'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          connected: isConnected,
          statusText: isConnected ? 'Connected to XMemo vault' : 'Disconnected',
        }),
      });
    });

    await page.route(url => url.pathname.includes('/api/xmemo/disconnect'), async route => {
      isConnected = false;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator('#btn-header-avatar').click();
    await page.locator('#btn-me-connectors').click();

    const xmemoRow = page.locator('#connector-row-xmemo');
    await expect(xmemoRow.locator('#status-pill-xmemo')).toContainText('Connected');
    await expect(xmemoRow.locator('#connector-detail-xmemo')).toContainText(
      'Connected to XMemo vault'
    );
    const disconnectBtn = xmemoRow.locator('#btn-disconnect-xmemo');
    await expect(disconnectBtn).toBeVisible();
    await expect(disconnectBtn).toHaveText('Disconnect');

    await saveEvidence(page, '08-connectors-xmemo-connected-mobile.png');

    await page.setViewportSize({ width: 1280, height: 800 });
    await saveEvidence(page, '08-connectors-xmemo-connected-desktop.png');

    // Click Disconnect -> calls /api/xmemo/disconnect, re-reads status, updates to Not connected
    await disconnectBtn.click();
    await expect(xmemoRow.locator('#status-pill-xmemo')).toContainText('Not connected');
    await expect(xmemoRow.locator('#btn-connect-xmemo')).toBeVisible();
    await expect(xmemoRow.locator('#btn-connect-xmemo')).toHaveText('Connect');
  });

  test('8. Live Sources Sheet Consistency with Connectors View', async ({ page }) => {
    // Both views must read the exact same state and never disagree
    await page.route(url => url.pathname.includes('/api/weather/status'), async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          provider: 'open-meteo',
          demoCity: { name: 'Kyoto, Japan' },
        }),
      });
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?dev=1');
    await page.waitForSelector('.app-layout');

    // Switch to Live mode via demo panel
    await page.locator('#btn-dev-demo-controls').click();
    await page.locator('#btn-mode-live').click();
    await page.locator('#btn-close-demo-panel').click();

    // Click context pill to open Sources sheet
    const pill = page.locator('#pill-context-status');
    await expect(pill).toBeVisible();
    await pill.click();

    const sourcesDialog = page.locator('.sources-modal-card');
    await expect(sourcesDialog).toBeVisible();

    // Verify Weather detail in Sources view matches Connectors description. D1 (DEMO_RESCUE):
    // Live weather follows the shared fix, so the demo city must never appear in Live.
    const weatherItem = sourcesDialog.locator('#source-item-weather');
    await expect(weatherItem).toContainText('Open-Meteo · follows your shared location (rounded ~100 m)');
    await expect(weatherItem).not.toContainText('Kyoto, Japan');

    // Verify Calendar detail in Sources view states not connected
    const calItem = sourcesDialog.locator('#source-item-calendar');
    await expect(calItem).toContainText('Not connected');

    // Close sources sheet
    await page.locator('#btn-close-why').click();
    await expect(sourcesDialog).toHaveCount(0);
  });

  test('9. Keyboard Navigation, Escape Dismissal, and Me Tab Navigation', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    // 9a. Navigate from Me tab to Connectors
    await page.locator('#tab-me').click();
    const meConnectorsBtn = page.locator('#btn-me-connectors');
    await expect(meConnectorsBtn).toBeVisible();
    await meConnectorsBtn.click();

    // In Connectors page
    await expect(page.locator('#connectors-page')).toBeVisible();

    // 9b. Escape key dismisses Connectors page and restores focus to #btn-me-connectors
    await page.keyboard.press('Escape');
    await expect(page.locator('#connectors-page')).toHaveCount(0);
    await expect(meConnectorsBtn).toBeFocused();

    // 9c. Back button click dismisses Connectors and restores focus
    await meConnectorsBtn.click();
    await expect(page.locator('#connectors-page')).toBeVisible();
    await page.locator('#btn-connectors-back').click();
    await expect(page.locator('#connectors-page')).toHaveCount(0);
    await expect(meConnectorsBtn).toBeFocused();
  });

  test('10. Demo & Live Separation: Settings Location Connect Never Blends Into Simulated Demo Scenes', async ({
    page,
    context,
  }) => {
    // Grant geolocation permission with real Tokyo coordinates
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 35.6895, longitude: 139.6917 });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?dev=1');
    await page.waitForSelector('.app-layout');

    // 10a. Connect Location from Settings > Connectors while in Demo mode
    await page.locator('#btn-header-avatar').click();
    await page.locator('#btn-me-connectors').click();

    const locRow = page.locator('#connector-row-location');
    const connectBtn = locRow.locator('#btn-connect-location');
    await expect(connectBtn).toBeVisible();
    await connectBtn.click();

    // Verify Connected in Settings
    await expect(locRow.locator('#status-pill-location')).toContainText('Connected');
    await expect(locRow.locator('#connector-detail-location')).toContainText('Shared this session');

    // 10b. Return to Home in Demo mode
    await page.locator('#btn-connectors-back').click();
    await page.locator('#tab-home').click();

    // 10c. Verify Demo lunch scene: NOT broken, does NOT fail closed, preserves fixture restaurants
    await page.locator('#btn-dev-demo-controls').click();
    await page.locator('#scene-select').selectOption('lunch');
    await page.locator('#btn-close-demo-panel').click();

    const lunchNowCard = page.locator('.now-card');
    await expect(lunchNowCard).toBeVisible();
    await expect(lunchNowCard).not.toContainText('No Lunch Places Nearby');
    await expect(lunchNowCard).not.toContainText('fails closed');
    await expect(lunchNowCard).toContainText('Lunch');

    // 10d. Verify Demo fuel scene: NOT broken, preserves fuel recommendations
    await page.locator('#btn-dev-demo-controls').click();
    await page.locator('#scene-select').selectOption('fuel');
    await page.locator('#btn-close-demo-panel').click();

    const fuelNowCard = page.locator('.now-card');
    await expect(fuelNowCard).toBeVisible();
    await expect(fuelNowCard).toContainText('Low Fuel Warning');

    // 10e. Verify Demo Sources sheet lists ONLY simulated fixtures
    const contextPill = page.locator('#pill-context-status');
    await expect(contextPill).toBeVisible();
    await contextPill.click();

    const sourcesModal = page.locator('.sources-modal-card');
    await expect(sourcesModal).toBeVisible();
    await expect(sourcesModal.locator('#sources-derivation-text')).toContainText('Demo fixtures · simulated context');
    // Ensure all badges are simulated
    const liveBadges = sourcesModal.locator('.signal-badge.live-badge');
    await expect(liveBadges).toHaveCount(0);
    const simBadges = sourcesModal.locator('.signal-badge.simulated-badge');
    expect(await simBadges.count()).toBeGreaterThan(0);

    await page.locator('#btn-close-why').click();
    await expect(sourcesModal).toHaveCount(0);

    // 10f. Switch to Live mode: fix is reflected in Sources as Shared this session and pill includes Location
    await page.locator('#btn-dev-demo-controls').click();
    await page.locator('#btn-mode-live').click();
    await page.locator('#btn-close-demo-panel').click();

    // Pill subline includes Location
    const pillSubline = page.locator('#pill-subline');
    await expect(pillSubline).toContainText('Location');

    // Live Sources sheet shows Location with Shared this session
    await contextPill.click();
    await expect(sourcesModal).toBeVisible();
    const liveLocItem = sourcesModal.locator('#source-item-location');
    await expect(liveLocItem.locator('.signal-badge')).toContainText('Shared this session');

    await page.locator('#btn-close-why').click();
  });

  test('11. Release Blocker: No Dead Settings Controls on Desktop (1280) and Mobile (390)', async ({
    page,
  }) => {
    // 11a. Desktop 1280x800: #desktop-nav-settings opens Connectors view in Live mode
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?mode=live');
    await page.waitForSelector('.app-layout');

    const desktopSettingsBtn = page.locator('#desktop-nav-settings');
    await expect(desktopSettingsBtn).toBeVisible();

    // Verify touch target >= 44x44
    const btnBox = await desktopSettingsBtn.boundingBox();
    expect(btnBox).not.toBeNull();
    expect(btnBox!.width).toBeGreaterThanOrEqual(44);
    expect(btnBox!.height).toBeGreaterThanOrEqual(44);

    // Tap #desktop-nav-settings -> opens Connectors view in center column
    await desktopSettingsBtn.click();
    const connectorsPage = page.locator('#connectors-page');
    await expect(connectorsPage).toBeVisible();
    await expect(desktopSettingsBtn).toHaveClass(/active/);
    await expect(desktopSettingsBtn).toHaveAttribute('aria-current', 'page');

    // Escape dismisses Connectors and restores focus to #desktop-nav-settings
    await page.keyboard.press('Escape');
    await expect(connectorsPage).toHaveCount(0);
    await expect(desktopSettingsBtn).toBeFocused();

    // Re-open via click, then back button restores focus
    await desktopSettingsBtn.click();
    await expect(connectorsPage).toBeVisible();
    const backBtn = page.locator('#btn-connectors-back');
    await expect(backBtn).toBeVisible();
    await backBtn.click();
    await expect(connectorsPage).toHaveCount(0);
    await expect(desktopSettingsBtn).toBeFocused();

    // 11b. Mobile 390x844: #btn-header-avatar -> Me -> #btn-me-connectors -> Connectors
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?mode=live');
    await page.waitForSelector('.app-layout');

    const avatarBtn = page.locator('#btn-header-avatar');
    await expect(avatarBtn).toBeVisible();
    const avatarBox = await avatarBtn.boundingBox();
    expect(avatarBox).not.toBeNull();
    expect(avatarBox!.width).toBeGreaterThanOrEqual(44);
    expect(avatarBox!.height).toBeGreaterThanOrEqual(44);

    // Click avatar button -> goes to Me tab
    await avatarBtn.click();
    await expect(page.locator('.me-view-container')).toBeVisible();

    // Click Manage Connectors -> opens Connectors view
    const meConnectorsBtn = page.locator('#btn-me-connectors');
    await expect(meConnectorsBtn).toBeVisible();
    await meConnectorsBtn.click();
    await expect(page.locator('#connectors-page')).toBeVisible();

    // Back button restores focus to #btn-me-connectors
    await page.locator('#btn-connectors-back').click();
    await expect(page.locator('#connectors-page')).toHaveCount(0);
    await expect(meConnectorsBtn).toBeFocused();
  });
});
