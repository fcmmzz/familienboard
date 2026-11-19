/* Familienboard – Offline-Kopie (Service Worker)
   Die Seiten kommen immer frisch aus dem Netz. Nur wenn kein Netz da ist (z. B. WLAN nachts aus),
   wird die zuletzt geladene Kopie gezeigt. Wetter, Kalender usw. laufen NICHT hier durch. */
var CACHE = 'familienboard-v1';
var SEITEN = ['./familienboard.html', './handy.html'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(SEITEN.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function zeitlimit(ms) { return new Promise(function (_, nein) { setTimeout(function () { nein(new Error('timeout')); }, ms); }); }

self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;

  // Schriften: einmal laden, dann aus der Kopie
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(req).then(function (hit) {
        return hit || fetch(req).then(function (r) { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; });
      });
    }));
    return;
  }

  // Eigene Seiten: erst Netz (max. 6 s), sonst die gemerkte Kopie
  if (url.origin === self.location.origin && (req.mode === 'navigate' || /\.html$/.test(url.pathname))) {
    e.respondWith(caches.open(CACHE).then(function (c) {
      return Promise.race([fetch(req), zeitlimit(6000)]).then(function (r) {
        if (r.ok) c.put(url.origin + url.pathname, r.clone());
        return r;
      }).catch(function () {
        return c.match(url.origin + url.pathname)
          .then(function (hit) { return hit || c.match(req, { ignoreSearch: true }); })
          .then(function (hit) { return hit || Response.error(); });
      });
    }));
  }
});
