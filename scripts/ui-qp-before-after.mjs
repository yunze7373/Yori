/**
 * UI-QUIET-PRECISION area 2 increments: before/after crops for the review pack. "Before" is read
 * from a base commit with `git show`; "after" is the current capture in
 * docs/evidence/ui-quiet-precision. Writes <set>-before-after-*.png. No network.
 * Usage: node scripts/ui-qp-before-after.mjs [baseCommit] [set]
 *   set inc2 (default base 0486822) or inc3 (base 81d8408).
 */

import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SET = process.argv[3] || 'inc2';
const BASE = process.argv[2] || (SET === 'inc3' ? '81d8408' : '0486822');
const EV = 'docs/evidence/ui-quiet-precision';

/** [name, before file at BASE, after file now, crop {x,y,w,h} in CSS px of the capture, caption]. */
const SETS = {};
SETS.inc2 = [
  ['1-restaurant-basis', 'area2-restaurant-detail-390x844.png', 'area2-restaurant-detail-390x844.png', { x: 0, y: 270, w: 390, h: 240 }, '(1) Restaurant basis: "A ramen spot close to you" -> "Ramen · close to you" (no article grammar for any cuisine)'],
  ['2-memory-row', 'rain-replan-live-390x844.png', 'rain-replan-live-390x844.png', { x: 0, y: 470, w: 390, h: 250 }, '(2) Live MEMORY row: question-form title -> "Prep buffer · 10 min (you confirmed)"'],
  ['3-rail-weather', 'area2-accepted-1280x800.png', 'inc2-rail-1280x800.png', { x: 240, y: 520, w: 1040, h: 280 }, '(3) Desktop rail at 1280: Ask dock covered "Destination weather" -> dock stays in the centre column'],
  ['4a-consent', 'area2-consent-390x844.png', 'area2-consent-390x844.png', { x: 0, y: 200, w: 390, h: 580 }, '(4) Consent: three restatements + Title Case -> one title, one line, the disclosure, Use my location / Not now'],
  ['4b-error', 'area2-state-error-390x844.png', 'area2-state-error-390x844.png', { x: 0, y: 200, w: 390, h: 520 }, '(4) Failure: "all caught up" beside an error -> one failure line, then Retry'],
];
SETS.inc3 = [
  ['1-failure-390', 'area2-state-error-390x844.png', 'area2-state-error-390x844.png', { x: 0, y: 0, w: 390, h: 720 }, '(1) Nearby failure @390: the card no longer repeats "nothing needs your attention"; the failure line leads, then Retry'],
  ['1-failure-1280', 'area2-state-error-1280x800.png', 'area2-state-error-1280x800.png', { x: 240, y: 0, w: 660, h: 800 }, '(1) Nearby failure @1280'],
  ['2-demo-replan-390', 'rain-replan-demo-390x844.png', 'rain-replan-demo-390x844.png', { x: 0, y: 200, w: 390, h: 280 }, '(2) Demo re-plan @390: a later leave time now says why (rain -> you drive, your rain preference)'],
  ['2-demo-replan-1280', 'rain-replan-demo-1280x800.png', 'rain-replan-demo-1280x800.png', { x: 240, y: 180, w: 660, h: 260 }, '(2) Demo re-plan @1280'],
  ['3-restaurant-390', 'area2-restaurant-detail-390x844.png', 'area2-restaurant-detail-390x844.png', { x: 0, y: 0, w: 390, h: 780 }, "(3) Restaurant detail @390: the place's own Google photo with its author credit (test stand-in image); actions at the foot"],
  ['3-restaurant-1280', 'area2-restaurant-detail-1280x800.png', 'area2-restaurant-detail-1280x800.png', { x: 240, y: 0, w: 660, h: 800 }, '(3) Restaurant detail @1280'],
  ['4-rail-map-1280', 'inc2-rail-1280x800.png', 'inc2-rail-1280x800.png', { x: 900, y: 0, w: 380, h: 800 }, '(4) Desktop rail map @1280: one caption row, "schematic" said once, soft canvas'],
  ['4-rail-map-1440', 'inc2-rail-1440x800.png', 'inc2-rail-1440x800.png', { x: 1060, y: 0, w: 380, h: 800 }, '(4) Desktop rail map @1440'],
];
const PAIRS = SETS[SET] || [];

const uri = buf => `data:image/png;base64,${buf.toString('base64')}`;

const browser = await chromium.launch();
for (const [name, beforeFile, afterFile, crop, caption] of PAIRS) {
  const afterPath = path.join(EV, afterFile);
  if (!fs.existsSync(afterPath)) {
    console.log(`skip ${name}: ${afterFile} missing`);
    continue;
  }
  let before;
  try {
    before = execFileSync('git', ['show', `${BASE}:${EV}/${beforeFile}`], { maxBuffer: 64 * 1024 * 1024 });
  } catch {
    console.log(`skip ${name}: ${beforeFile} not in ${BASE}`);
    continue;
  }
  const after = fs.readFileSync(afterPath);
  const panel = (src, label) => `
    <figure style="margin:0">
      <div style="width:${crop.w}px;height:${crop.h}px;overflow:hidden;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.12);background:#fff">
        <img src="${src}" style="display:block;margin:-${crop.y}px 0 0 -${crop.x}px">
      </div>
      <figcaption style="margin-top:8px">${label}</figcaption>
    </figure>`;
  const page = await browser.newPage({ viewport: { width: crop.w * 2 + 96, height: crop.h + 110 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#EDEAE2;font:14px Inter,system-ui,sans-serif;color:#15302A">
    <div style="display:flex;gap:32px;padding:20px 24px 0">${panel(uri(before), `Before (${BASE})`)}${panel(uri(after), 'After (this build)')}</div>
    <div style="padding:6px 24px 16px;font-weight:600">${caption}</div>
  </body></html>`);
  await page.waitForTimeout(150);
  const height = await page.evaluate(() => Math.ceil(document.body.scrollHeight));
  await page.screenshot({ path: path.join(EV, `${SET}-before-after-${name}.png`), clip: { x: 0, y: 0, width: crop.w * 2 + 96, height } });
  await page.close();
  console.log(`wrote ${SET}-before-after-${name}.png`);
}
await browser.close();
