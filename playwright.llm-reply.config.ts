import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /llm-reply\.spec\.ts/,
  workers: 1,
  use: {
    baseURL: 'http://localhost:4285',
  },
  webServer: {
    command: 'npx vite preview --outDir dist --port 4285 --strictPort',
    port: 4285,
    reuseExistingServer: false,
    timeout: 30000,
  },
});
