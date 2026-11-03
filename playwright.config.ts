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
  ],
});
