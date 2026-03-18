var CACHE = 'scratchpad-v1';
var FILES = [
  '/index.html',
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;700&display=swap'
];

// Install: cache the app shell
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      // Cache index.html — fonts are best-effort
      return cache.add('/index.html').then(function() {
        return cache.add('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;700&display=swap').catch(function(){});
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// Fetch: cache-first for our file, network-first for everything else
self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);

  // Only handle GET requests
  if (e.request.method !== 'GET') return;

  // Cache-first for the app HTML
  if (url.pathname === '/index.html' || url.pathname === '/') {
    e.respondWith(
      caches.match('/index.html').then(function(cached) {
        var networkFetch = fetch(e.request).then(function(response) {
          if (response && response.status === 200) {
            var clone = response.clone();
            caches.open(CACHE).then(function(cache) { cache.put('/index.html', clone); });
          }
          return response;
        }).catch(function() { return cached; });
        // Return cached immediately, update in background
        return cached || networkFetch;
      })
    );
    return;
  }

  // Network-first for Google Fonts (nice to have, not critical)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      fetch(e.request).catch(function() {
        return caches.match(e.request);
      })
    );
    return;
  }
});
