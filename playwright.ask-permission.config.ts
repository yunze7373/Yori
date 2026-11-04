import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /ask-permission\.spec\.ts/,
  workers: 1,
  use: {
    baseURL: 'http://localhost:4285',
  },
  webServer: {
    command: 'npx vite build --mode test && npx vite preview --port 4285 --strictPort',
    port: 4285,
    reuseExistingServer: false,
    timeout: 30000,
  },
});
