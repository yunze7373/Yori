import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'path';
import fs from 'fs';

const EVIDENCE_DIR = path.resolve(process.cwd(), 'docs/evidence/v2');

async function checkAxe(page: Page) {
  const axeResults = await new AxeBuilder({ page })
    .withRules(['color-contrast', 'button-name', 'heading-order', 'label'])
    .analyze();
  const criticalViolations = axeResults.violations.filter(
    v => v.impact === 'critical' || v.impact === 'serious'
  );
  expect(criticalViolations).toHaveLength(0);
}

test.describe('V-ANCHOR & V0: Action-State Store & Interaction Shell Suite', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(EVIDENCE_DIR)) {
      fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    }
  });

  test('V1 approved home renders by default without ask bar and passes axe accessibility', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app-layout');

    // Root layout data attribute reflects v1
    const appLayout = page.locator('.app-layout');
    await expect(appLayout).toHaveAttribute('data-ui-version', 'v1');

    // V2 badge is NOT rendered
    await expect(page.locator('#badge-ui-version')).toHaveCount(0);

    // Ask bar is NOT rendered on v1
    await expect(page.locator('#ask-bar')).toHaveCount(0);

    // Standard demo chip is present
    await expect(page.locator('.demo-chip')).toContainText('Demo · simulated context');

    // Verify D1 clear departure scene
    await expect(page.locator('.now-card')).toBeVisible();
    await expect(page.locator('.now-card')).toContainText('Piano lesson at 3:00 PM');
    await expect(page.locator('.now-card')).toContainText('Get ready at 2:05 PM, leave by 2:25 PM');

    // Axe audit
    await checkAxe(page);

    // Capture screenshot evidence
    const viewport = page.viewportSize();
    const isMobile = (viewport?.width ?? 0) < 600;
    const filename = isMobile ? 'v1-home-mobile-390x844.png' : 'v1-home-desktop-1280x800.png';
    await page.screenshot({ path: path.join(EVIDENCE_DIR, filename), fullPage: false });
  });

  test('V2 shell renders with Ask bar, opens Conversation shell, manages focus trap, Back, Esc, pin, and axe', async ({ page }) => {
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');

    // Root layout data attribute reflects v2
    const appLayout = page.locator('.app-layout');
    await expect(appLayout).toHaveAttribute('data-ui-version', 'v2');

    // V2 badge IS rendered
    const v2Badge = page.locator('#badge-ui-version');
    await expect(v2Badge).toBeVisible();
    await expect(v2Badge).toHaveText('V2 Preview');

    // Ask bar is rendered docked at the bottom of the home screen
    const askBar = page.locator('#ask-bar');
    await expect(askBar).toBeVisible();
    await expect(askBar).toContainText('Ask Yori about your day...');

    // Assert ask bar is strictly within viewport on initial load (at 390x844 and 1280x800)
    const viewport = page.viewportSize()!;
    const askBox = await askBar.boundingBox();
    expect(askBox).not.toBeNull();
    expect(askBox!.y).toBeGreaterThanOrEqual(0);
    expect(askBox!.y + askBox!.height).toBeLessThanOrEqual(viewport.height);

    const isMobile = viewport.width < 600;

    // On mobile v2, dead disabled 'Ask' tab is eliminated
    if (isMobile) {
      const disabledAskTab = page.locator('.bottom-tab-bar button:has-text("Ask")');
      await expect(disabledAskTab).toHaveCount(0);
    }

    // Assert ask bar does not overlap the primary NOW action buttons when scrolled
    const btnAccept = page.locator('#btn-accept');
    if (await btnAccept.count() > 0) {
      await btnAccept.scrollIntoViewIfNeeded();
      const btnBox = await btnAccept.boundingBox();
      const currentAskBox = await askBar.boundingBox();
      expect(btnBox).not.toBeNull();
      expect(currentAskBox).not.toBeNull();

      const overlaps = !(
        btnBox!.x + btnBox!.width <= currentAskBox!.x ||
        currentAskBox!.x + currentAskBox!.width <= btnBox!.x ||
        btnBox!.y + btnBox!.height <= currentAskBox!.y ||
        currentAskBox!.y + currentAskBox!.height <= btnBox!.y
      );
      expect(overlaps).toBe(false);
    }

    // Capture Home state screenshot for V2
    const homeFilename = isMobile ? 'v2-home-mobile-390x844.png' : 'v2-home-desktop-1280x800.png';
    await page.screenshot({ path: path.join(EVIDENCE_DIR, homeFilename), fullPage: false });

    // 1. Open conversation overlay by tapping ask bar
    await askBar.click();
    const overlay = page.locator('#conversation-overlay');
    await expect(overlay).toBeVisible();

    // Background elements become inert when conversation is open
    await expect(page.locator('.header-bar')).toHaveAttribute('inert', '');
    await expect(page.locator('main.main-container')).toHaveAttribute('inert', '');

    // 2. Focus moves into the conversation input composer on open
    const composerInput = page.locator('#conversation-input');
    await expect(composerInput).toBeFocused();

    // 3. Focus trap: Tab and Shift+Tab cycling never leaves the overlay
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      const insideOverlay = await page.evaluate(() => {
        const ov = document.querySelector('#conversation-overlay');
        return ov ? ov.contains(document.activeElement) : false;
      });
      expect(insideOverlay).toBe(true);
    }
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Shift+Tab');
      const insideOverlay = await page.evaluate(() => {
        const ov = document.querySelector('#conversation-overlay');
        return ov ? ov.contains(document.activeElement) : false;
      });
      expect(insideOverlay).toBe(true);
    }

    // 4. Test Browser / System Back Navigation (page.goBack closes conversation without leaving app)
    await page.goBack();
    await expect(overlay).toHaveCount(0);
    expect(page.url()).toContain('?ui=v2');
    await expect(askBar).toBeFocused();

    // Background is no longer inert after closing
    await expect(page.locator('.header-bar')).not.toHaveAttribute('inert');
    await expect(page.locator('main.main-container')).not.toHaveAttribute('inert');

    // 5. Reopen conversation to test messaging and pin
    await askBar.click();
    await expect(overlay).toBeVisible();
    await expect(composerInput).toBeFocused();

    // Transcript displays honest V0 welcome text
    const transcript = page.locator('#conversation-transcript');
    await expect(transcript).toBeVisible();
    await expect(transcript).toContainText('Hello! I am Yori');
    await expect(transcript).toContainText('Commands will arrive in the next build (V2a)');

    // 6. Send message: composer accepts input and presents honest V0 placeholder
    await composerInput.fill('Can I leave 15 minutes later?');
    await page.locator('#conversation-send-btn').click();

    await expect(transcript).toContainText('Can I leave 15 minutes later?');
    await expect(transcript).toContainText('Commands arrive in the next build (V2a)');

    // 7. Pin button toggles pin state
    const pinBtn = page.locator('#conversation-pin-btn');
    await expect(pinBtn).toHaveAttribute('aria-pressed', 'false');
    await pinBtn.click();
    await expect(pinBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(pinBtn).toHaveClass(/is-pinned/);

    // 8. Axe audit on open conversation dialog
    await checkAxe(page);

    // 9. Capture Conversation state screenshot for V2
    const conversationFilename = isMobile
      ? 'v2-conversation-mobile-390x844.png'
      : 'v2-conversation-desktop-1280x800.png';
    await page.screenshot({ path: path.join(EVIDENCE_DIR, conversationFilename), fullPage: false });

    // 10. Close via Close button -> focus returns to Ask bar
    const closeBtn = page.locator('#conversation-close-btn');
    await closeBtn.click();
    await expect(overlay).toHaveCount(0);
    await expect(askBar).toBeFocused();

    // 11. Reopen and test Esc key -> focus returns to Ask bar
    await askBar.click();
    await expect(overlay).toBeVisible();
    await expect(composerInput).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(overlay).toHaveCount(0);
    await expect(askBar).toBeFocused();
  });

  test('V2 preserves full scenario switching and plan functionality', async ({ page }) => {
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');

    const viewport = page.viewportSize();
    const isMobile = (viewport?.width ?? 0) < 600;

    // Clear D1
    await expect(page.locator('.now-card')).toContainText('Piano lesson at 3:00 PM');
    // Verify D1 timeline derives exact 30 min travel and 2:55 PM arrival (no 25m/2:50 constants)
    const d1Timeline = page.locator('.v2-timeline');
    await expect(d1Timeline).toBeVisible();
    await expect(d1Timeline).toContainText('Drive · 30 min');
    await expect(d1Timeline).toContainText('2:55 PM');
    await expect(d1Timeline).toContainText('5m buffer');
    // Single-mode D1 has only drive route on map and NO bus route
    await expect(page.locator('.v2-map-card polyline#route-drive, .v2-map-card [id="route-drive"]')).toBeVisible();
    await expect(page.locator('.v2-map-card polyline#route-bus, .v2-map-card [id="route-bus"]')).toHaveCount(0);
    // Plain string steps are not rendered as option cards
    await expect(page.locator('.v2-options-grid')).toHaveCount(0);

    // Switch to Rain D2
    await page.selectOption('#scene-select', 'rain');
    await expect(page.locator('.now-card')).toContainText('Get ready at 2:10 PM, leave by 2:30 PM');
    await expect(page.locator('.now-card')).toContainText('Umbrella');
    await expect(page.locator('.now-card')).toContainText('Drive · leave 2:30 PM');

    // Weather copy is derived strictly from weather signal (no reference image constants)
    const insightDesc = page.locator('.v2-insight-desc');
    await expect(insightDesc).toBeVisible();
    await expect(insightDesc).toContainText('simulated');
    await expect(insightDesc).not.toContainText('around 2:00 PM');
    await expect(insightDesc).not.toContainText('Heavier 2:00–4:00 PM');

    // Sample habit ranking basis displays honest Demo profile · sample and NEVER Confirmed
    const rainOptions = page.locator('.v2-options-grid');
    await expect(rainOptions).toBeVisible();
    await expect(rainOptions).toContainText('Demo profile · sample');
    await expect(rainOptions).not.toContainText('Confirmed');

    // Verify V2 Journey components (prominent map and timeline)
    await expect(page.locator('.v2-map-card.prominent')).toBeVisible();
    await expect(page.locator('.v2-timeline')).toBeVisible();
    await expect(page.locator('.v2-options-grid')).toBeVisible();

    // Rain axe check & screenshot
    await checkAxe(page);
    const rainFilename = isMobile ? 'v2-rain-mobile-390x844.png' : 'v2-rain-desktop-1280x800.png';
    await page.screenshot({ path: path.join(EVIDENCE_DIR, rainFilename), fullPage: false });

    // Switch to Away Lunch D3
    await page.selectOption('#scene-select', 'away-lunch');
    await expect(page.locator('.now-card')).toContainText('Lunch options near you');

    // Verify V2 Candidate components (local illustrations and compact map)
    await expect(page.locator('.v2-candidate-card')).toHaveCount(3);
    await expect(page.locator('.v2-illustration-badge')).toHaveCount(3);
    await expect(page.locator('.v2-map-card.compact')).toBeVisible();

    // Candidate basis displays honest Demo profile · sample and NEVER Confirmed
    const candidateList = page.locator('.v2-candidate-list');
    await expect(candidateList).toContainText('Demo profile · sample');
    await expect(candidateList).not.toContainText('Confirmed');

    // Lunch axe check & screenshot
    await checkAxe(page);
    const lunchFilename = isMobile ? 'v2-lunch-mobile-390x844.png' : 'v2-lunch-desktop-1280x800.png';
    await page.screenshot({ path: path.join(EVIDENCE_DIR, lunchFilename), fullPage: false });
  });

  test('Invalid UI version tokens fail closed to v1 without crash', async ({ page }) => {
    await page.goto('/?ui=unknown-version-xyz');
    await page.waitForSelector('.app-layout');

    const appLayout = page.locator('.app-layout');
    await expect(appLayout).toHaveAttribute('data-ui-version', 'v1');
    await expect(page.locator('#badge-ui-version')).toHaveCount(0);
    await expect(page.locator('#ask-bar')).toHaveCount(0);
  });

  test('V1b: TripDetail expanded view with mode tabs, schematic map, timing, why provenance, and back navigation', async ({ page }) => {
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');
    await page.selectOption('#scene-select', 'rain');

    const viewport = page.viewportSize();
    const isMobile = (viewport?.width ?? 0) < 600;

    // Verify rain scene home is loaded
    await expect(page.locator('.now-card')).toBeVisible();

    // Click "Details →" button to open TripDetail
    const detailsBtn = page.locator('#btn-view-trip-details');
    await expect(detailsBtn).toBeVisible();
    await detailsBtn.click();

    // Verify TripDetail view is mounted
    const tripDetail = page.locator('.v2-trip-detail');
    await expect(tripDetail).toBeVisible();
    await expect(tripDetail).toContainText('Piano lesson at 3:00 PM');
    await expect(tripDetail).toContainText('SIMULATED');

    // Verify Mode Tabs: Drive and Bus only; Walk absent
    const driveTab = page.locator('#mode-tab-drive');
    const busTab = page.locator('#mode-tab-bus');
    const walkTab = page.locator('#mode-tab-walk');

    await expect(driveTab).toBeVisible();
    await expect(driveTab).toContainText('Drive · 25 min');
    await expect(driveTab).toHaveAttribute('aria-selected', 'true');

    await expect(busTab).toBeVisible();
    await expect(busTab).toContainText('Bus · 40 min');
    await expect(busTab).toHaveAttribute('aria-selected', 'false');

    await expect(walkTab).toHaveCount(0);

    // Initial Drive Timing Summary: leave 2:30 PM, arrive 2:55 PM (5m buffer)
    const leaveTimeEl = page.locator('#trip-leave-time');
    const arriveTimeEl = page.locator('#trip-arrive-time');
    await expect(leaveTimeEl).toHaveText('2:30 PM');
    await expect(arriveTimeEl).toHaveText('2:55 PM');
    await expect(tripDetail.locator('.v2-buffer-pill')).toContainText('5m buffer');
    await expect(tripDetail.locator('.v2-prep-pill')).toContainText('Take umbrella · 20m prep + 5m buffer');

    // Switch to Bus Mode Tab
    await busTab.click();
    await expect(busTab).toHaveAttribute('aria-selected', 'true');
    await expect(driveTab).toHaveAttribute('aria-selected', 'false');
    // Bus: leave 2:15 PM, arrive 2:55 PM
    await expect(leaveTimeEl).toHaveText('2:15 PM');
    await expect(arriveTimeEl).toHaveText('2:55 PM');

    // Prominent Schematic Map with weather overlay
    const mapCard = tripDetail.locator('.v2-map-card.prominent');
    await expect(mapCard).toBeVisible();
    await expect(mapCard).toContainText('Rain forecast · simulated');

    // "Why this plan?" section with honest provenance chips
    const whySection = tripDetail.locator('.v2-why-plan-card');
    await expect(whySection).toBeVisible();
    await expect(whySection).toContainText('Why this plan?');
    await expect(whySection).toContainText('Demo profile · sample');
    // Data honesty check: zero star ratings or review counts
    const tripDetailText = await tripDetail.innerText();
    expect(tripDetailText).not.toContain('★');
    expect(tripDetailText).not.toContain('reviews');

    // Axe audit
    await checkAxe(page);

    // Screenshot evidence capture
    const tripFilename = isMobile
      ? 'v2-trip-detail-mobile-390x844.png'
      : 'v2-trip-detail-desktop-1280x800.png';
    await page.screenshot({ path: path.join(EVIDENCE_DIR, tripFilename), fullPage: false });

    // Back button returns to Home and restores focus to originating button
    const backBtn = page.locator('#trip-detail-back-btn');
    await expect(backBtn).toBeVisible();
    await backBtn.click();

    // Verify return to Home
    await expect(page.locator('.v2-trip-detail')).toHaveCount(0);
    await expect(page.locator('.now-card')).toBeVisible();

    // Open detail again and test browser popstate (Back)
    await page.locator('#btn-view-trip-details').click();
    await expect(page.locator('.v2-trip-detail')).toBeVisible();
    await page.goBack();
    await expect(page.locator('.v2-trip-detail')).toHaveCount(0);
    await expect(page.locator('.now-card')).toBeVisible();
  });

  test('V1b: RestaurantDetail expanded view with local artwork, attribute chips, Save UI state, in-app Directions, and back navigation', async ({ page }) => {
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');
    await page.selectOption('#scene-select', 'away-lunch');

    const viewport = page.viewportSize();
    const isMobile = (viewport?.width ?? 0) < 600;

    // Verify candidate cards are present
    const firstCandidate = page.locator('.v2-candidate-card').first();
    await expect(firstCandidate).toBeVisible();
    const candidateName = await firstCandidate.locator('.v2-candidate-name').innerText();

    // Click candidate card to open RestaurantDetail
    await firstCandidate.click();

    // Verify RestaurantDetail view is mounted
    const restDetail = page.locator('.v2-restaurant-detail');
    await expect(restDetail).toBeVisible();
    await expect(restDetail.locator('#restaurant-detail-name')).toHaveText(candidateName);

    // Local labelled SVG illustration with zero remote URLs
    const heroArt = restDetail.locator('.v2-restaurant-hero-art');
    await expect(heroArt).toBeVisible();
    await expect(heroArt).toContainText('Illustration · simulated');
    const heroSvg = heroArt.locator('svg');
    await expect(heroSvg).toBeVisible();
    // Static check: verify zero remote images
    const remoteImgs = await restDetail.locator('img, image').all();
    for (const img of remoteImgs) {
      const src = (await img.getAttribute('src')) || (await img.getAttribute('href')) || '';
      expect(src).not.toContain('http://');
      expect(src).not.toContain('https://');
    }

    // Fixture attribute chips only; zero star ratings or review counts
    const attrChips = restDetail.locator('.v2-attribute-chips');
    await expect(attrChips).toBeVisible();
    await expect(attrChips).toContainText('5m away');
    const detailText = await restDetail.innerText();
    expect(detailText).not.toContain('★');
    expect(detailText).not.toContain('reviews');
    expect(detailText).not.toContain('rating');

    // Save button: UI state only, zero memory writes
    const saveBtn = restDetail.locator('#btn-restaurant-save');
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(saveBtn).toContainText('Save');

    // Click Save: toggles to Saved
    await saveBtn.click();
    await expect(saveBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(saveBtn).toContainText('Saved');

    // In-App Directions button: strictly in-app route, zero external maps/URLs
    const dirBtn = restDetail.locator('#btn-restaurant-directions');
    const dirPanel = restDetail.locator('#restaurant-directions-panel');
    await expect(dirBtn).toBeVisible();
    await expect(dirPanel).not.toBeVisible();

    // Click Directions to reveal in-app schematic directions
    await dirBtn.click();
    await expect(dirPanel).toBeVisible();
    await expect(dirPanel).toContainText('Walking Directions');
    await expect(dirPanel).toContainText('In-app route · simulated');
    await expect(dirPanel.locator('.v2-direction-item')).toHaveCount(3);

    // Verify zero external map links in directions panel
    const externalLinks = await dirPanel.locator('a[href*="google"], a[href*="maps"], a[target="_blank"]').all();
    expect(externalLinks).toHaveLength(0);

    // Axe audit
    await checkAxe(page);

    // Screenshot evidence capture
    const restFilename = isMobile
      ? 'v2-restaurant-detail-mobile-390x844.png'
      : 'v2-restaurant-detail-desktop-1280x800.png';
    await page.screenshot({ path: path.join(EVIDENCE_DIR, restFilename), fullPage: false });

    // Back button returns to Home and restores focus to originating candidate card
    const backBtn = restDetail.locator('#restaurant-detail-back-btn');
    await expect(backBtn).toBeVisible();
    await backBtn.click();

    // Verify return to Home
    await expect(page.locator('.v2-restaurant-detail')).toHaveCount(0);
    await expect(page.locator('.v2-candidate-list')).toBeVisible();
  });

  test('V1b: Decided 4-tab bottom navigation (Home / Plans / For You / Me), zero disabled tabs, and no mic icon', async ({ page }) => {
    await page.goto('/?ui=v2');
    await page.waitForSelector('.app-layout');

    const viewport = page.viewportSize();
    const isMobile = (viewport?.width ?? 0) < 600;

    // Verify zero disabled navigation tabs on V2
    const disabledTabs = page.locator('.bottom-tab-bar .disabled, .desktop-nav .disabled');
    await expect(disabledTabs).toHaveCount(0);

    // Verify NO mic icon exists in ask bar or anywhere in navigation
    const micElements = page.locator('[aria-label*="mic" i], .mic-icon, svg.mic');
    await expect(micElements).toHaveCount(0);

    if (isMobile) {
      // Mobile 4-tab bottom bar: #tab-home, #tab-plans, #tab-for-you, #tab-me
      const tabHome = page.locator('#tab-home');
      const tabPlans = page.locator('#tab-plans');
      const tabForYou = page.locator('#tab-for-you');
      const tabMe = page.locator('#tab-me');

      await expect(tabHome).toBeVisible();
      await expect(tabPlans).toBeVisible();
      await expect(tabForYou).toBeVisible();
      await expect(tabMe).toBeVisible();

      // Home tab is initially active
      await expect(tabHome).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('#ask-bar')).toBeVisible();

      // Switch to Plans tab (functional AHEAD list)
      await tabPlans.click();
      await expect(tabPlans).toHaveAttribute('aria-current', 'page');
      await expect(tabHome).toHaveAttribute('aria-current', 'false');
      await expect(page.locator('.v2-plans-view')).toBeVisible();
      await expect(page.locator('.v2-plans-view')).toContainText('Upcoming Plans');
      // Ask bar is hidden on secondary tabs
      await expect(page.locator('#ask-bar')).toHaveCount(0);

      // Switch to For You tab (functional proposals & insights)
      await tabForYou.click();
      await expect(tabForYou).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('.v2-for-you-view')).toBeVisible();
      await expect(page.locator('.v2-for-you-view')).toContainText('For You');

      // Switch to Me tab (functional memory & budget view)
      await tabMe.click();
      await expect(tabMe).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('.me-view-container')).toBeVisible();

      // Switch back to Home
      await tabHome.click();
      await expect(tabHome).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('.now-card')).toBeVisible();
      await expect(page.locator('#ask-bar')).toBeVisible();
    } else {
      // Desktop 4 navigation pills: #desktop-nav-home, #desktop-nav-plans, #desktop-nav-for-you, #desktop-nav-me
      const navHome = page.locator('#desktop-nav-home');
      const navPlans = page.locator('#desktop-nav-plans');
      const navForYou = page.locator('#desktop-nav-for-you');
      const navMe = page.locator('#desktop-nav-me');

      await expect(navHome).toBeVisible();
      await expect(navPlans).toBeVisible();
      await expect(navForYou).toBeVisible();
      await expect(navMe).toBeVisible();

      // Switch to Plans
      await navPlans.click();
      await expect(navPlans).toHaveClass(/active/);
      await expect(page.locator('.v2-plans-view')).toBeVisible();

      // Switch to For You
      await navForYou.click();
      await expect(navForYou).toHaveClass(/active/);
      await expect(page.locator('.v2-for-you-view')).toBeVisible();

      // Switch to Me
      await navMe.click();
      await expect(navMe).toHaveClass(/active/);
      await expect(page.locator('.me-view-container')).toBeVisible();

      // Return to Home
      await navHome.click();
      await expect(navHome).toHaveClass(/active/);
      await expect(page.locator('.now-card')).toBeVisible();
    }

    // Axe audit
    await checkAxe(page);
  });
});
