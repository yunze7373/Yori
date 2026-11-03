/**
 * UI-QUIET-PRECISION: side-by-side comparison images (approved reference crop | app) for the UI
 * review pack. Reads the app captures written by tests/e2e-live/ui-quiet-precision.spec.ts
 * (UPDATE_EVIDENCE=1) and the reference PNGs in docs/design/v2-reference/, renders each pair in a
 * headless page and saves docs/evidence/ui-quiet-precision/compare-*.png. No network.
 * Usage: node scripts/ui-qp-compare.mjs
 */

import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const REF = path.resolve('docs/design/v2-reference');
const EV = path.resolve('docs/evidence/ui-quiet-precision');

/** [name, reference file, crop x, y, w, h, app capture, caption]. */
const PAIRS = [
  ['home-04-390', '04_owner_polish_target_home_connectors.jpg', 190, 30, 410, 910, 'rain-replan-demo-390x844.png', 'Home rain re-plan (04 left screen) vs app at 390x844 (Demo timeline S3: rain forecast issued, plan updated)'],
  ['home-04-live-rain-390', '04_owner_polish_target_home_connectors.jpg', 190, 30, 410, 910, 'rain-replan-live-390x844.png', 'Home rain re-plan (04 left screen) vs app at 390x844 (Live, recorded Open-Meteo forecast + your 10 min rain buffer)'],
  ['lunch-04-390', '04_owner_polish_target_home_connectors.jpg', 190, 30, 410, 910, 'fold-lunch-390x844.png', 'Home with lunch (04 left screen) vs app at 390x844 (Live lunch, recorded places)'],
  ['connectors-04-390', '04_owner_polish_target_home_connectors.jpg', 683, 30, 420, 910, 'connectors-390x844.png', 'Settings > Connectors (04 right screen) vs app at 390x844'],
  ['home-rain-390', '03_mobile_experience_v1_approved.png', 418, 72, 214, 426, 'fold-depart-390x844.png', 'Home · weather-aware plan (reference 03 screen 1 vs app, Demo rain scene)'],
  ['lunch-390', '03_mobile_experience_v1_approved.png', 420, 575, 258, 317, 'fold-lunch-390x844.png', 'Lunch suggestions (reference 03 scenario 2 screen 1 vs app, Live lunch, recorded places)'],
  ['home-desktop-1280', '01_desktop_living_context_concept.png', 30, 136, 1038, 646, 'home-lunch-1280x800.png', 'Home desktop (reference 01 vs app at 1280x800)'],
];

const NATURAL_WIDTH = { '04_owner_polish_target_home_connectors.jpg': 1280, '03_mobile_experience_v1_approved.png': 1672, '01_desktop_living_context_concept.png': 1448 };

const dataUri = file => `data:image/${file.endsWith('.jpg') ? 'jpeg' : 'png'};base64,${fs.readFileSync(file).toString('base64')}`;

const browser = await chromium.launch();
for (const [name, ref, x, y, w, h, app, caption] of PAIRS) {
  const appFile = path.join(EV, app);
  if (!fs.existsSync(appFile)) {
    console.log(`skip ${name}: ${app} missing`);
    continue;
  }
  const height = name.includes('desktop') ? 520 : 720;
  const refScale = height / h;
  const page = await browser.newPage({ viewport: { width: 1600, height: height + 90 } });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#EDEAE2;font:14px Inter,system-ui,sans-serif;color:#15302A">
    <div style="display:flex;gap:28px;align-items:flex-start;padding:20px 24px 0">
      <figure style="margin:0">
        <div style="width:${Math.round(w * refScale)}px;height:${height}px;overflow:hidden;border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.12);background:url(${dataUri(path.join(REF, ref))}) -${Math.round(x * refScale)}px -${Math.round(y * refScale)}px / ${Math.round(NATURAL_WIDTH[ref] * refScale)}px auto no-repeat"></div>
        <figcaption style="margin-top:8px">Reference (approved)</figcaption>
      </figure>
      <figure style="margin:0">
        <img src="${dataUri(appFile)}" style="height:${height}px;border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.12)">
        <figcaption style="margin-top:8px">App (this build)</figcaption>
      </figure>
    </div>
    <div style="padding:6px 24px;font-weight:600">${caption}</div>
  </body></html>`);
  await page.waitForTimeout(150);
  const box = await page.evaluate(() => {
    const figs = Array.from(document.querySelectorAll('figure'));
    const right = Math.max(...figs.map(f => f.getBoundingClientRect().right));
    return { width: Math.ceil(right + 24), height: Math.ceil(document.body.scrollHeight) };
  });
  await page.screenshot({ path: path.join(EV, `compare-${name}.png`), clip: { x: 0, y: 0, width: Math.min(1600, box.width), height: box.height } });
  await page.close();
  console.log(`wrote compare-${name}.png`);
}
await browser.close();
