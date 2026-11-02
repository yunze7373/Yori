/**
 * Smoke Checklist & Submission Readiness Drift Guard
 *
 * Verifies that docs/architecture/SUBMISSION_READINESS.md:
 * 1. Uses exact environment variable names that actually exist in non-test src/.
 * 2. Does NOT contain obsolete/incorrect variable names or fabricated strings.
 * 3. Asserts the model ledger path (.yori-runtime/model-live-ledger.json) and field (call_count)
 *    are defined in src/adapters/model/server-proxy.ts without accessing gitignored runtime state.
 * 4. Ensures all quoted on-screen strings and selector IDs in §4 appear verbatim in non-test src/.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Submission Readiness & Smoke Checklist Drift Guard', () => {
  const readinessDocPath = path.resolve('docs/architecture/SUBMISSION_READINESS.md');

  function collectNonTestSrcFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectNonTestSrcFiles(fullPath));
      } else if (
        (entry.name.endsWith('.ts') || entry.name.endsWith('.js') || entry.name.endsWith('.json')) &&
        !entry.name.endsWith('.test.ts') &&
        !entry.name.endsWith('.spec.ts')
      ) {
        results.push(fullPath);
      }
    }
    return results;
  }

  it('ensures docs/architecture/SUBMISSION_READINESS.md exists', () => {
    expect(fs.existsSync(readinessDocPath), 'SUBMISSION_READINESS.md must exist').toBe(true);
  });

  it('verifies that every env name in §4 Owner Smoke Checklist appears in non-test src/', () => {
    const docContent = fs.readFileSync(readinessDocPath, 'utf-8');
    const checklistSection = docContent.split('## 4. One-Page Owner Smoke Checklist')[1]?.split('## 5.')[0] || '';
    expect(checklistSection.length).toBeGreaterThan(0);

    // Expected env vars that must appear in §4
    const expectedEnvVars = [
      'WEATHER_LIVE_ENABLED',
      'DEMO_CITY_NAME',
      'DEMO_CITY_LAT',
      'DEMO_CITY_LON',
      'DEMO_CITY_TIMEZONE',
      'PLACES_LIVE_ENABLED',
      'ROUTE_LIVE_ENABLED',
      'OSRM_FOOT_BASE_URL',
      'CALENDAR_LIVE_ENABLED',
      'CALENDAR_ICS_URL',
      'GEOCODE_LIVE_ENABLED',
      'MODEL_LIVE_ENABLED',
      'MODEL_API_KEY',
    ];

    for (const expectedVar of expectedEnvVars) {
      expect(
        checklistSection,
        `Expected ${expectedVar} to be documented in SUBMISSION_READINESS.md §4`
      ).toContain(expectedVar);
    }

    const nonTestSrcFiles = collectNonTestSrcFiles(path.resolve('src'));
    expect(nonTestSrcFiles.length).toBeGreaterThan(0);

    for (const envVar of expectedEnvVars) {
      let foundInSrc = false;
      for (const filePath of nonTestSrcFiles) {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        if (fileContent.includes(envVar)) {
          foundInSrc = true;
          break;
        }
      }
      expect(
        foundInSrc,
        `Environment variable ${envVar} from §4 was not found in non-test src/`
      ).toBe(true);
    }
  });

  it('verifies all expected on-screen strings and selector IDs in §4 appear verbatim in non-test src/', () => {
    const docContent = fs.readFileSync(readinessDocPath, 'utf-8');
    const checklistSection = docContent.split('## 4. One-Page Owner Smoke Checklist')[1]?.split('## 5.')[0] || '';
    expect(checklistSection.length).toBeGreaterThan(0);

    const nonTestSrcFiles = collectNonTestSrcFiles(path.resolve('src'));
    const concatenatedSrc = nonTestSrcFiles.map((p) => fs.readFileSync(p, 'utf-8')).join('\n');

    // On-screen UI strings the owner is asked to confirm in §4
    const expectedUiStrings = [
      'Location Needed',
      'Use My Location',
      'Location Denied',
      'Location access denied by user',
      'Weather: Off',
      'Live weather is off (owner setting)',
      'Not connected · tap Connect to sign in',
      'Nearby places · not enabled (owner setting)',
      'provider disabled',
      'Offline fallback · deterministic',
      'Meta model · live',
    ];

    for (const str of expectedUiStrings) {
      expect(checklistSection, `SUBMISSION_READINESS.md §4 should reference on-screen string: ${str}`).toContain(str);
      expect(
        concatenatedSrc.includes(str),
        `On-screen string "${str}" referenced in §4 does not exist in non-test src/`
      ).toBe(true);
    }

    // Selector IDs referenced in §4
    const expectedSelectorIds = [
      '#quiet-title',
      '#btn-request-location',
      '#living-header-chip',
      '#model-status-pill',
      '#desktop-nav-settings',
      '#connectors-page',
      '#btn-header-avatar',
      '#btn-me-connectors',
    ];

    for (const selectorId of expectedSelectorIds) {
      expect(checklistSection, `SUBMISSION_READINESS.md §4 should reference selector: ${selectorId}`).toContain(selectorId);
      const bareId = selectorId.replace('#', '');
      expect(
        concatenatedSrc.includes(bareId),
        `Selector ID "${bareId}" referenced in §4 does not exist in non-test src/`
      ).toBe(true);
    }
  });

  it('ensures obsolete, erroneous, or fabricated identifiers and phrases do not appear in SUBMISSION_READINESS.md', () => {
    const docContent = fs.readFileSync(readinessDocPath, 'utf-8');

    // Forbidden obsolete identifiers
    expect(docContent).not.toContain('ROUTING_LIVE_ENABLED');
    expect(docContent).not.toContain('META_MODEL_API_KEY');
    expect(docContent).not.toContain('src/adapters/model/.model-ledger.json');
    expect(docContent).not.toContain('lifetimeCallsUsed');

    // Forbidden fabricated on-screen phrases identified in review
    expect(docContent).not.toContain('Walking route · not enabled');
    expect(docContent).not.toContain('Weather: Off (owner setting)');
    expect(docContent).not.toContain('Not connected · tap Connect to sign in via PKCE');
    expect(docContent).not.toContain('Clear now');
    expect(docContent).not.toContain('browser settings instructions');

    // Button label must be "Use My Location", never "Share Location"
    const checklistSection = docContent.split('## 4. One-Page Owner Smoke Checklist')[1]?.split('## 5.')[0] || '';
    expect(checklistSection).not.toContain('Share Location');
  });

  it('verifies the model ledger definition in server-proxy.ts statically without accessing gitignored runtime state', () => {
    const docContent = fs.readFileSync(readinessDocPath, 'utf-8');
    expect(docContent).toContain('.yori-runtime/model-live-ledger.json');
    expect(docContent).toContain('call_count');

    const serverProxyPath = path.resolve('src/adapters/model/server-proxy.ts');
    expect(fs.existsSync(serverProxyPath), 'server-proxy.ts must exist').toBe(true);

    const proxySource = fs.readFileSync(serverProxyPath, 'utf-8');
    expect(proxySource).toContain('.yori-runtime');
    expect(proxySource).toContain('model-live-ledger.json');
    expect(proxySource).toContain('call_count');
  });
});
