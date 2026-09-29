import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const API_ENV = ['GROQ_API_KEY', 'GROQ_MODEL_PRIMARY', 'GROQ_MODEL_FALLBACK', 'GROQ_MODEL_STT', 'ALLOWED_ORIGINS'];
const PASS_HEADERS = ['content-type', 'origin', 'referer', 'user-agent', 'x-groq-key', 'host', 'accept'];

// Mahalliy rejimda ham /api/* xuddi Vercel'dagidek ishlasin: `npm run dev` va
// `npm run preview` bitta buyruq bilan AI'ni ham ko'taradi (Vercel CLI shart emas).
function localApi() {
  const handler = (load) => async (req, res, next) => {
    if (!req.url || !req.url.startsWith('/api/')) return next();
    const url = new URL(req.url, 'http://localhost');
    const name = url.pathname.slice(5).replace(/\/$/, '');
    if (!/^[a-z-]+$/.test(name)) return next();
    let mod;
    try {
      mod = await load(name);
    } catch {
      res.statusCode = 404;
      return res.end('Not found');
    }
    const fn = mod[req.method];
    if (typeof fn !== 'function') {
      res.statusCode = 405;
      return res.end();
    }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const headers = new Headers();
    for (const k of PASS_HEADERS) if (req.headers[k]) headers.set(k, String(req.headers[k]));
    const request = new Request(`http://${req.headers.host || 'localhost'}${req.url}`, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
      duplex: 'half',
    });
    try {
      const response = await fn(request);
      res.statusCode = response.status;
      response.headers.forEach((v, k) => res.setHeader(k, v));
      if (!response.body) return res.end();
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    } catch (e) {
      console.error('[api]', e);
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: { code: 'server', message: String(e?.message || e) } }));
    }
  };
  return {
    name: 'kafedra-local-api',
    configureServer(server) {
      server.middlewares.use(handler((name) => server.ssrLoadModule(`/api/${name}.js`)));
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler((name) => import(pathToFileURL(path.resolve('api', `${name}.js`)).href)));
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const k of API_ENV) if (env[k] && !process.env[k]) process.env[k] = env[k];
  return {
    plugins: [react(), localApi()],
    server: { port: 5173, host: true },
    preview: { port: 4173, host: true },
    build: {
      target: 'es2020',
      chunkSizeWarningLimit: 900,
    },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.js'],
    },
  };
});
