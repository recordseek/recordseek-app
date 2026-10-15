/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { attributeDocs } from './src/keys.ts';

const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8')) as { version: string };

const SITES = [
  'Ancestry (records and trees)',
  'BillionGraves',
  'FamilySearch (records and tree persons)',
  'Find a Grave',
  'Findmypast (records and trees)',
  'Genealogie Online',
  'MyHeritage (records and persons)',
  'Open Archives (openarch.nl)',
  'WeRelate',
  'WikiTree',
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Emits version.txt, genscrape.js (separate, lazy-loaded) and the docs page generated from the key tables. */
function sdkAssets(): Plugin {
  return {
    name: 'recordseek-sdk-assets',
    writeBundle() {
      const dist = resolve(import.meta.dirname, 'dist');
      mkdirSync(dist, { recursive: true });
      for (const f of ['recordseek-mark.svg', 'recordseek-mark-white.svg']) copyFileSync(resolve(import.meta.dirname, 'assets', f), resolve(dist, f));
      writeFileSync(resolve(dist, 'version.txt'), pkg.version + '\n');
      copyFileSync(resolve(import.meta.dirname, 'vendor/genscrape.js'), resolve(dist, 'genscrape.js'));
      const rows = attributeDocs()
        .map(
          (a) =>
            `<tr><td><code>${a.attribute}</code></td><td>${a.group}</td><td>${a.aliases.map((x) => `<code>${esc(x)}</code>`).join(' ') || '&mdash;'}</td><td>${esc(a.description)}</td></tr>`,
        )
        .join('\n');
      const html = readFileSync(resolve(import.meta.dirname, 'docs/index.template.html'), 'utf8')
        .replaceAll('{{VERSION}}', pkg.version)
        .replace('{{ATTRIBUTES}}', rows)
        .replace('{{SITES}}', SITES.map((s) => `<li>${esc(s)}</li>`).join(''));
      writeFileSync(resolve(dist, 'index.html'), html);
    },
  };
}

// `vite build` emits recordseek.js plus the assets; `--mode bookmarklet` then
// adds bookmarklet.js to the same dist (lib mode allows one IIFE entry per build).
export default defineConfig(({ mode }) => {
  const bookmarklet = mode === 'bookmarklet';
  return {
    define: { __SDK_VERSION__: JSON.stringify(pkg.version) },
    plugins: bookmarklet ? [] : [sdkAssets()],
    build: {
      target: 'es2018',
      minify: true,
      emptyOutDir: !bookmarklet,
      lib: bookmarklet
        ? { entry: 'src/bookmarklet.ts', name: 'RecordSeekBookmarklet', formats: ['iife'], fileName: () => 'bookmarklet.js' }
        : { entry: 'src/index.ts', name: 'RecordSeekSDK', formats: ['iife'], fileName: () => 'recordseek.js' },
      rollupOptions: {
        output: { banner: `/*! RecordSeek ${bookmarklet ? 'bookmarklet' : 'SDK'} v${pkg.version} | https://recordseek.com/sdk/ */` },
      },
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.ts'],
    },
  };
});
