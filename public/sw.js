/**
 * Service Worker for Rumbledore
 * Provides offline support and advanced caching strategies
 */

const CACHE_VERSION = 'v1.0.0';
const CACHE_NAMES = {
  STATIC: `rumbledore-static-${CACHE_VERSION}`,
  DYNAMIC: `rumbledore-dynamic-${CACHE_VERSION}`,
  IMAGES: `rumbledore-images-${CACHE_VERSION}`,
  API: `rumbledore-api-${CACHE_VERSION}`,
};

// Files to cache immediately
const STATIC_ASSETS = [
  '/',
  '/offline.html',
  '/fonts/geist-sans.woff2',
  '/fonts/geist-mono.woff2',
];

// API routes to cache
const API_CACHE_ROUTES = [
  '/api/leagues',
  '/api/user/profile',
  '/api/competitions',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAMES.STATIC).then((cache) => {
      console.log('[Service Worker] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      console.log('[Service Worker] Skip waiting');
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => {
            return cacheName.startsWith('rumbledore-') && 
                   !Object.values(CACHE_NAMES).includes(cacheName);
          })
          .map((cacheName) => {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          })
      );
    }).then(() => {
      console.log('[Service Worker] Claiming clients');
      return self.clients.claim();
    })
  );
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-HTTP(S) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  // Skip WebSocket requests
  if (url.protocol === 'ws:' || url.protocol === 'wss:') {
    return;
  }
  
  // Skip browser extensions
  if (url.hostname === 'extensions') {
    return;
  }
  
  // Determine caching strategy based on request type
  if (request.method === 'GET') {
    // Static assets - Cache First
    if (isStaticAsset(url)) {
      event.respondWith(cacheFirst(request, CACHE_NAMES.STATIC));
    }
    // Images - Cache First with fallback
    else if (isImage(url)) {
      event.respondWith(cacheFirst(request, CACHE_NAMES.IMAGES));
    }
    // API requests - Network First with cache fallback
    else if (isApiRequest(url)) {
      event.respondWith(networkFirst(request, CACHE_NAMES.API));
    }
    // HTML pages - Network First
    else if (request.headers.get('accept')?.includes('text/html')) {
      event.respondWith(networkFirst(request, CACHE_NAMES.DYNAMIC));
    }
    // Other requests - Stale While Revalidate
    else {
      event.respondWith(staleWhileRevalidate(request, CACHE_NAMES.DYNAMIC));
    }
  }
});

// Cache strategies

/**
 * Cache First strategy
 * Try cache, fallback to network
 */
async function cacheFirst(request, cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    
    if (cached) {
      console.log('[Service Worker] Cache hit:', request.url);
      return cached;
    }
    
    console.log('[Service Worker] Cache miss, fetching:', request.url);
    const response = await fetch(request);
    
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    console.error('[Service Worker] Cache first error:', error);
    
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      const cache = await caches.open(CACHE_NAMES.STATIC);
      return cache.match('/offline.html');
    }
    
    throw error;
  }
}

/**
 * Network First strategy
 * Try network, fallback to cache
 */
async function networkFirst(request, cacheName) {
  try {
    const cache = await caches.open(cacheName);
    
    // Set a timeout for network requests
    const networkTimeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Network timeout')), 5000);
    });
    
    const networkResponse = Promise.resolve(fetch(request));
    
    try {
      const response = await Promise.race([networkResponse, networkTimeout]);
      
      if (response.ok) {
        // Update cache with fresh response
        await cache.put(request, response.clone());
        console.log('[Service Worker] Network response cached:', request.url);
      }
      
      return response;
    } catch (error) {
      // Network failed, try cache
      console.log('[Service Worker] Network failed, trying cache:', request.url);
      const cached = await cache.match(request);
      
      if (cached) {
        return cached;
      }
      
      // Return offline page for navigation requests
      if (request.mode === 'navigate') {
        const staticCache = await caches.open(CACHE_NAMES.STATIC);
        return staticCache.match('/offline.html');
      }
      
      throw error;
    }
  } catch (error) {
    console.error('[Service Worker] Network first error:', error);
    throw error;
  }
}

/**
 * Stale While Revalidate strategy
 * Return cache immediately, update cache in background
 */
async function staleWhileRevalidate(request, cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    
    // Fetch in background
    const fetchPromise = fetch(request).then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    });
    
    // Return cached response immediately if available
    if (cached) {
      console.log('[Service Worker] Serving stale cache:', request.url);
      return cached;
    }
    
    // Otherwise wait for network
    console.log('[Service Worker] No cache, waiting for network:', request.url);
    return fetchPromise;
  } catch (error) {
    console.error('[Service Worker] Stale while revalidate error:', error);
    throw error;
  }
}

// Helper functions

function isStaticAsset(url) {
  return url.pathname.startsWith('/_next/static/') ||
         url.pathname.startsWith('/fonts/') ||
         url.pathname.endsWith('.woff2') ||
         url.pathname.endsWith('.woff');
}

function isImage(url) {
  return url.pathname.startsWith('/images/') ||
         url.pathname.startsWith('/avatars/') ||
         url.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/i);
}

function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

// Background sync for failed requests
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-api-requests') {
    event.waitUntil(syncApiRequests());
  }
});

async function syncApiRequests() {
  console.log('[Service Worker] Syncing API requests...');
  // Implement sync logic for failed API requests
  // This would typically involve storing failed requests in IndexedDB
  // and retrying them when connectivity is restored
}

// Push notification handling
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/icon-192x192.png',
    badge: '/badge-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/',
    },
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});

// Message handling for cache control
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
});

console.log('[Service Worker] Loaded');