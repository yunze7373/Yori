/**
 * Verification Script: Video Script Doc-Consistency & Spec Assertion Checker
 * Governed by Task: VIDEO-SCRIPT-SYNC (INBOX-20261030-4021C3)
 *
 * Verifies:
 * 1. Storyboard Timings & Continuity:
 *    - Dynamically parses the 7 core segment duration cells.
 *    - Checks continuity (0:00 start, seg[i].start == seg[i-1].end, 3:00 finish).
 *    - Checks dynamic sum of Duration cells == 180s.
 * 2. Spec Assertion Parsing (Non-Vacuous):
 *    - Strips comments and VIDEO_SCRIPT_FIXTURES literal fixture objects.
 *    - Parses actual expect(...) assertion matcher arguments (toHaveText, toContainText, toBe, getByText, :has-text).
 * 3. Whole-Document Quoted UI Strings:
 *    - Scans all backticked tokens across docs/submission/VIDEO_SCRIPT.md.
 *    - Applies an explicit allowlist for non-UI technical tokens (CSS selectors, URLs, env vars, git SHAs, commands, timestamps).
 *    - Cross-verifies that 100% of required UI strings are asserted in tests/e2e/video-script.spec.ts.
 * 4. Stated Test Suite Counts:
 *    - Verifies 756 unit tests, 18 goldens, 56 drills, and 268 Playwright e2e tests.
 */

import fs from 'node:fs';
import path from 'node:path';

const DOC_PATH = path.resolve(process.cwd(), 'docs/submission/VIDEO_SCRIPT.md');
const SPEC_PATH = path.resolve(process.cwd(), 'tests/e2e/video-script.spec.ts');

if (!fs.existsSync(DOC_PATH)) {
  console.error(`❌ Error: Doc file not found at ${DOC_PATH}`);
  process.exit(1);
}
if (!fs.existsSync(SPEC_PATH)) {
  console.error(`❌ Error: Spec file not found at ${SPEC_PATH}`);
  process.exit(1);
}

const docContent = fs.readFileSync(DOC_PATH, 'utf8');
const specContent = fs.readFileSync(SPEC_PATH, 'utf8');

console.log('======================================================================');
console.log('🔍 VIDEO SCRIPT DOC-CONSISTENCY & SPEC SYNCHRONIZATION AUDIT');
console.log('======================================================================\n');

let totalFailures = 0;

// ============================================================================
// 1. Storyboard Durations, Sum, and Continuity Verification
// ============================================================================
console.log('--- 1. Verifying Storyboard Durations, Continuity & 180s Sum ---');

function parseTimeSec(timeStr: string): number | null {
  const clean = timeStr.replace(/[`*]/g, '').trim();
  const m = clean.match(/^(\d+):(\d+)$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function parseDurationSec(durStr: string): number | null {
  const clean = durStr.replace(/[`*]/g, '').trim();
  const m = clean.match(/^(\d+)s$/);
  if (!m) return null;
  return parseInt(m[1], 10);
}

interface SegmentTiming {
  segNum: number;
  title: string;
  startSec: number;
  endSec: number;
  durSec: number;
}

const coreSegments: SegmentTiming[] = [];
const lines = docContent.split('\n');

for (const line of lines) {
  if (!line.startsWith('|')) continue;
  const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
  if (cells.length >= 4) {
    const segMatch = cells[0].match(/\*\*(\d+)\.\s*([^*]+)\*\*/);
    if (segMatch) {
      const segNum = parseInt(segMatch[1], 10);
      const title = segMatch[2].trim();
      const startSec = parseTimeSec(cells[1]);
      const endSec = parseTimeSec(cells[2]);
      const durSec = parseDurationSec(cells[3]);

      if (startSec !== null && endSec !== null && durSec !== null) {
        coreSegments.push({ segNum, title, startSec, endSec, durSec });
      }
    }
  }
}

if (coreSegments.length !== 7) {
  console.error(`❌ FAIL: Expected 7 core segments in Storyboard table, found ${coreSegments.length}`);
  totalFailures++;
} else {
  console.log(`  Found all 7 core segments in Storyboard table.`);
}

let dynamicDurationSum = 0;
let timingContinuityValid = true;

