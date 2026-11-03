/**
 * E2E isolation guard (A22CFB incident 2026-11-03). Every server this suite addresses must be an
 * isolated test server: weather / places / route report enabled:false (or are not served to this
 * Host) and the model reports disabled. Pointed at a live-enabled server (an owner preview), this
 * test FAILS, naming each live provider. The config also refuses to reuse a running server.
 */

import { test, expect } from '@playwright/test';
import { checkIsolatedServer, configuredUrl } from '../e2e/helpers/isolation-guard.js';

test.describe('E2E isolation guard: no live provider on any target server', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'server check, run once');
  });

  for (const name of ['YORI_TEST_BUILD_URL', 'YORI_SHIPPING_URL'] as const) {
    test(`${name} reports every live provider off`, async () => {
      const url = configuredUrl(name);
      const findings = await checkIsolatedServer(url);
      expect(findings, `${url} is not an isolated test server`).toEqual([]);
    });
  }
});
