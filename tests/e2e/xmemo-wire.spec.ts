/**
 * Playwright E2E Tests for XMemo Composite MemoryPort Wiring (XMEMO-PORT-WIRE)
 * Governed by INBOX-20261031-E69766, Architecture Rev3 Section 9.2, and AC-203-2 (HB-3).
 *
 * Verifies:
 * 1. Flag Off:
 *    - /api/xmemo/status reports enabled=false, connected=false.
 *    - Zero /api/xmemo data calls beyond status.
 *    - Me-tab shows local-only storage, XMemo affordance absent.
 * 2. Connected-Mock:
 *    - /api/xmemo/status reports enabled=true, connected=true.
 *    - /api/xmemo/preferences returns confirmed mock fact.
 *    - Merged fact appears on Me-tab with truthful provenance ("Source: synced from XMemo").
 *    - Status shows truthful connected state.
 * 3. 5xx Error Fallback:
 *    - /api/xmemo/preferences returns HTTP 500.
 *    - Silent fallback to local storage without UX disruption.
 *    - Me-tab reflects "Fallback (local only)" status truthfully.
 * 4. Client Security & Invariant Assertions:
 *    - Zero network calls to xmemo.dev from the client.
 *    - Zero Authorization headers dispatched from the client.
 * 5. Captures visual screenshots under test-results/evidence/xmemo-wire/
 *    (mirrored to docs/evidence/xmemo-wire/ if UPDATE_EVIDENCE=1).
 */

import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const TEST_RESULTS_DIR = path.resolve(process.cwd(), 'test-results/evidence/xmemo-wire');
const DOCS_EVIDENCE_DIR = path.resolve(process.cwd(), 'docs/evidence/xmemo-wire');

test.beforeAll(() => {
  if (!fs.existsSync(TEST_RESULTS_DIR)) {
    fs.mkdirSync(TEST_RESULTS_DIR, { recursive: true });
  }
  if (process.env.UPDATE_EVIDENCE === '1' && !fs.existsSync(DOCS_EVIDENCE_DIR)) {
    fs.mkdirSync(DOCS_EVIDENCE_DIR, { recursive: true });
  }
});

async function saveScreenshot(page: any, filename: string) {
  const resultPath = path.join(TEST_RESULTS_DIR, filename);
  await page.screenshot({ path: resultPath, fullPage: true });

  if (process.env.UPDATE_EVIDENCE === '1') {
    const docsPath = path.join(DOCS_EVIDENCE_DIR, filename);
    fs.copyFileSync(resultPath, docsPath);
  }
}

async function goToMeTab(page: any, isMobile: boolean) {
  if (isMobile) {
    await page.locator('#tab-me').click();
  } else {
    await page.locator('#desktop-nav-me').click();
  }
  await expect(page.locator('.me-view-container')).toBeVisible();
}

