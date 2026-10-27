import { defineConfig, type Plugin } from 'vite';
import { ModelDevProxy } from './src/adapters/model/server-proxy.js';

function modelProxyPlugin(): Plugin {
  const proxy = new ModelDevProxy();
  const handleRequest = (req: any, res: any, next: () => void) => {
    if (req.url === '/api/model/diagnostics' && req.method === 'GET') {
      const diag = proxy.getDiagnostics();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(diag));
      return;
    }
    if (req.url === '/api/model/refine' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk: Buffer | string) => {
        body += chunk;
      });
      req.on('end', async () => {
        try {
          const parsed = JSON.parse(body);
          const result = await proxy.handleRefine(parsed);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result));
        } catch {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Invalid JSON request' }));
        }
      });
      return;
    }
    next();
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

export default defineConfig({
  plugins: [modelProxyPlugin()],
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 4173,
    host: true,
  },
});
