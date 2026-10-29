import { defineConfig, type Plugin } from 'vite';
import {
  createModelProxyMiddleware,
  resolveBindHost,
} from './src/adapters/model/server-proxy.js';
import { createXMemoProxyMiddleware } from './src/adapters/xmemo/server-proxy.js';
import { createWeatherProxyMiddleware } from './src/adapters/providers/server-proxy.js';

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

/**
 * Vite Configuration for Yori Living Context
 *
 * Governed by Architecture Rev3 Section 5 and PRE-S1-C Production Gating:
 * - Production builds must contain zero `__YORI_` window hook names or prefixes.
 * - Test/dev hooks and URL parameter forcing (?scene=, ?geo=) are strictly gated
 *   behind `import.meta.env.DEV` or an explicit `?test=1` query flag.
 * - In production preview, absent `?test=1`, URL forcing is inert and no test hooks ship.
 */

const bindHost = resolveBindHost();

export default defineConfig({
  plugins: [modelProxyPlugin(), xmemoProxyPlugin(), weatherProxyPlugin()],
  server: {
    port: 5173,
    host: bindHost,
  },
  preview: {
    port: 4173,
    host: bindHost,
  },
});