for (let i = 0; i < coreSegments.length; i++) {
  const seg = coreSegments[i];
  dynamicDurationSum += seg.durSec;

  // Check that endSec - startSec equals parsed duration
  if (seg.endSec - seg.startSec !== seg.durSec) {
    console.error(
      `  ❌ Timing mismatch in Segment ${seg.segNum} (${seg.title}): end (${seg.endSec}s) - start (${seg.startSec}s) != duration (${seg.durSec}s)`
    );
    timingContinuityValid = false;
    totalFailures++;
  }

  // Check continuity
  if (i === 0) {
    if (seg.startSec !== 0) {
      console.error(`  ❌ Segment 1 start time is not 0:00 (got ${seg.startSec}s)`);
      timingContinuityValid = false;
      totalFailures++;
    }
  } else {
    const prevSeg = coreSegments[i - 1];
    if (seg.startSec !== prevSeg.endSec) {
      console.error(
        `  ❌ Continuity gap between Segment ${prevSeg.segNum} (ends at ${prevSeg.endSec}s) and Segment ${seg.segNum} (starts at ${seg.startSec}s)`
      );
      timingContinuityValid = false;
      totalFailures++;
    }
  }

  console.log(
    `  Segment ${seg.segNum} [${seg.startSec}s -> ${seg.endSec}s] (${seg.durSec}s): ${seg.title}`
  );
}

if (coreSegments.length > 0) {
  const lastSeg = coreSegments[coreSegments.length - 1];
  if (lastSeg.endSec !== 180) {
    console.error(`  ❌ Last segment does not end at 3:00 (180s) (got ${lastSeg.endSec}s)`);
    timingContinuityValid = false;
    totalFailures++;
  }
}

console.log(`  Dynamic sum of duration cells: ${dynamicDurationSum}s (expected 180s)`);
if (dynamicDurationSum !== 180) {
  console.error(`❌ FAIL: Dynamic sum of storyboard durations is ${dynamicDurationSum}s != 180s`);
  totalFailures++;
} else if (timingContinuityValid) {
  console.log('✅ PASS: Storyboard durations dynamically sum to 180s with flawless 0:00..3:00 continuity.\n');
}

// ============================================================================
// 2. Extract Real Assertions from tests/e2e/video-script.spec.ts
// ============================================================================
console.log('--- 2. Extracting Real Spec Assertions (Non-Vacuous Parser) ---');

// Strip multi-line and single-line comments
const cleanSpec = specContent
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

// Strip VIDEO_SCRIPT_FIXTURES literal fixture object to prevent vacuous fixture matches
const testCodeOnly = cleanSpec.replace(
  /export\s+const\s+VIDEO_SCRIPT_FIXTURES[\s\S]*?;\s*\n/g,
  ''
);

const assertedStrings = new Set<string>();

