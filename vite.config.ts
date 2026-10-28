import { defineConfig, type Plugin } from 'vite';
import {
  createModelProxyMiddleware,
  resolveBindHost,
} from './src/adapters/model/server-proxy.js';
import { createXMemoProxyMiddleware } from './src/adapters/xmemo/server-proxy.js';

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

const bindHost = resolveBindHost();

export default defineConfig({
  plugins: [modelProxyPlugin(), xmemoProxyPlugin()],
  server: {
    port: 5173,
    host: bindHost,
  },
  preview: {
    port: 4173,
    host: bindHost,
  },
});
