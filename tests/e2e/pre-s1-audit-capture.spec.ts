/**
 * PRE-S1-B: Slot-Aware Grounding Walkthrough Capture Harness
 *
 * Runs the 4 canonical user walkthroughs:
 * 1. Rain Walkthrough (D1 -> D2 -> Why -> Leave Later -> Me)
 * 2. Away-Lunch Walkthrough (D3 -> Why)
 * 3. Fuel V5 Walkthrough (Low fuel -> Straight-line distances -> Navigate modal)
 * 4. Dynamic Lunch V5 Walkthrough (Dynamic lunch -> Straight-line distances -> Navigate modal -> Why)
 *
 * Captures all rendered DOM value slots annotated with [data-source-ref] and [data-slot]
 * across both Desktop (1280x800) and Mobile (390x844) viewports.
 *
 * Env-gated by PRE_S1_RECORD: standard Playwright runs will NEVER overwrite tracked evidence.
 */

import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const EVIDENCE_DIR = path.resolve(process.cwd(), 'docs/evidence/pre-s1');
const DUMPS_DIR = path.resolve(EVIDENCE_DIR, 'dumps');
const shouldPersist = Boolean(process.env.PRE_S1_RECORD);

export interface CapturedSlot {
  slotId: string;
  slotType: 'domain' | 'chrome' | 'out_of_scope';
  sourceRef?: string;
  recordId?: string;
  field?: string;
  renderedText: string;
  reason?: string;
  component: string;
  step: string;
  scene: string;
  viewport: string;
}

export interface DumpFile {
  scene: string;
  viewport: string;
  recordedAt: string;
  steps: string[];
  slots: CapturedSlot[];
}

/**
 * Extracts all rendered slots from active components in the rendered DOM.
 */
