import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /video-script\.spec\.ts/,
  workers: 1,
  projects: [
    {
      name: 'mobile',
      use: {
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'desktop',
      use: {
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  use: {
    baseURL: 'http://localhost:4287',
  },
  webServer: {
    command: 'npx vite build --mode test && npx vite preview --port 4287 --strictPort',
    port: 4287,
    reuseExistingServer: false,
    timeout: 60000,
  },
});
