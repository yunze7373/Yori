/**
 * Smoke Checklist & Submission Readiness Drift Guard
 *
 * Verifies that docs/architecture/SUBMISSION_READINESS.md §4:
 * 1. Uses exact environment variable names that actually exist in src/.
 * 2. Does NOT contain obsolete/incorrect variable names (ROUTING_LIVE_ENABLED, META_MODEL_API_KEY).
 * 3. Does NOT cite obsolete/non-existent ledger paths.
 * 4. Uses exact UI button labels matching source code (e.g. "Use My Location").
 * 5. Points to a valid runtime ledger file and field.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Submission Readiness & Smoke Checklist Drift Guard', () => {
  const readinessDocPath = path.resolve('docs/architecture/SUBMISSION_READINESS.md');

  function collectSrcFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectSrcFiles(fullPath));
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

  it('verifies that every env name in §4 Owner Smoke Checklist appears in src/', () => {
    const docContent = fs.readFileSync(readinessDocPath, 'utf-8');
    const checklistSection = docContent.split('## 4. One-Page Owner Smoke Checklist')[1]?.split('## 5.')[0] || '';
    expect(checklistSection.length).toBeGreaterThan(0);

    // Extract all uppercase ENV_VAR_STYLE names from code blocks or inline backticks in §4
    const envVarMatches = checklistSection.match(/\b[A-Z][A-Z0-9_]{3,}_[A-Z0-9_]+\b/g) || [];
    const uniqueEnvVars = Array.from(new Set(envVarMatches));

    // Known env vars that must appear in §4
    const expectedEnvVars = [
      'WEATHER_LIVE_ENABLED',
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
        uniqueEnvVars,
        `Expected ${expectedVar} to be documented in SUBMISSION_READINESS.md §4`
      ).toContain(expectedVar);
    }

    const srcFiles = collectSrcFiles(path.resolve('src'));
    expect(srcFiles.length).toBeGreaterThan(0);

    for (const envVar of uniqueEnvVars) {
      let foundInSrc = false;
      for (const filePath of srcFiles) {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        if (fileContent.includes(envVar)) {
          foundInSrc = true;
          break;
        }
      }
      expect(
        foundInSrc,
        `Environment variable ${envVar} from §4 was not found anywhere in src/`
      ).toBe(true);
    }
  });

  it('ensures obsolete or erroneous env names and paths do not appear anywhere in SUBMISSION_READINESS.md', () => {
    const docContent = fs.readFileSync(readinessDocPath, 'utf-8');

    // Forbidden obsolete identifiers
    expect(docContent).not.toContain('ROUTING_LIVE_ENABLED');
    expect(docContent).not.toContain('META_MODEL_API_KEY');
    expect(docContent).not.toContain('src/adapters/model/.model-ledger.json');
    expect(docContent).not.toContain('lifetimeCallsUsed');

    // Button label in §4 must be "Use My Location", never "Share Location"
    const checklistSection = docContent.split('## 4. One-Page Owner Smoke Checklist')[1]?.split('## 5.')[0] || '';
    expect(checklistSection).not.toContain('Share Location');
  });

  it('verifies the model ledger file and field referenced in §4 exist and match runtime reality', () => {
    const docContent = fs.readFileSync(readinessDocPath, 'utf-8');
    expect(docContent).toContain('.yori-runtime/model-live-ledger.json');
    expect(docContent).toContain('call_count');

    const ledgerPath = path.resolve('.yori-runtime/model-live-ledger.json');
    expect(fs.existsSync(ledgerPath), 'Ledger file must exist at .yori-runtime/model-live-ledger.json').toBe(true);

    const ledgerData = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8'));
    expect(typeof ledgerData.call_count).toBe('number');
    expect(ledgerData.call_count).toBeLessThanOrEqual(32);
  });
});
