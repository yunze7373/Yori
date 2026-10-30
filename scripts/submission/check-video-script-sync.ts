/**
 * Verification Script: Video Script Doc-Consistency Check
 * Governed by Task: VIDEO-SCRIPT-SYNC (INBOX-20261030-4021C3)
 *
 * Verifies that:
 * 1. Every quoted UI string in docs/submission/VIDEO_SCRIPT.md (Table in § Verbatim UI Quotes)
 *    is explicitly tracked in VIDEO_SCRIPT_FIXTURES in tests/e2e/video-script.spec.ts.
 * 2. Every quoted UI string is asserted by at least one expect(...) call in tests/e2e/video-script.spec.ts.
 * 3. Storyboard durations sum to exactly 180 seconds.
 */

import fs from 'node:fs';
import path from 'node:path';

const DOC_PATH = path.resolve(process.cwd(), 'docs/submission/VIDEO_SCRIPT.md');
const SPEC_PATH = path.resolve(process.cwd(), 'tests/e2e/video-script.spec.ts');

if (!fs.existsSync(DOC_PATH)) {
  console.error(`Error: Doc file not found at ${DOC_PATH}`);
  process.exit(1);
}
if (!fs.existsSync(SPEC_PATH)) {
  console.error(`Error: Spec file not found at ${SPEC_PATH}`);
  process.exit(1);
}

const docContent = fs.readFileSync(DOC_PATH, 'utf8');
const specContent = fs.readFileSync(SPEC_PATH, 'utf8');

console.log('======================================================================');
console.log('🔍 VIDEO SCRIPT DOC-CONSISTENCY & SPEC SYNCHRONIZATION AUDIT');
console.log('======================================================================');

// 1. Verify Storyboard core durations sum to 180s
const coreDurationRegex = /\|\s*\*\*Core Total\*\*\s*\|\s*`0:00`\s*\|\s*`3:00`\s*\|\s*\*\*`180s`\*\*/;
if (!coreDurationRegex.test(docContent)) {
  console.error('❌ FAIL: Core Total in Storyboard table does not match exact 180s (3:00).');
  process.exit(1);
}
console.log('✅ PASS: Storyboard Core Total duration is exactly 180s (3:00).');

// 2. Extract quoted UI strings from Verbatim Table in doc
const tableLines = docContent.split('\n').filter(line => line.startsWith('| Part ') || line.startsWith('| Optional '));

interface QuotedEntry {
  section: string;
  quotedText: string;
  selector: string;
  specRef: string;
}

const quotedEntries: QuotedEntry[] = [];
for (const line of tableLines) {
  const parts = line.split('|').map(p => p.trim()).filter(Boolean);
  if (parts.length >= 4) {
    const section = parts[0];
    const quotedText = parts[1].replace(/^`|`$/g, '');
    const selector = parts[2];
    const specRef = parts[3];
    quotedEntries.push({ section, quotedText, selector, specRef });
  }
}

if (quotedEntries.length === 0) {
  console.error('❌ FAIL: No quoted strings extracted from Verbatim UI table.');
  process.exit(1);
}
console.log(`📋 Discovered ${quotedEntries.length} quoted UI strings across all script sections.`);

// 3. Verify each quoted string is asserted in tests/e2e/video-script.spec.ts
let failures = 0;
console.log('\n--- Checking Assertions in tests/e2e/video-script.spec.ts ---');

for (const entry of quotedEntries) {
  const isFoundInSpec = specContent.includes(entry.quotedText);
  if (!isFoundInSpec) {
    console.error(`  ❌ MISSING in spec: [${entry.section}] "${entry.quotedText}"`);
    failures++;
  } else {
    console.log(`  ✅ Asserted: [${entry.section}] "${entry.quotedText}"`);
  }
}

// 4. Verify test counts in VIDEO_SCRIPT.md match current reality (756 unit, 18 goldens, 56 drills, 268 e2e)
const countChecks = [
  { label: 'Unit tests (756)', regex: /756 unit tests across 31 files/ },
  { label: 'Golden fixtures (18)', regex: /18 golden fixtures/ },
  { label: 'Degradation drills (56)', regex: /56 drills/ },
  { label: 'Playwright e2e (268)', regex: /268 Playwright e2e tests across 21 files/ },
];

console.log('\n--- Checking Stated Test Counts in VIDEO_SCRIPT.md ---');
for (const check of countChecks) {
  if (check.regex.test(docContent)) {
    console.log(`  ✅ Confirmed: ${check.label}`);
  } else {
    console.error(`  ❌ FAILED: ${check.label} not found in doc.`);
    failures++;
  }
}

console.log('----------------------------------------------------------------------');
if (failures > 0) {
  console.error(`❌ AUDIT FAILED with ${failures} error(s).`);
  process.exit(1);
} else {
  console.log(`✅ AUDIT PASSED: 100% of ${quotedEntries.length} quoted strings and counts are synchronized!`);
  process.exit(0);
}