test.describe('XMEMO-PORT-WIRE: Local-First Composite MemoryPort Verification', () => {
  test('Scenario 1 (Flag off): Zero data calls beyond status; local-only UI', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    const dispatchedDataCalls: string[] = [];
    const clientAuthorizationHeaders: string[] = [];
    const externalHosts: string[] = [];

    // Intercept all requests to track calls and headers
    await page.route('**/*', async (route, request) => {
      const url = new URL(request.url());
      if (url.host.includes('xmemo.dev')) {
        externalHosts.push(url.host);
      }

      const authHeader = request.headers()['authorization'];
      if (authHeader) {
        clientAuthorizationHeaders.push(authHeader);
      }

      if (url.pathname === '/api/xmemo/status') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ enabled: false, connected: false }),
        });
        return;
      }

      if (url.pathname.startsWith('/api/xmemo/')) {
        dispatchedDataCalls.push(url.pathname);
      }

      await route.continue();
    });

    await page.goto('/?ui=v1');
    await goToMeTab(page, isMobile);

    // Assert: zero data calls beyond status
    expect(dispatchedDataCalls).toHaveLength(0);

    // Assert: zero requests to xmemo.dev
    expect(externalHosts).toHaveLength(0);

    // Assert: zero client authorization headers
    expect(clientAuthorizationHeaders).toHaveLength(0);

    // Assert: XMemo affordance is absent when flag is off
    await expect(page.locator('#me-xmemo-title')).toHaveCount(0);
    await expect(page.locator('#confirmed-facts-list')).toBeVisible();

    // Visual screenshot evidence
    await saveScreenshot(page, `xmemo-wire-off-${viewName}.png`);
  });

  test('Scenario 2 (Connected-mock): Merged fact visible with truthful provenance', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    const clientAuthorizationHeaders: string[] = [];
    const externalHosts: string[] = [];

    await page.route('**/*', async (route, request) => {
      const url = new URL(request.url());
      if (url.host.includes('xmemo.dev')) {
        externalHosts.push(url.host);
      }

      const authHeader = request.headers()['authorization'];
      if (authHeader) {
        clientAuthorizationHeaders.push(authHeader);
      }

      if (url.pathname === '/api/xmemo/status') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            enabled: true,
            connected: true,
            statusText: 'Connected to mock XMemo vault',
          }),
        });
        return;
      }

      if (url.pathname === '/api/xmemo/preferences') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              key: 'prep_buffer_preference',
              value: { prepMinutes: 25, bufferMinutes: 10 },
              status: 'confirmed',
              note: 'Synced from XMemo vault',
              updatedAt: '2026-10-31T09:00:00.000Z',
            },
            {
              key: 'rain_transport_preference',
              value: 'drive_first',
              status: 'confirmed',
              note: 'Synced from XMemo vault',
              updatedAt: '2026-10-31T09:00:00.000Z',
            },
          ]),
        });
        return;
      }

      await route.continue();
    });

    await page.goto('/?ui=v1');

    // 1. Why Sheet Truthful Provenance Verification (Reviewer Finding P2)
    // Open Why sheet on Home view
    const whyBtn = page.locator('#btn-why');
    await expect(whyBtn).toBeVisible();
    await whyBtn.click();

    const whyBackdrop = page.locator('#why-sheet-backdrop');
    await expect(whyBackdrop).toBeVisible();

    // Verify remote-only synced habits carry truthful 'Synced from XMemo' badges
    const memorySection = whyBackdrop.locator('section[aria-labelledby="why-memory-heading"]');
    await expect(memorySection).toBeVisible();

    // Assert that badges for synced items strictly say 'Synced from XMemo'
    const syncedBadges = memorySection.locator('.why-item-row .card-badge');
    await expect(syncedBadges.first()).toBeVisible();
    const count = await syncedBadges.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const badgeText = await syncedBadges.nth(i).innerText();
      // Must NOT be demo sample and must NOT claim user confirmation
      expect(badgeText).not.toBe('Demo profile · sample preference');
      expect(badgeText).not.toBe('Confirmed');
      expect(badgeText).toBe('Synced from XMemo');
    }

    // Close Why sheet
    await page.locator('#btn-why-sheet-done').click();
    await expect(whyBackdrop).not.toBeVisible();

    // 2. Me Tab Truthful Provenance Verification
    await goToMeTab(page, isMobile);

    // Assert: XMemo section is visible in connected state
    await expect(page.locator('#me-xmemo-title')).toBeVisible();
    await expect(page.locator('#btn-xmemo-disconnect')).toBeVisible();

    // Assert: Merged fact appears under Confirmed Preferences
    const factRow = page.locator('#fact-rain_transport_preference');
    await expect(factRow).toBeVisible();
    await expect(factRow.locator('.memory-key')).toHaveText('Rain travel habit');

    // Assert: Truthful provenance (no invented "you confirmed")
    await expect(factRow.locator('.memory-meta')).toContainText('Source: synced from XMemo');

    // Assert: zero requests to xmemo.dev and zero client authorization headers
    expect(externalHosts).toHaveLength(0);
    expect(clientAuthorizationHeaders).toHaveLength(0);

    // Visual screenshot evidence
    await saveScreenshot(page, `xmemo-wire-connected-${viewName}.png`);
  });

  test('Scenario 3 (5xx Fallback): Silent local fallback without UX disruption', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const viewName = isMobile ? 'mobile-390x844' : 'desktop-1280x800';

    await page.route('**/*', async (route, request) => {
      const url = new URL(request.url());

      if (url.pathname === '/api/xmemo/status') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            enabled: true,
            connected: true,
            statusText: 'Connected',
          }),
        });
        return;
      }

      if (url.pathname === '/api/xmemo/preferences') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
        return;
      }

      await route.continue();
    });

    await page.goto('/?ui=v1');
    await goToMeTab(page, isMobile);

    // Assert: XMemo section is visible and displays fallback status
    await expect(page.locator('#me-xmemo-title')).toBeVisible();
    const statusSection = page.locator('section[data-xmemo-status]');
    await expect(statusSection).toHaveAttribute('data-xmemo-status', 'error-fallback');
    await expect(statusSection.locator('.card-badge')).toHaveText('Fallback (local only)');
    await expect(statusSection.locator('.me-card-desc')).toContainText(
      'Remote memory vault is unavailable. Operating safely in local storage fallback mode.'
    );

    // Assert: Local preferences list renders cleanly without disruption
    await expect(page.locator('#confirmed-facts-list')).toBeVisible();

    // Visual screenshot evidence
    await saveScreenshot(page, `xmemo-wire-fallback-${viewName}.png`);
  });

  test('Scenario 4 (Write-Back & Data Sovereignty): Write dispatches to remote proxy; Reset Storage is local-only', async ({
    page,
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    let remoteWriteCount = 0;
    let remoteWritePayload: any = null;
    let remoteWriteHeaders: Record<string, string> = {};

    await page.route('**/*', async (route, request) => {
      const url = new URL(request.url());

      if (url.pathname === '/api/xmemo/status') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            enabled: true,
            connected: true,
          }),
        });
        return;
      }

      if (url.pathname === '/api/xmemo/preferences') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
        return;
      }

      if (url.pathname === '/api/xmemo/confirmed-facts' && request.method() === 'POST') {
        remoteWriteCount++;
        remoteWritePayload = JSON.parse(request.postData() || '{}');
        remoteWriteHeaders = request.headers();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
        return;
      }

      await route.continue();
    });

    await page.goto('/?ui=v1');

    // 1. Initial page load must not perform remote writes
    expect(remoteWriteCount).toBe(0);
    expect(remoteWritePayload).toBeNull();

    // 2. Perform Adjust -> Remember as preference -> Confirm proposal (INV-107)
    const adjustBtn = page.locator('#btn-adjust');
    await expect(adjustBtn).toBeVisible();
    await adjustBtn.click();

    const adjustModal = page.locator('#adjust-dialog-backdrop');
    await expect(adjustModal).toBeVisible();

    const rememberBtn = page.locator('#btn-adjust-remember');
    await expect(rememberBtn).toBeVisible();
    await rememberBtn.click();
    await expect(adjustModal).not.toBeVisible();

    // Proposal row is now in FOR YOU
    const forYouRow = page.locator('#for-you-prep_buffer_preference');
    await expect(forYouRow).toBeVisible();

    // Invariant INV-107: Before confirmation, zero remote writes have occurred
    expect(remoteWriteCount).toBe(0);

    // Explicit user confirmation triggers write-back
    const confirmBtn = forYouRow.locator('.btn-confirm-proposal');
    await expect(confirmBtn).toBeVisible();
    const writePromise = page.waitForRequest(
      req => req.url().includes('/api/xmemo/confirmed-facts') && req.method() === 'POST'
    );
    await confirmBtn.click();
    await writePromise;

    // Proposal disappears from FOR YOU upon confirmation
    await expect(forYouRow).not.toBeVisible();

    // Assert: exactly 1 remote write was dispatched
    expect(remoteWriteCount).toBe(1);
    expect(remoteWritePayload).not.toBeNull();
    expect(remoteWritePayload.status).toBe('confirmed');
    expect(remoteWritePayload.key).toBe('prep_buffer_preference');

    // Assert: zero client Authorization headers
    expect(remoteWriteHeaders['authorization']).toBeUndefined();
    expect(remoteWriteHeaders['Authorization']).toBeUndefined();

    // 3. Confirm Reset Storage is local-only in Data Controls
    await goToMeTab(page, isMobile);
    const dataSection = page.locator('section[aria-labelledby="me-data-title"]');
    await expect(dataSection.locator('.me-card-desc')).toContainText(
      'Resetting storage clears local browser preferences and history only. Remote XMemo vault records are preserved and never deleted from this client.'
    );
  });

  test('Scenario 5 (Safety Bounds & Invariant Enforcement): Corrupt remote value drops fail-closed without breaking NOW card', async ({
    page,
  }) => {
    await page.route('**/*', async (route, request) => {
      const url = new URL(request.url());

      if (url.pathname === '/api/xmemo/status') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            enabled: true,
            connected: true,
            statusText: 'Connected to mock XMemo vault',
          }),
        });
        return;
      }

      if (url.pathname === '/api/xmemo/preferences') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            // Corrupt out-of-bounds preference from reviewer finding P1
            {
              key: 'prep_buffer_preference',
              value: { prepMinutes: -500, bufferMinutes: 100000 },
              status: 'confirmed',
              note: 'Hostile/corrupted vault record',
              updatedAt: '2026-10-31T09:00:00.000Z',
            },
          ]),
        });
        return;
      }

      await route.continue();
    });

    await page.goto('/?ui=v1');

    // Assert: The Piano lesson NOW card STILL renders and is not erased into quiet state
    const nowSubject = page.locator('.now-subject');
    await expect(nowSubject).toBeVisible();
    await expect(nowSubject).toContainText('Piano lesson at 3:00 PM');

    // Assert: Home does NOT show quiet state
    const quietText = page.locator('text=Nothing needs your attention right now.');
    await expect(quietText).toHaveCount(0);
  });
});
