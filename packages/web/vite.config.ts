/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * RecordSeek capture URLs look like `/?_=…&url=https%3A%2F%2F…`. The encoded
 * `://` in the `url` param makes Vite's dev file-serving middleware treat the
 * request as a filesystem path and reject it with an `fs.allow` 403 instead of
 * serving the SPA entry. This middleware runs first and rewrites any root
 * request that carries a query to `/`, so index.html is served. The browser
 * keeps the original URL, so the client still reads the capture params.
 * (Production serves static index.html for any query, so this is dev-only.)
 */
function captureUrlFallback(): Plugin {
  return {
    name: 'recordseek-capture-url-fallback',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const r = req as { url?: string; method?: string };
        if (r.url && r.method === 'GET') {
          const queryIndex = r.url.indexOf('?');
          if (queryIndex > 0) {
            const path = r.url.slice(0, queryIndex);
            if (path === '/' || path === '/index.html') {
              r.url = '/';
            }
          }
        }
        next();
      });
    },
  };
}

// host: true binds both IPv4 (127.0.0.1) and IPv6 (::1) so http://localhost:9000
// resolves regardless of the browser's preference — matches the legacy dev URL.
export default defineConfig(({ mode }) => ({
  // "/" for local dev (:9000), vitest, and normal builds; the GitHub Pages build
  // runs `vite build --mode pages` so assets resolve under the /recordseek/ subpath.
  base: mode === 'pages' ? '/recordseek/' : '/',
  plugins: [react(), captureUrlFallback()],
  server: { port: 9000, strictPort: true, host: true },
  preview: { port: 9000, strictPort: true, host: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
}));
