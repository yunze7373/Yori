import { defineConfig, type Plugin } from 'vite';
import {
  createModelProxyMiddleware,
  resolveBindHost,
} from './src/adapters/model/server-proxy.js';
import { createXMemoProxyMiddleware } from './src/adapters/xmemo/server-proxy.js';
import {
  createWeatherProxyMiddleware,
  createRouteProxyMiddleware,
} from './src/adapters/providers/server-proxy.js';

function modelProxyPlugin(): Plugin {
  const middleware = createModelProxyMiddleware();

  return {
    name: 'model-dev-proxy',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

function xmemoProxyPlugin(): Plugin {
  const middleware = createXMemoProxyMiddleware();

  return {
    name: 'xmemo-dev-proxy',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

function weatherProxyPlugin(): Plugin {
  const middleware = createWeatherProxyMiddleware();

  return {
    name: 'weather-dev-proxy',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

function routeProxyPlugin(): Plugin {
  const middleware = createRouteProxyMiddleware();

  return {
    name: 'route-dev-proxy',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

/**
 * Vite Configuration for Yori Living Context
 *
 * Governed by Architecture Rev3 Section 5 and PRE-S1-C Production Gating:
 * - Production builds must compile with `__YORI_ENABLE_TEST_HOOKS__ = false`,
 *   enabling Rollup dead-code elimination (tree-shaking) of all dev/test hooks
 *   and URL forcing (?scene=, ?geo=, ?geo_consent=).
 * - Shipping bundles in dist/ contain zero `__YORI_` hook names, tokens, or control surfaces.
 * - Test/e2e builds (mode 'test' / 'e2e' or TEST_BUILD=1) compile with
 *   `__YORI_ENABLE_TEST_HOOKS__ = true`, enabling hooks and URL forcing under `?test=1`.
 */

const bindHost = resolveBindHost();

export default defineConfig(({ mode }) => {
  const isTestMode =
    mode === 'test' ||
    mode === 'e2e' ||
    process.env.VITE_TEST_BUILD === '1' ||
    process.env.TEST_BUILD === '1';
  const enableTestHooks = mode === 'development' || isTestMode;

  return {
    define: {
      __YORI_ENABLE_TEST_HOOKS__: JSON.stringify(enableTestHooks),
    },
    plugins: [
      modelProxyPlugin(),
      xmemoProxyPlugin(),
      weatherProxyPlugin(),
      routeProxyPlugin(),
    ],
    server: {
      port: 5173,
      host: bindHost,
    },
    preview: {
      port: 4173,
      host: bindHost,
    },
    test: {
      setupFiles: ['./tests/setup-netguard.ts'],
    },
  } as any;
});