// (a) expect(...).(toHaveText|toContainText|toBe|toContain)(...)
const matcherRegex = /expect\([\s\S]*?\)\s*\.\s*(?:toHaveText|toContainText|toBe|toContain)\s*\(\s*(['"`])([\s\S]*?)\1\s*\)/g;
for (const match of testCodeOnly.matchAll(matcherRegex)) {
  const str = match[2].trim();
  if (str) assertedStrings.add(str);
}

// (b) getByText(...)
const getByTextRegex = /getByText\s*\(\s*(['"`])([\s\S]*?)\1\s*\)/g;
for (const match of testCodeOnly.matchAll(getByTextRegex)) {
  const str = match[2].trim();
  if (str) assertedStrings.add(str);
}

// (c) locator(':has-text("...")')
const hasTextRegex = /:has-text\(\s*\\?['"`]([\s\S]*?)\\?['"`]\s*\)/g;
for (const match of testCodeOnly.matchAll(hasTextRegex)) {
  const str = match[1].trim();
  if (str) assertedStrings.add(str);
}

console.log(`  Discovered ${assertedStrings.size} unique assertion arguments in spec test blocks.`);
if (assertedStrings.size < 40) {
  console.error(`❌ FAIL: Expected at least 40 parsed assertions, found only ${assertedStrings.size}`);
  totalFailures++;
} else {
  console.log(`✅ PASS: Extracted ${assertedStrings.size} non-vacuous assertion arguments.\n`);
}

// ============================================================================
// 3. Extract Quoted UI Strings Across Entire Document with Allowlist
// ============================================================================
console.log('--- 3. Extracting and Auditing Quoted UI Strings Across VIDEO_SCRIPT.md ---');

function isNonUiToken(token: string): boolean {
  const t = token.trim();

  // (1) Selectors (CSS IDs, classes, combinators, attributes)
  if (
    /^[#.][\w-]/.test(t) ||
    t.includes(' > ') ||
    t.includes(':nth-child') ||
    t.includes(':first-child') ||
    t.includes(':has-text') ||
    /\[.*\]/.test(t)
  ) {
    return true;
  }

  // (2) URLs, web paths, routes, ports, files
  if (
    t.startsWith('http://') ||
    t.startsWith('https://') ||
    t.startsWith('/') ||
    t.startsWith('?') ||
    t.startsWith(':') ||
    /\.(ts|js|json|md|png|woff2)$/.test(t) ||
    t.includes('tests/e2e') ||
    t.includes('docs/evidence') ||
    t.includes('src/adapters')
  ) {
    return true;
  }

  // (3) CLI commands, bash scripts, env vars, JS runtime APIs
  if (
    t.startsWith('npm ') ||
    t.startsWith('git ') ||
    t.includes('localStorage') ||
    t.includes('MODEL_API_KEY') ||
    t.includes('XMEMO_') ||
    t.includes('WEATHER_') ||
    t.includes('VITE_') ||
    t.includes('@font-face')
  ) {
    return true;
  }

  // (4) Timestamps, ranges, and durations
  if (
    /^\+?\d+:\d+(\s*[–-]\s*\+?\d+:\d+)?$/.test(t) ||
    /^\+?\d+s(\s*\(max\s*\d+s\))?$/.test(t) ||
    /^\(\+?\d+:\d+\)$/.test(t)
  ) {
    return true;
  }

  // (5) Git SHAs, invariants, spec citations, plan IDs, technical labels
  if (
    /^[0-9a-f]{7,40}(\.\.\.)?$/i.test(t) ||
    /^video-script\.spec\.ts:\d+/.test(t) ||
    /^(INV-|AC-|G-|PRE-|YORI_)/.test(t)
  ) {
    return true;
  }
  if (
    [
      '[REFINE]',
      '[REASON]',
      'decision_command',
      'muse-spark-1.3',
      'Core Total',
      '180s',
      'Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget',
      'Optional V5 Extension: Dynamic Fuel & Straight-Line Distance Assertion',
    ].includes(t)
  ) {
    return true;
  }

  return false;
}

const allBacktickedTokens = [...docContent.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
const requiredUiStrings = new Set<string>();

for (const rawToken of allBacktickedTokens) {
  if (!isNonUiToken(rawToken)) {
    const cleaned = rawToken.trim().replace(/^["']|["']$/g, '');
    if (cleaned) {
      requiredUiStrings.add(cleaned);
    }
  }
}

// Also ensure every quoted string in the Verbatim UI Quotes Table is included
const tableLines = docContent
  .split('\n')
  .filter((line) => line.startsWith('| Part ') || line.startsWith('| Optional '));

for (const line of tableLines) {
  const parts = line.split('|').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 4) {
    const quotedText = parts[1].replace(/^`|`$/g, '').replace(/^["']|["']$/g, '').trim();
    if (quotedText) {
      requiredUiStrings.add(quotedText);
    }
  }
}

console.log(`  Identified ${requiredUiStrings.size} required UI strings across entire document.`);

const assertedArray = Array.from(assertedStrings);
let missingAssertions = 0;

for (const reqStr of Array.from(requiredUiStrings).sort()) {
  const isAsserted = assertedArray.some(
    (a) => a === reqStr || a.includes(reqStr)
  );
  if (!isAsserted) {
    console.error(`  ❌ UNASSERTED UI STRING: "${reqStr}"`);
    missingAssertions++;
    totalFailures++;
  } else {
    console.log(`  ✅ Asserted: "${reqStr}"`);
  }
}

if (missingAssertions === 0) {
  console.log(`✅ PASS: 100% of ${requiredUiStrings.size} required UI strings are asserted in spec.\n`);
} else {
  console.error(`❌ FAIL: Found ${missingAssertions} unasserted UI strings.\n`);
}

// ============================================================================
// 4. Stated Test Suite Counts Consistency
// ============================================================================
console.log('--- 4. Checking Stated Test Counts in VIDEO_SCRIPT.md ---');

const countChecks = [
  { label: 'Unit tests (914)', regex: /914 unit tests across 40 files/ },
  { label: 'Golden fixtures (18)', regex: /18 golden fixtures/ },
  { label: 'Degradation drills (56)', regex: /56 drills/ },
  { label: 'Playwright e2e (441)', regex: /441 Playwright e2e tests across 33 files/ },
];

for (const check of countChecks) {
  if (check.regex.test(docContent)) {
    console.log(`  ✅ Confirmed: ${check.label}`);
  } else {
    console.error(`  ❌ FAILED: ${check.label} not found in doc.`);
    totalFailures++;
  }
}

// ============================================================================
// Final Verdict
// ============================================================================
console.log('\n======================================================================');
if (totalFailures > 0) {
  console.error(`❌ VIDEO SCRIPT SYNC AUDIT FAILED with ${totalFailures} error(s).`);
  console.log('======================================================================\n');
  process.exit(1);
} else {
  console.log(
    `✅ VIDEO SCRIPT SYNC AUDIT PASSED: ${coreSegments.length} segments, ${requiredUiStrings.size} UI strings, and all test counts synchronized!`
  );
  console.log('======================================================================\n');
  process.exit(0);
}
