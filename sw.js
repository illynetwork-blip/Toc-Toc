/* Toc-Toc — service worker : appli disponible hors ligne + fonds de carte déjà vus en cache.
   La version change automatiquement à chaque construction (build.py). */
const VERSION = 'tt-5783976c8e';
const SHELL = ['./', './index.html', './manifest.webmanifest', './logo.svg', './icons/tt-icon-192.png', './icons/tt-icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'];
const TILE_HOSTS = /data\.geopf\.fr\/wmts|tile\.openstreetmap\.org|arcgisonline\.com|opentopomap\.org|geoservices\.brgm\.fr/;
const IMMUTABLE = /cdnjs\.cloudflare\.com\/ajax\/libs\/|fonts\.(googleapis|gstatic)\.com/;
const MAX_TILES = 400;
let trimT = null;
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => !k.startsWith(VERSION) && k !== 'tt-offline').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
function trim(cache){ clearTimeout(trimT); trimT = setTimeout(async () => { try { const keys = await cache.keys(); for (let i = 0; i < keys.length - MAX_TILES; i++) await cache.delete(keys[i]); } catch (e) {} }, 4000); }
function put(req, r){ if (r && (r.ok || r.type === 'opaque')){ const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); } return r; }
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = req.url;
  if (TILE_HOSTS.test(url)){   // fonds de carte : cache d'abord
    e.respondWith(caches.open(VERSION + '-tiles').then(async c => {
      const hit = await caches.match(req); if (hit) return hit;   // zones gardées hors ligne + cartes déjà vues
      try { const r = await fetch(url, {mode: 'cors', credentials: 'omit'}); if (r.ok){ c.put(req, r.clone()).then(() => trim(c), () => null); } return r; }
      catch (err){ return fetch(req); }
    }));
    return;
  }
  if (IMMUTABLE.test(url)){ e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => put(req, r)))); return; }
  const same = new URL(url).origin === self.location.origin;
  if (!same) return;   // données publiques (DVF, ADEME…) : toujours fraîches, jamais gardées
  if (req.mode === 'navigate' || /\/(index\.html)?$/.test(new URL(url).pathname)){
    // page : réseau d'abord (3 s au plus), sinon la copie en cache
    e.respondWith(new Promise(resolve => {
      let done = false; const t = setTimeout(() => { caches.match('./index.html').then(h => { if (h && !done){ done = true; resolve(h); } }); }, 3000);
      fetch(req).then(r => { clearTimeout(t); put('./index.html', r.clone()); if (!done){ done = true; resolve(r); } })
        .catch(() => caches.match('./index.html').then(h => { clearTimeout(t); if (!done){ done = true; resolve(h || Response.error()); } }));
    }));
    return;
  }
  e.respondWith(caches.match(req).then(hit => { const net = fetch(req).then(r => put(req, r)).catch(() => hit); return hit || net; }));
});
