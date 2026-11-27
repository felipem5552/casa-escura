// Service worker: rede primeiro, cache como fallback (funciona offline depois da 1ª visita).
const CACHE = 'casa-escura-v7';
const FILES = ['./', 'index.html', 'style.css', 'manifest.webmanifest', 'icon.svg',
  'src/main.js','src/audio.js','src/config.js','src/debug.js','src/director.js','src/input.js','src/killer.js',
  'src/items.js','src/noise.js','src/player.js','src/render.js','src/rng.js','src/rooms.js','src/save.js','src/sprites.js','src/world.js','src/aim.js','src/safe.js',
  'src/render/gfx.js','src/render/characters.js','src/render/decor.js','src/render/world.js','src/render/lighting.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request)));
});
