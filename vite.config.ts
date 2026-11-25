import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

/** Generates a versioned offline shell from the finished build, including public assets and every lazy chunk. */
function offlineShell(): Plugin {
  let directory = '';
  let base = '';
  let enabled = false;
  return {
    name: 'limethat-offline-shell',
    configResolved(config) {
      directory = resolve(config.root, config.build.outDir);
      base = config.base;
      enabled = config.mode !== 'framing';
    },
    async writeBundle() {
      if (!enabled) return;
      const files = (await readdir(directory, { recursive: true, withFileTypes: true }))
        .filter(file => file.isFile() && file.name !== 'sw.js')
        .map(file => relative(directory, resolve(file.parentPath, file.name)).replaceAll('\\', '/')).sort();
      const hash = createHash('sha256');
      for (const file of files) { hash.update(file); hash.update(await readFile(resolve(directory, file))); }
      const version = hash.digest('hex').slice(0, 16);
      const source = `const BASE = ${JSON.stringify(base)};
const PREFIX = 'limethat-shell-' + BASE + '-';
const CACHE = PREFIX + '${version}';
const ASSETS = ${JSON.stringify(files.map(file => base + file))};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data !== 'activate') return;
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const ownTabs = tabs.filter(tab => new URL(tab.url).pathname.startsWith(BASE));
    if (ownTabs.length > 1) { event.source?.postMessage('close-other-tabs'); return; }
    await self.skipWaiting();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate' && (url.pathname === BASE || url.pathname === BASE + 'index.html')) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(BASE + 'index.html')).then(response => response || fetch(event.request)));
  } else if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(url.pathname)).then(response => response || fetch(event.request)));
  }
});
`;
      await writeFile(resolve(directory, 'sw.js'), source);
    },
  };
}

export default defineConfig({
  base: '/limethat/',
  define: {
    __APP_BUILD__: JSON.stringify(`${process.env.GITHUB_SHA?.slice(0, 8) ?? execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], { encoding: 'utf8' }).trim()} / ${new Date().toISOString()}`),
  },
  plugins: [svelte(), offlineShell()],
});
