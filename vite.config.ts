import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import {
  createModelProxyMiddleware,
  resolveBindHost,
} from './src/adapters/model/server-proxy.js';
import { createXMemoProxyMiddleware } from './src/adapters/xmemo/server-proxy.js';
import { createGoogleProxyMiddleware } from './src/adapters/google/server-proxy.js';
import {
  createWeatherProxyMiddleware,
  createRouteProxyMiddleware,
  createPlacesProxyMiddleware,
  createCalendarProxyMiddleware,
  createGeocodeProxyMiddleware,
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

function placesProxyPlugin(): Plugin {
  const middleware = createPlacesProxyMiddleware();

  return {
    name: 'places-dev-proxy',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

// D11: server-side Google OAuth (Calendar); shares its core with the /api/calendar source selection.
function googleProxyPlugin(): Plugin {
  const middleware = createGoogleProxyMiddleware();

  return {
    name: 'google-dev-proxy',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

function calendarProxyPlugin(): Plugin {
  const middleware = createCalendarProxyMiddleware();

  return {
    name: 'calendar-dev-proxy',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

function geocodeProxyPlugin(): Plugin {
  const middleware = createGeocodeProxyMiddleware();

  return {
    name: 'geocode-dev-proxy',
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

/**
 * DEMO_RESCUE D1 (npm run demo:https): preview serves HTTPS only when scripts/demo-https.mjs
 * passes an mkcert certificate + key (kept in gitignored .yori-runtime/). Never self-signed here.
 */
function resolvePreviewHttps(): { cert: Buffer; key: Buffer } | undefined {
  const certPath = process.env.DEMO_HTTPS_CERT;
  const keyPath = process.env.DEMO_HTTPS_KEY;
  if (!certPath || !keyPath) return undefined;
  return { cert: readFileSync(certPath), key: readFileSync(keyPath) };
}

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
      placesProxyPlugin(),
      googleProxyPlugin(),
      calendarProxyPlugin(),
      geocodeProxyPlugin(),
    ],
    server: {
      port: 5173,
      host: bindHost,
    },
    preview: {
      port: 4173,
      host: bindHost,
      https: resolvePreviewHttps(),
    },
    test: {
      setupFiles: ['./tests/setup-netguard.ts'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/.progress/**', '**/.yori-runtime/**'],
    },
  } as any;
});