async function extractRenderedSlots(
  page: Page,
  scene: string,
  step: string,
  viewport: string
): Promise<CapturedSlot[]> {
  return await page.evaluate(
    ({ scene, step, viewport }) => {
      const results: CapturedSlot[] = [];
      const seenElements = new Set<Element>();

      // Audited component containers
      const containerSelectors = [
        '.v2-insight-banner',
        '.v2-map-card',
        '.now-card',
        '.v2-candidate-list',
        '#why-sheet-backdrop',
        '#navigate-confirm-modal',
        '.me-view-container',
      ];

      for (const selector of containerSelectors) {
        const container = document.querySelector(selector);
        if (!container) continue;

        // Determine component name
        const component = selector.replace(/^[.#]/, '');

        // 1. Domain slots with explicit data-source-ref
        const sourceRefElements = container.querySelectorAll('[data-source-ref]');
        sourceRefElements.forEach((el, idx) => {
          if (seenElements.has(el)) return;
          seenElements.add(el);
          el.querySelectorAll('*').forEach(c => seenElements.add(c));

          const rawRef = el.getAttribute('data-source-ref') || '';
          const lastDot = rawRef.lastIndexOf('.');
          const recordId = lastDot > 0 ? rawRef.slice(0, lastDot) : rawRef;
          const field = lastDot > 0 ? rawRef.slice(lastDot + 1) : '';
          const text = (el as HTMLElement).innerText?.trim() || el.textContent?.trim() || '';

          results.push({
            slotId: `${component}-${recordId}-${field}-${idx}`,
            slotType: 'domain',
            sourceRef: rawRef,
            recordId,
            field,
            renderedText: text,
            component,
            step,
            scene,
            viewport,
          });
        });

        // 2. Explicit Chrome and Out-Of-Scope slots
        const taggedSlots = container.querySelectorAll('[data-slot]');
        taggedSlots.forEach((el, idx) => {
          if (seenElements.has(el)) return;
          seenElements.add(el);
          el.querySelectorAll('*').forEach(c => seenElements.add(c));

          const slotType = el.getAttribute('data-slot') as 'chrome' | 'out_of_scope' | 'domain';
          if (slotType === 'domain') return; // Handled above if data-source-ref was present

          const reason = el.getAttribute('data-slot-reason') || 'UI presentation element';
          const text = (el as HTMLElement).innerText?.trim() || el.textContent?.trim() || '';

          results.push({
            slotId: `${component}-slot-${slotType}-${idx}`,
            slotType: slotType === 'out_of_scope' ? 'out_of_scope' : 'chrome',
            renderedText: text,
            reason,
            component,
            step,
            scene,
            viewport,
          });
        });

        // 3. Scan leaf text elements to catch any unannotated elements (must FAIL audit as 'unclassified')
        const allCandidates = container.querySelectorAll('button, span, h1, h2, h3, h4, p, strong, a, label, code, div');
        allCandidates.forEach((el, idx) => {
          if (seenElements.has(el) || el.closest('[data-source-ref], [data-slot]')) return;
          // Check if any child element has non-empty text (if so, el is a container, not a leaf)
          const hasChildElementWithText = Array.from(el.children).some(child => {
            const cText = (child as HTMLElement).innerText?.trim() || child.textContent?.trim();
            return Boolean(cText && cText.length > 0);
          });
          if (hasChildElementWithText) return;

          const text = (el as HTMLElement).innerText?.trim() || el.textContent?.trim();
          if (!text) return;
          seenElements.add(el);

          // Mark as UNCLASSIFIED -> This will FAIL the audit unless explicitly annotated!
          results.push({
            slotId: `${component}-unannotated-leaf-${idx}`,
            slotType: 'unclassified' as any,
            renderedText: text,
            reason: `Unannotated DOM text leaf (${el.tagName.toLowerCase()}.${el.className || 'none'})`,
            component,
            step,
            scene,
            viewport,
          });
        });
      }

      return results;
    },
    { scene, step, viewport }
  );
}

function saveDump(scene: string, viewport: string, steps: string[], slots: CapturedSlot[]) {
  if (!shouldPersist) return;
  if (!fs.existsSync(DUMPS_DIR)) {
    fs.mkdirSync(DUMPS_DIR, { recursive: true });
  }

  const dump: DumpFile = {
    scene,
    viewport,
    recordedAt: new Date().toISOString(),
    steps,
    slots,
  };

  const filename = `${scene}-dumps-${viewport}.json`;
  const filePath = path.join(DUMPS_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(dump, null, 2), 'utf-8');
}

test.describe('PRE-S1-B: Slot-Aware Grounding Walkthrough Capture Suite', () => {
  test.beforeAll(() => {
    if (shouldPersist && !fs.existsSync(DUMPS_DIR)) {
      fs.mkdirSync(DUMPS_DIR, { recursive: true });
    }
  });

  // -------------------------------------------------------------
  // 1. RAIN WALKTHROUGH
  // -------------------------------------------------------------
  test('PRE-S1: Rain Walkthrough Slot Capture', async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const vpSuffix = isMobile ? '390x844' : '1280x800';
    const scene = 'rain';
    const steps: string[] = [];
    const allSlots: CapturedSlot[] = [];

    // Step 1: Initial Clear scene
    await page.goto('/?ui=v2&test=1');
    await page.waitForSelector('.app-layout');
    await expect(page.locator('.now-card')).toBeVisible();
    steps.push('Initial Clear State');
    allSlots.push(...(await extractRenderedSlots(page, scene, 'Initial Clear State', vpSuffix)));

    // Step 2: Weather shift to Rain
    const sceneSelect = page.locator('#scene-select');
    await sceneSelect.selectOption('rain');
    await expect(page.locator('.v2-insight-banner')).toBeVisible();
    steps.push('Weather Shift (Rain)');
    allSlots.push(...(await extractRenderedSlots(page, scene, 'Weather Shift (Rain)', vpSuffix)));

    // Step 3: Route Options (Drive vs Bus)
    await expect(page.locator('.v2-options-grid')).toBeVisible();
    steps.push('Route Options (Drive vs Bus)');
    allSlots.push(...(await extractRenderedSlots(page, scene, 'Route Options (Drive vs Bus)', vpSuffix)));

    // Step 4: Why Provenance Sheet
    const whyBtn = page.locator('#btn-why');
    await whyBtn.click();
    const whySheet = page.locator('#why-sheet-backdrop');
    await expect(whySheet).toBeVisible();
    steps.push('Why Provenance Sheet');
    allSlots.push(...(await extractRenderedSlots(page, scene, 'Why Provenance Sheet', vpSuffix)));

    // Close Why Sheet
    const closeWhyBtn = page.locator('#btn-why-sheet-done');
    await closeWhyBtn.click();
    await expect(whySheet).not.toBeVisible();

    // Step 5: Ask Yori late shift query (open conversation via Ask bar)
    const askBar = page.locator('#ask-bar');
    await expect(askBar).toBeVisible();
    await askBar.click();

    const overlay = page.locator('#conversation-overlay');
    await expect(overlay).toBeVisible();

    const chatInput = page.locator('#conversation-input');
    await expect(chatInput).toBeVisible();
    await chatInput.fill('Can I leave 15 minutes later?');
    await page.locator('#conversation-send-btn').click();

    const confirmBox = page.locator('.chat-confirm-box');
    await expect(confirmBox).toBeVisible({ timeout: 5000 });
    const confirmBtn = page.locator('#btn-chat-confirm');
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // Verify auto-collapse back to updated Home
    await expect(overlay).toHaveCount(0, { timeout: 5000 });
    await expect(page.locator('.now-card')).toBeVisible();

    steps.push('After Late Shift Confirmed');
    allSlots.push(...(await extractRenderedSlots(page, scene, 'After Late Shift Confirmed', vpSuffix)));

    // Step 6: Me Sovereign Memory Tab
    const meTab = page.locator(isMobile ? '#tab-me' : '#desktop-nav-me');
    await expect(meTab).toBeVisible();
    await meTab.click();
    await page.waitForTimeout(400);
    await expect(page.locator('.me-view-container')).toBeVisible();
    steps.push('Me Sovereign Memory Tab');
    allSlots.push(...(await extractRenderedSlots(page, scene, 'Me Sovereign Memory Tab', vpSuffix)));

    saveDump(scene, vpSuffix, steps, allSlots);
    expect(allSlots.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------
  // 2. AWAY-LUNCH WALKTHROUGH
  // -------------------------------------------------------------
  test('PRE-S1: Away-Lunch Walkthrough Slot Capture', async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const vpSuffix = isMobile ? '390x844' : '1280x800';
    const scene = 'away-lunch';
    const steps: string[] = [];
    const allSlots: CapturedSlot[] = [];

    // Step 1: Away-Lunch scene (D3)
    await page.goto('/?ui=v2&test=1');
    await page.waitForSelector('.app-layout');
    await page.selectOption('#scene-select', 'away-lunch');
    await expect(page.locator('.v2-candidate-list')).toBeVisible();
    steps.push('Proactive Away Lunch Card');
    allSlots.push(...(await extractRenderedSlots(page, scene, 'Proactive Away Lunch Card', vpSuffix)));

    // Step 2: Why Provenance Sheet
    const whyBtn = page.locator('#btn-why');
    await whyBtn.click();
    const whySheet = page.locator('#why-sheet-backdrop');
    await expect(whySheet).toBeVisible();
    steps.push('Why Provenance Sheet');
    allSlots.push(...(await extractRenderedSlots(page, scene, 'Why Provenance Sheet', vpSuffix)));

    // Close Why Sheet
    const closeWhyBtn = page.locator('#btn-why-sheet-done');
    await closeWhyBtn.click();
    await expect(whySheet).not.toBeVisible();

    saveDump(scene, vpSuffix, steps, allSlots);
    expect(allSlots.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------
  // 3. FUEL V5 WALKTHROUGH
  // -------------------------------------------------------------
  test('PRE-S1: Fuel V5 Walkthrough Slot Capture', async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const vpSuffix = isMobile ? '390x844' : '1280x800';
    const scene = 'fuel';
    const steps: string[] = [];
    const allSlots: CapturedSlot[] = [];

    // Step 1: Fuel scene (low fuel warning)
    await page.goto('/?ui=v2&test=1');
    await page.waitForSelector('.app-layout');
    await page.selectOption('#scene-select', 'fuel');
    await expect(page.locator('.v2-candidate-list')).toBeVisible();
    steps.push('Low Fuel Hero Card');
    allSlots.push(...(await extractRenderedSlots(page, scene, 'Low Fuel Hero Card', vpSuffix)));

    // Step 2: Open Navigate Modal
    await page.evaluate(() => {
      (window as any).__YORI_TEST_INTERCEPT_NAV__ = true;
    });
    const directionsBtn = page.locator('.v2-directions-btn').first();
    await directionsBtn.click();
    const navModal = page.locator('#navigate-confirm-modal');
    await expect(navModal).toBeVisible();
    steps.push('Navigate Handoff Modal');
    allSlots.push(...(await extractRenderedSlots(page, scene, 'Navigate Handoff Modal', vpSuffix)));

    // Close modal
    const cancelBtn = page.locator('#btn-cancel-navigate');
    await cancelBtn.click();
    await expect(navModal).not.toBeVisible();

    saveDump(scene, vpSuffix, steps, allSlots);
    expect(allSlots.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------
  // 4. DYNAMIC LUNCH V5 WALKTHROUGH
  // -------------------------------------------------------------
  test('PRE-S1: Dynamic Lunch V5 Walkthrough Slot Capture', async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name === 'mobile';
    const vpSuffix = isMobile ? '390x844' : '1280x800';
    const scene = 'dynamic-lunch';
    const steps: string[] = [];
    const allSlots: CapturedSlot[] = [];

    // Step 1: Dynamic Lunch scene with simulated places
    await page.goto('/?ui=v2&scene=lunch&test=1');
    await page.waitForSelector('.app-layout');
    await expect(page.locator('.v2-candidate-list')).toBeVisible();
    steps.push('Dynamic Lunch Proactive Card');
    allSlots.push(...(await extractRenderedSlots(page, scene, 'Dynamic Lunch Proactive Card', vpSuffix)));

    // Step 2: Open Navigate Modal
    await page.evaluate(() => {
      (window as any).__YORI_TEST_INTERCEPT_NAV__ = true;
    });
    const directionsBtn = page.locator('.v2-directions-btn').first();
    await directionsBtn.click();
    const navModal = page.locator('#navigate-confirm-modal');
    await expect(navModal).toBeVisible();
    steps.push('Navigate Handoff Modal');
    allSlots.push(...(await extractRenderedSlots(page, scene, 'Navigate Handoff Modal', vpSuffix)));

    // Close modal
    const cancelBtn = page.locator('#btn-cancel-navigate');
    await cancelBtn.click();
    await expect(navModal).not.toBeVisible();

    // Step 3: Why Provenance Sheet
    const whyBtn = page.locator('#btn-why');
    await whyBtn.click();
    const whySheet = page.locator('#why-sheet-backdrop');
    await expect(whySheet).toBeVisible();
    steps.push('Why Sheet');
    allSlots.push(...(await extractRenderedSlots(page, scene, 'Why Sheet', vpSuffix)));

    // Close Why Sheet
    const closeWhyBtn = page.locator('#btn-why-sheet-done');
    await closeWhyBtn.click();
    await expect(whySheet).not.toBeVisible();

    saveDump(scene, vpSuffix, steps, allSlots);
    expect(allSlots.length).toBeGreaterThan(0);
  });
});
