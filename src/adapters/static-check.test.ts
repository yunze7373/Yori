/**
 * Static Audit & Security Integrity Checks
 * Governed by Acceptance Criteria AC-106-3 & Invariants INV-107, HB-2, HB-3.
 *
 * Verifies:
 * 1. Zero API key / secret token literals or MODEL_API_KEY literal assignments exist in src/ or dist/.
 * 2. MemoryPort write-back strictly rejects non-confirmed facts.
 * 3. Never attempts to read ~/.config/muse/auth.json.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { LocalMemoryAdapter, XMemoRemoteAdapter } from './xmemo/index.js';
import { createMemoryFact } from '../core/contracts/index.js';
import { isFixtureCoord } from '../../scripts/publish/privacy-scan.js';

describe('Static Security Check (AC-106-3, HB-2, HB-3)', () => {
  function collectFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) {
      return [];
    }
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectFiles(fullPath));
      } else if (
        (entry.name.endsWith('.ts') ||
          entry.name.endsWith('.js') ||
          entry.name.endsWith('.json')) &&
        !entry.name.endsWith('.test.ts') &&
        !entry.name.endsWith('.spec.ts')
      ) {
        results.push(fullPath);
      }
    }
    return results;
  }

  it('ensures src/ contains zero hardcoded API key or secret token literals', () => {
    const srcFiles = collectFiles(path.resolve('src'));
    expect(srcFiles.length).toBeGreaterThan(0);

    // Regex patterns for potential secret tokens / keys
    const secretPatterns = [
      /\bsk-[a-zA-Z0-9_-]{20,}\b/,           // OpenAI / Meta standard keys
      /\bghp_[a-zA-Z0-9]{30,}\b/,             // GitHub personal tokens
      /\beyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]{20,}\b/, // JWT tokens
      /MODEL_API_KEY\s*[:=]\s*['"][a-zA-Z0-9_-]{10,}['"]/, // Hardcoded key value
      /META_API_KEY\s*[:=]\s*['"][a-zA-Z0-9_-]{10,}['"]/,
      /XMEMO_API_KEY\s*[:=]\s*['"][a-zA-Z0-9_-]{10,}['"]/,
      /XMEMO_CLIENT_SECRET\s*[:=]\s*['"][a-zA-Z0-9_-]{10,}['"]/,
      /client_secret\s*[:=]\s*['"][a-zA-Z0-9_-]{10,}['"]/,
    ];

    for (const filePath of srcFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const pattern of secretPatterns) {
        const match = pattern.exec(content);
        expect(
          match,
          `Potential hardcoded secret or API key found in ${path.relative(process.cwd(), filePath)}: ${match?.[0]}`
        ).toBeNull();
      }
    }
  });

  it('ensures dist/ (if exists) contains zero hardcoded API key or secret token literals', () => {
    const distPath = path.resolve('dist');
    if (!fs.existsSync(distPath)) {
      return; // dist not built yet
    }
    const distFiles = collectFiles(distPath);
    for (const filePath of distFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).not.toMatch(/\bsk-[a-zA-Z0-9_-]{20,}\b/);
      expect(content).not.toMatch(/MODEL_API_KEY\s*[:=]\s*['"][a-zA-Z0-9_-]{10,}['"]/);
    }
  });

  it('ensures code never references or reads ~/.config/muse/auth.json (Section 9.1)', () => {
    const srcFiles = collectFiles(path.resolve('src'));
    for (const filePath of srcFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(
        content.includes('.config/muse'),
        `Forbidden muse auth config reference found in ${filePath}`
      ).toBe(false);
    }
  });

  it('fails if MemoryPort write-back accepts non-confirmed facts (AC-106-3)', async () => {
    const localAdapter = new LocalMemoryAdapter();
    const remoteAdapter = new XMemoRemoteAdapter('mock-auth');

    const pendingFact = createMemoryFact(
      'taste',
      'ramen',
      'pending',
      { source: 'user_feedback', recordedAt: '2026-10-28T10:00:00Z' },
      '2026-10-28T10:00:00Z'
    );

    const rejectedFact = createMemoryFact(
      'taste',
      'ramen',
      'rejected',
      { source: 'user_feedback', recordedAt: '2026-10-28T10:00:00Z' },
      '2026-10-28T10:00:00Z'
    );

    await expect(localAdapter.writeBack(pendingFact)).rejects.toThrow();
    await expect(localAdapter.writeBack(rejectedFact)).rejects.toThrow();

    await expect(remoteAdapter.writeBack(pendingFact)).rejects.toThrow();
    await expect(remoteAdapter.writeBack(rejectedFact)).rejects.toThrow();
  });

  it('ensures zero token or credential storage in browser storage APIs (HB-3, AC-203-2)', () => {
    const srcFiles = collectFiles(path.resolve('src'));
    const forbiddenPatterns = [
      /localStorage\.setItem\([^)]*(?:token|secret|auth|bearer|code_verifier)/i,
      /sessionStorage\.setItem\([^)]*(?:token|secret|auth|bearer|code_verifier)/i,
      /document\.cookie\s*=\s*[^;]*(?:token|secret|auth|bearer)/i,
    ];

    for (const filePath of srcFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const pattern of forbiddenPatterns) {
        const match = pattern.exec(content);
        expect(
          match,
          `Forbidden client-side token storage detected in ${path.relative(process.cwd(), filePath)}: ${match?.[0]}`
        ).toBeNull();
      }
    }
  });

  it('ensures navigator.geolocation is referenced ONLY in geolocation-adapter.ts and watchPosition is absent repo-wide (AC-211-1, AC-211-2)', () => {
    const srcFiles = collectFiles(path.resolve('src'));
    const allowedAdapterPath = path.resolve('src/adapters/providers/geolocation-adapter.ts');

    for (const filePath of srcFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');

      // 1. watchPosition is strictly forbidden repo-wide
      const watchMatch = /watchPosition/i.exec(content);
      expect(
        watchMatch,
        `Forbidden watchPosition reference detected in ${path.relative(process.cwd(), filePath)}: ${watchMatch?.[0]}`
      ).toBeNull();

      // 2. navigator.geolocation and getCurrentPosition are permitted ONLY inside geolocation-adapter.ts
      if (filePath !== allowedAdapterPath) {
        const geoMatch = /navigator\.geolocation/i.exec(content);
        expect(
          geoMatch,
          `Forbidden navigator.geolocation reference detected in ${path.relative(process.cwd(), filePath)}: ${geoMatch?.[0]}`
        ).toBeNull();

        const currentPosMatch = /getCurrentPosition/i.exec(content);
        expect(
          currentPosMatch,
          `Forbidden getCurrentPosition reference detected in ${path.relative(process.cwd(), filePath)}: ${currentPosMatch?.[0]}`
        ).toBeNull();
      }
    }
  });

  it('ensures outgoing weather requests send only the configured demo-city coordinates (AC-204-2)', async () => {
    const { OpenMeteoWeatherAdapter, DEFAULT_DEMO_CITY } = await import('./providers/index.js');
    let capturedUrl = '';
    const mockFetch = (async (url: string) => {
      capturedUrl = url;
      return {
        ok: true,
        json: async () => ({ current: { time: '2026-10-28T12:00', weather_code: 0, temperature_2m: 20, precipitation: 0 } }),
      } as any;
    }) as unknown as typeof fetch;

    const adapter = new OpenMeteoWeatherAdapter({
      enabled: true,
      coordinate: DEFAULT_DEMO_CITY,
      fetchFn: mockFetch,
    });

    await adapter.signals();

    const parsed = new URL(capturedUrl);
    expect(parsed.searchParams.get('latitude')).toBe(String(DEFAULT_DEMO_CITY.latitude));
    expect(parsed.searchParams.get('longitude')).toBe(String(DEFAULT_DEMO_CITY.longitude));
    expect(parsed.searchParams.get('latitude')).toBe('37.7749');
    expect(parsed.searchParams.get('longitude')).toBe('-122.4194');
  });

  it('ensures zero real calendar/route provider code or live GPS paths exist in src (PH-002 D2, AC-204-2)', () => {
    const srcFiles = collectFiles(path.resolve('src'));
    const allowedAdapterPath = path.resolve('src/adapters/providers/geolocation-adapter.ts');
    const allowedRouteAdapters = new Set([
      path.resolve('src/adapters/providers/osrm-route-adapter.ts'),
      path.resolve('src/adapters/providers/ors-route-adapter.ts'),
    ]);
    const forbiddenPatterns = [
      /googleapis\.com\/calendar/i,
      /graph\.microsoft\.com.*calendar/i,
      /api\.mapbox\.com\/directions/i,
      /router\.project-osrm\.org/i,
      /api\.openrouteservice\.org/i,
      /maps\.googleapis\.com\/maps\/api\/directions/i,
      /watchPosition/i,
    ];

    for (const filePath of srcFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const isRouteAdapter = allowedRouteAdapters.has(filePath);

      for (const pattern of forbiddenPatterns) {
        if (
          isRouteAdapter &&
          (pattern.source.includes('osrm') || pattern.source.includes('openrouteservice'))
        ) {
          continue;
        }
        const match = pattern.exec(content);
        expect(
          match,
          `Forbidden real calendar/route/GPS provider integration found in ${path.relative(process.cwd(), filePath)}: ${match?.[0]}`
        ).toBeNull();
      }

      if (filePath !== allowedAdapterPath) {
        const geoMatch = /navigator\.geolocation/i.exec(content);
        expect(
          geoMatch,
          `Forbidden navigator.geolocation reference detected in ${path.relative(process.cwd(), filePath)}: ${geoMatch?.[0]}`
        ).toBeNull();
      }
    }
  });

  it('ensures zero external font host references in src/, index.html, and dist/ (UIFONT)', () => {
    const forbiddenFontHosts = [
      'fonts.googleapis.com',
      'fonts.gstatic.com',
    ];

    // Check index.html
    const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf-8');
    for (const host of forbiddenFontHosts) {
      expect(indexHtml).not.toContain(host);
    }

    // Check src/
    const srcFiles = collectFiles(path.resolve('src'));
    for (const filePath of srcFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const host of forbiddenFontHosts) {
        expect(content, `External font host '${host}' found in ${path.relative(process.cwd(), filePath)}`).not.toContain(host);
      }
    }

    // Check dist/ if built
    const distPath = path.resolve('dist');
    if (fs.existsSync(distPath)) {
      const distFiles = collectFiles(distPath);
      for (const filePath of distFiles) {
        const content = fs.readFileSync(filePath, 'utf-8');
        for (const host of forbiddenFontHosts) {
          expect(content, `External font host '${host}' found in dist file ${path.relative(process.cwd(), filePath)}`).not.toContain(host);
        }
      }
    }
  });

  it('ensures public/fonts/ contains only .woff2 font files and SIL OFL license texts (UIFONT)', () => {
    const fontsDir = path.resolve('public/fonts');
    expect(fs.existsSync(fontsDir)).toBe(true);

    const fontEntries = fs.readdirSync(fontsDir);
    expect(fontEntries.length).toBeGreaterThan(0);

    const woff2Files = fontEntries.filter(f => f.endsWith('.woff2'));
    const licenseFiles = fontEntries.filter(f => f.startsWith('LICENSE'));
    const invalidFiles = fontEntries.filter(f => !f.endsWith('.woff2') && !f.startsWith('LICENSE'));

    expect(invalidFiles).toEqual([]);
    expect(woff2Files.length).toBe(8); // 4 Inter (400, 500, 600, 700) + 4 Newsreader (400, 500, 600, 400-italic)
    expect(licenseFiles.length).toBe(2); // LICENSE-inter.txt, LICENSE-newsreader.txt
  });

  it('ensures production client JS bundle dead-code eliminates route test hooks and fixture destinations', () => {
    const distDir = path.resolve('dist');
    if (!fs.existsSync(distDir)) {
      return;
    }
    const distFiles = collectFiles(distDir);
    for (const filePath of distFiles) {
      if (filePath.endsWith('.js')) {
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content, `Ungated test_destination found in production bundle ${filePath}`).not.toContain('test_destination');
        expect(content, `Ungated test_no_route_reason found in production bundle ${filePath}`).not.toContain('test_no_route_reason');
        expect(content, `Ungated fixture destination 'Mission Dolores' found in production bundle ${filePath}`).not.toContain('Mission Dolores');
      }
    }
  });

  it('ensures production client JS bundle contains zero references to overpass-api.de (FAILS if dist/ is missing)', () => {
    const distDir = path.resolve('dist');
    expect(fs.existsSync(distDir), 'Production build directory dist/ must exist. Run npm run build first.').toBe(true);
    const distFiles = collectFiles(distDir);
    expect(distFiles.length).toBeGreaterThan(0);
    for (const filePath of distFiles) {
      if (filePath.endsWith('.js')) {
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content, `Forbidden overpass-api.de reference found in client bundle ${filePath}`).not.toContain('overpass-api.de');
      }
    }
  });

  it('ensures isFixtureCoord supports both [lat, lon] and GeoJSON [lon, lat] orders and rejects non-fixture coordinates', () => {
    // San Francisco
    expect(isFixtureCoord(37.7749, -122.4194)).toBe(true);
    expect(isFixtureCoord(-122.4194, 37.7749)).toBe(true);
    // Mission Dolores in SF cluster
    expect(isFixtureCoord(-122.4148, 37.7599)).toBe(true);
    expect(isFixtureCoord(37.7599, -122.4148)).toBe(true);
    // Los Angeles
    expect(isFixtureCoord(34.0522, -118.2437)).toBe(true);
    expect(isFixtureCoord(-118.2437, 34.0522)).toBe(true);
    // Tokyo
    expect(isFixtureCoord(35.6764, 139.65)).toBe(true);
    expect(isFixtureCoord(139.65, 35.6764)).toBe(true);
    // Seattle
    expect(isFixtureCoord(47.6062, -122.3321)).toBe(true);
    expect(isFixtureCoord(-122.3321, 47.6062)).toBe(true);

    // Non-fixture points (0, 0 or offset coordinates)
    expect(isFixtureCoord(0, 0)).toBe(false);
    expect(isFixtureCoord(10.5, 20.5)).toBe(false);
    expect(isFixtureCoord(20.5, 10.5)).toBe(false);

    // Coordinate outside SF threshold (> 0.05 deg difference)
    const sfLatShifted = 37.7749 + 0.1;
    const sfLon = -122.4194;
    expect(isFixtureCoord(sfLatShifted, sfLon)).toBe(false);
    expect(isFixtureCoord(sfLon, sfLatShifted)).toBe(false);
  });

  it('ensures zero fixture render or imports in live adapter layer outside ?dev=1 (LIVE_FIRST S0 Static Gate)', () => {
    // 1. live-signal.ts and live-snapshot.ts must NEVER import from fixtures
    const liveAdapterFiles = [
      path.resolve('src/adapters/providers/live-signal.ts'),
      path.resolve('src/adapters/providers/live-snapshot.ts'),
    ];

    for (const filePath of liveAdapterFiles) {
      expect(fs.existsSync(filePath), `${filePath} must exist`).toBe(true);
      const content = fs.readFileSync(filePath, 'utf-8');

      // Zero fixture imports
      expect(content).not.toMatch(/from\s+['"].*\/fixtures\/.*['"]/);
      expect(content).not.toMatch(/from\s+['"].*mock-venues.*['"]/);

      // Zero hardcoded demo scenes
      expect(content).not.toContain('morning_calm');
      expect(content).not.toContain('lunch_away');
      expect(content).not.toContain('depart_piano');
      expect(content).not.toContain('rain_replan');
    }

    // 2. Client bundle in dist (if built) must not contain ungated live fixture renders
    const distPath = path.resolve('dist');
    if (fs.existsSync(distPath)) {
      const distFiles = collectFiles(distPath);
      for (const filePath of distFiles) {
        if (filePath.endsWith('.js')) {
          const content = fs.readFileSync(filePath, 'utf-8');
          expect(content).not.toContain('buildLiveSnapshotWithDemoFixture');
        }
      }
    }
  });
});
