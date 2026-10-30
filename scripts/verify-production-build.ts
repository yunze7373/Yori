/**
 * PRE-S1-C: Production Build Absence Verification Script
 *
 * Verifies that the shipping production build artifacts in dist/ contain NO:
 * 1. `__YORI_` window hook names or prefixes.
 * 2. Hook suffix tokens (SET_LOCATION, ACTION_STORE, etc.).
 * 3. URL forcing keys (geo_consent, etc.).
 *
 * Enforces AC-201-3 spirit: no hidden control surface ships in production builds.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
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

const FORBIDDEN_PREFIX = '__YORI_';

const FORBIDDEN_SUFFIX_TOKENS = [
  'SET_LOCATION',
  'SET_PLACES_ERROR',
  'BUILD_NAV_URL',
  'GET_CURRENT_EVIDENCE_BUNDLE',
  'ACTION_STORE',
  'TEST_INTERCEPT_NAV',
  'LAST_NAV_URL',
] as const;

const FORBIDDEN_URL_FORCING_KEYS = [
  'geo_consent',
] as const;

const FORBIDDEN_EXTERNAL_FONT_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
] as const;

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
  suffixHits: Record<string, number>;
  forcingHits: Record<string, number>;
  fontHostHits: Record<string, number>;
  prefixHits: number;
} {
  console.log('===============================================================');
  console.log('🔒 YORI LIVING CONTEXT — PRODUCTION BUILD GATING AUDIT (PRE-S1-C & UIFONT)');
  console.log('===============================================================');

  console.log('Building clean shipping bundle: npm run build ...');
  execSync('npm run build', { cwd: projectRoot, stdio: 'inherit' });

  const files = findFiles(distDir).filter(
    f => f.endsWith('.js') || f.endsWith('.css') || f.endsWith('.html')
  );

  console.log(`\nScanning ${files.length} built distribution files in dist/...`);

  let totalHits = 0;
  const hookHits: Record<string, number> = {};
  for (const name of KNOWN_HOOK_NAMES) {
    hookHits[name] = 0;
  }
  let prefixHits = 0;

  const suffixHits: Record<string, number> = {};
  for (const token of FORBIDDEN_SUFFIX_TOKENS) {
    suffixHits[token] = 0;
  }

  const forcingHits: Record<string, number> = {};
  for (const key of FORBIDDEN_URL_FORCING_KEYS) {
    forcingHits[key] = 0;
  }

  const fontHostHits: Record<string, number> = {};
  for (const host of FORBIDDEN_EXTERNAL_FONT_HOSTS) {
    fontHostHits[host] = 0;
  }

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

    for (const suffix of FORBIDDEN_SUFFIX_TOKENS) {
      if (content.includes(suffix)) {
        const count = content.split(suffix).length - 1;
        suffixHits[suffix] += count;
        totalHits += count;
        console.error(`❌ Found ${count} occurrence(s) of suffix token '${suffix}' in ${relPath}`);
      }
    }

    for (const key of FORBIDDEN_URL_FORCING_KEYS) {
      if (content.includes(key)) {
        const count = content.split(key).length - 1;
        forcingHits[key] += count;
        totalHits += count;
        console.error(`❌ Found ${count} occurrence(s) of URL forcing key '${key}' in ${relPath}`);
      }
    }

    for (const host of FORBIDDEN_EXTERNAL_FONT_HOSTS) {
      if (content.includes(host)) {
        const count = content.split(host).length - 1;
        fontHostHits[host] += count;
        totalHits += count;
        console.error(`❌ Found ${count} occurrence(s) of external font host '${host}' in ${relPath}`);
      }
    }
  }

  // Audit self-hosted fonts in dist/fonts/
  const fontsDistDir = path.join(distDir, 'fonts');
  const fontFiles = fs.existsSync(fontsDistDir) ? fs.readdirSync(fontsDistDir) : [];
  const woff2Files = fontFiles.filter(f => f.endsWith('.woff2'));
  const licenseFiles = fontFiles.filter(f => f.startsWith('LICENSE'));

  console.log('\n--- Audit Summary ---');
  console.log(`Distribution Files Scanned: ${files.length}`);
  console.log('1. Known Hook Names:');
  for (const [hook, count] of Object.entries(hookHits)) {
    console.log(`   - ${hook}: ${count} hits (pass bar: 0)`);
  }
  console.log(`2. Prefix '${FORBIDDEN_PREFIX}': ${prefixHits} hits (pass bar: 0)`);
  console.log('3. Suffix Tokens:');
  for (const [suffix, count] of Object.entries(suffixHits)) {
    console.log(`   - ${suffix}: ${count} hits (pass bar: 0)`);
  }
  console.log('4. URL Forcing Keys:');
  for (const [key, count] of Object.entries(forcingHits)) {
    console.log(`   - ${key}: ${count} hits (pass bar: 0)`);
  }
  console.log('5. External Font Hosts:');
  for (const [host, count] of Object.entries(fontHostHits)) {
    console.log(`   - ${host}: ${count} hits (pass bar: 0)`);
  }
  console.log(`6. Self-Hosted Fonts: ${woff2Files.length} woff2 files, ${licenseFiles.length} license files in dist/fonts/`);
  console.log(`Total Forbidden Occurrences: ${totalHits}`);

  if (totalHits > 0) {
    console.error('\n❌ FAIL: Shipping production build contains dev/test hooks, forcing keys, or external font hosts!');
    process.exit(1);
  }

  if (woff2Files.length === 0 || licenseFiles.length === 0) {
    console.error('\n❌ FAIL: Shipping production build is missing self-hosted woff2 fonts or OFL licenses!');
    process.exit(1);
  }

  console.log('\n✅ PASS: Shipping production build is 100% free of __YORI_* hooks, forcing keys, and external font hosts.\n');
  return { scannedFiles: files, totalHits, hookHits, suffixHits, forcingHits, fontHostHits, prefixHits };
}

// Execute when run as CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  verifyProductionBuild();
}
