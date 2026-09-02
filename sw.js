const CACHE_NAME = 'together-eat-shell-v103';
const APP_SHELL = [
  './', 
  './index.html', 
  './osm-adapter.js?v=5',
  './src/utils/imageSafety.js?v=2',
  './src/utils/placeMatch.js?v=2',
  './src/utils/taiwanAddressNormalizer.js?v=60',
  './src/utils/taiwanPhoneNormalizer.js?v=60',
  './src/services/quotaManager.js?v=2',
  './src/providers/providerRegistry.js?v=60',
  './src/providers/nominatimAdapter.js?v=2',
  './src/providers/osmAdapter.js?v=2',
  './src/providers/foursquareAdapter.js?v=2',
  './src/providers/hereAdapter.js?v=2',
  './src/providers/geoapifyAdapter.js?v=2',
  './src/providers/taiwanOpenDataAdapter.js?v=60',
  './src/providers/nlscAdapter.js?v=60',
  './src/providers/hotPepperAdapter.js?v=60',
  './src/providers/kakaoLocalAdapter.js?v=60',
  './src/providers/naverLocalAdapter.js?v=60',
  './src/providers/naverBlogAdapter.js?v=60',
  './src/providers/yelpAdapter.js?v=60',
  './src/services/countryProviderRouter.js?v=60',
  './src/services/placeIdentityResolver.js?v=60',
  './src/services/taiwanPlaceIdentityResolver.js?v=60',
  './src/services/taiwanPoiCache.js?v=60',
  './src/services/communityReviewService.js?v=60',
  './src/services/completenessScorer.js?v=60',
  './src/services/reviewResolver.js?v=60',
  './src/services/discoveryResolver.js?v=60',
  './src/services/enrichment.js?v=2',
  './src/services/communityData.js?v=3',
  './src/services/personalization.js?v=1',
  './src/services/placeIntelligence.js?v=60',
  './src/services/smartSearch.js?v=2',
  './src/services/smartWheel.js?v=2',
  './src/components/restaurantCard.js?v=2',
  './assets/place-placeholder.svg',
  './assets/food/lu_rou_fan.jpg',
  './assets/food/ramen.jpg',
  './assets/food/yakiniku.jpg',
  './assets/food/hotpot.jpg',
  './assets/food/cafe.jpg',
  './manifest.webmanifest',
  './assets/avatars/host.png',
  './assets/avatars/explorer.png',
  './assets/avatars/cook.png',
  './assets/avatars/dessert.png',
  './assets/avatars/night.png',
  './assets/avatars/camera.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  
  // 對於 HTML 導覽請求使用 Network-first 策略，確保隨時取得最新網頁
  if (event.request.mode === 'navigate' || (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html'))) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});
