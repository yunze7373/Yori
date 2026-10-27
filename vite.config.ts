import { defineConfig, type Plugin } from 'vite';
import { ModelDevProxy } from './src/adapters/model/server-proxy.js';

function modelProxyPlugin(): Plugin {
  const proxy = new ModelDevProxy();
  const handleRequest = async (req: any, res: any, next: () => void) => {
    try {
      const handled = await proxy.handleHttpRequest(req, res);
      if (!handled) {
        next();
      }
    } catch {
      next();
    }
  };

  return {
    name: 'model-dev-proxy',
    configureServer(server) {
      server.middlewares.use(handleRequest);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleRequest);
    },
  };
}

const bindHost = process.env.DEV_DEVICE_TESTING === 'true' ? '0.0.0.0' : '127.0.0.1';

export default defineConfig({
  plugins: [modelProxyPlugin()],
  server: {
    port: 5173,
    host: bindHost,
  },
  preview: {
    port: 4173,
    host: bindHost,
  },
});
