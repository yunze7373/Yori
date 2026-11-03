import { defineConfig, devices } from '@playwright/test';

/**
 * D2/D4 (DEMO_RESCUE): keep every e2e preview server offline and unbilled even though the trio
 * defaults ON and the demo enables the live model; explicit env always wins over .env.local.
 */
const offlineProviderEnv: Record<string, string> = {
  ...(process.env as Record<string, string>),
  PLACES_LIVE_ENABLED: 'false',
  ROUTE_LIVE_ENABLED: 'false',
  WEATHER_LIVE_ENABLED: 'false',
  MODEL_LIVE_ENABLED: '0',
  // D8: no e2e server may call Baseten (recorded responses only).
  BASETEN_LIVE_ENABLED: '0',
  // D11: no e2e server may use the owner's Google client or token file (recorded mock only).
  GOOGLE_OAUTH_ENABLED: 'false',
};

/** D11: the Google-mock server's env (test client only; every endpoint is the loopback mock). */
const googleMockEnv: Record<string, string> = {
  GOOGLE_OAUTH_ENABLED: 'true',
  GOOGLE_OAUTH_CLIENT_ID: 'test-client-d11.apps.example',
  GOOGLE_OAUTH_CLIENT_SECRET: 'test-secret-d11-SHOULD-NEVER-LEAK',
  GOOGLE_OAUTH_AUTH_URL: 'http://127.0.0.1:4291/o/oauth2/v2/auth',
  GOOGLE_OAUTH_TOKEN_URL: 'http://127.0.0.1:4291/token',
  GOOGLE_OAUTH_REVOKE_URL: 'http://127.0.0.1:4291/revoke',
  GOOGLE_CALENDAR_API_BASE: 'http://127.0.0.1:4291',
  GOOGLE_OAUTH_TOKEN_PATH: 'test-results/d11-google-oauth-tokens.json',
  CALENDAR_LIVE_ENABLED: 'true',
  CALENDAR_ICS_URL: 'http://127.0.0.1:4291/feed.ics',
};

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.ts/,
  testIgnore: ['**/proxy-boundary/**'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'mobile',
      use: {
        viewport: { width: 390, height: 844 },
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      },
    },
    {
      name: 'desktop',
      use: {
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: [
    {
      // D2: the keyless trio defaults ON in shipping; e2e pins it OFF so no test reaches a provider.
      env: { ...offlineProviderEnv },
      command: 'npm run build:test && npm run preview:test -- --port 4173',
      port: 4173,
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
    {
      env: { ...offlineProviderEnv },
      command: 'npm run build && npm run preview -- --port 4174',
      port: 4174,
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
    // D11: recorded Google mock (loopback only) and the ONE server that talks to it, on an
    // allowlisted, Google-registrable port. Never reused, so it can never be a real dev server.
    {
      command: 'node tests/fixtures/google-mock/server.mjs',
      port: 4291,
      reuseExistingServer: false,
      timeout: 20000,
    },
    {
      env: { ...offlineProviderEnv, ...googleMockEnv },
      command:
        "node -e \"require('fs').rmSync('test-results/d11-google-oauth-tokens.json',{force:true})\" && npx tsc --noEmit && VITE_MAP_TILES=off npx vite build --mode test --outDir dist-test-google && npx vite preview --outDir dist-test-google --port 5173 --strictPort",
      port: 5173,
      reuseExistingServer: false,
      timeout: 120000,
    },
    // DEMO-XMEMO-FREE: the demo-recording build (switch on), offline, never reused. Bound to
    // 127.0.0.1 explicitly; DEV_DEVICE_TESTING lets its public status routes answer this test port.
    {
      env: { ...offlineProviderEnv, YORI_DEMO_HIDE_XMEMO: '1', VITE_YORI_DEMO_HIDE_XMEMO: '1', DEV_DEVICE_TESTING: 'true' },
      command:
        'npx tsc --noEmit && VITE_MAP_TILES=off npx vite build --mode test --outDir dist-test-demo && npx vite preview --outDir dist-test-demo --host 127.0.0.1 --port 4286 --strictPort',
      port: 4286,
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
