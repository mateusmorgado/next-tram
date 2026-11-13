// NextTram service worker: app shell works offline, live data always comes from the network.
const VERSION = 'nexttram-v17';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'lib/transit.js',
  'lib/stops.js',
  'lib/lines.js',
  'lib/favorites-sync.js',
  'lib/assistant-guides.js',
  'icons/assistants/claude.svg',
  'icons/assistants/chatgpt.svg',
  'icons/assistants/gemini.svg',
  'icons/assistants/siri.svg',
  'icons/assistants/alexa.svg',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only handle our own files. Transit API calls go straight to the network.
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Network first so updates show up right away; fall back to the cached shell offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined)),
      )
      .then((res) => res || new Response('Offline', { status: 503 })),
  );
});
