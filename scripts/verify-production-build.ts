/**
 * PRE-S1-C: Production Build Absence Verification Script
 *
 * Verifies that production build artifacts in dist/ contain NO `__YORI_`
 * window hook names, identifiers, or prefixes.
 *
 * Enforces AC-201-3 spirit: no hidden control surface ships in production builds.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.resolve(projectRoot, 'dist');

const KNOWN_HOOK_NAMES = [
  '__YORI_DECISION_LOG__',
  '__YORI_DECISION_LOGGER__',
  '__YORI_SET_LOCATION__',
  '__YORI_SET_PLACES_ERROR__',
  '__YORI_BUILD_NAV_URL__',
  '__YORI_GET_CURRENT_EVIDENCE_BUNDLE__',
  '__YORI_ACTION_STORE__',
  '__YORI_MODEL_INTERPRETER__',
  '__YORI_MODEL_COMMAND_INTERPRETER_CLASS__',
  '__YORI_TEST_INTERCEPT_NAV__',
  '__YORI_LAST_NAV_URL__',
  '__YORI_GEO_CALL_COUNT__',
  '__YORI_WATCH_CALL_COUNT__',
] as const;

const FORBIDDEN_PREFIX = ['__', 'YORI', '_'].join('');

function findFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    throw new Error(`Directory does not exist: ${dir}. Did you run 'npm run build' first?`);
  }
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

export function verifyProductionBuild(): {
  scannedFiles: string[];
  totalHits: number;
  hookHits: Record<string, number>;
  prefixHits: number;
} {
  console.log('===============================================================');
  console.log('🔒 YORI LIVING CONTEXT — PRODUCTION BUILD GATING AUDIT (PRE-S1-C)');
  console.log('===============================================================');

  const files = findFiles(distDir).filter(
    f => f.endsWith('.js') || f.endsWith('.css') || f.endsWith('.html')
  );

  console.log(`Scanning ${files.length} built distribution files in dist/...`);

  let totalHits = 0;
  const hookHits: Record<string, number> = {};
  for (const name of KNOWN_HOOK_NAMES) {
    hookHits[name] = 0;
  }
  let prefixHits = 0;

  for (const filePath of files) {
    const relPath = path.relative(projectRoot, filePath);
    const content = fs.readFileSync(filePath, 'utf8');

    for (const hook of KNOWN_HOOK_NAMES) {
      if (content.includes(hook)) {
        const count = content.split(hook).length - 1;
        hookHits[hook] += count;
        totalHits += count;
        console.error(`❌ Found ${count} occurrence(s) of hook '${hook}' in ${relPath}`);
      }
    }

    if (content.includes(FORBIDDEN_PREFIX)) {
      const count = content.split(FORBIDDEN_PREFIX).length - 1;
      prefixHits += count;
      totalHits += count;
      console.error(`❌ Found ${count} occurrence(s) of forbidden prefix '${FORBIDDEN_PREFIX}' in ${relPath}`);
    }
  }

  console.log('\n--- Audit Summary ---');
  console.log(`Distribution Files Scanned: ${files.length}`);
  for (const [hook, count] of Object.entries(hookHits)) {
    console.log(`  - ${hook}: ${count} hits (pass bar: 0)`);
  }
  console.log(`  - Prefix '${FORBIDDEN_PREFIX}': ${prefixHits} hits (pass bar: 0)`);
  console.log(`Total Forbidden Occurrences: ${totalHits}`);

  if (totalHits > 0) {
    console.error('\n❌ FAIL: Production build contains dev/test hook names or forbidden prefixes!');
    process.exit(1);
  }

  console.log('\n✅ PASS: Production build is completely free of __YORI_* hooks and prefixes.\n');
  return { scannedFiles: files, totalHits, hookHits, prefixHits };
}

// Execute when run as CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  verifyProductionBuild();
}
