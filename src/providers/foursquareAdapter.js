(function(root,factory){
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.JiaProviderAdapters = root.JiaProviderAdapters || {};
    root.JiaProviderAdapters.foursquare = api;
  }
})(typeof window !== 'undefined' ? window : null, function(root) {
  'use strict';

  const FOURSQUARE_DETAILS_ENABLED = false; // Hard policy: Details default OFF
  const inFlightRequests = new Map();
  const searchCache = new Map();
  const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache

  function buildCacheKey(place) {
    const normName = String(place?.name || '').trim().toLowerCase();
    const lat = Number(place?.location?.lat || 0).toFixed(3);
    const lng = Number(place?.location?.lng || 0).toFixed(3);
    return `${normName}_${lat}_${lng}`;
  }

  async function search(place, missingFields) {
    // 1. Check if store already has a verified Foursquare ID (prevent duplicate Search)
    if (place?.sourceIds?.foursquare) {
      return { status: 'already_has_source_id', sourceId: place.sourceIds.foursquare };
    }

    if (!root?.JIA_ENRICHMENT_PROXY_URL) return { status: 'disabled_no_proxy' };

    const cacheKey = buildCacheKey(place);
    const now = Date.now();

    // 2. Check in-memory short-term cache
    const cached = searchCache.get(cacheKey);
    if (cached && (now - cached.timestamp < CACHE_TTL_MS)) {
      return cached.data;
    }

    // 3. Request deduplication: reuse pending promise for concurrent/double-click searches
    if (inFlightRequests.has(cacheKey)) {
      return await inFlightRequests.get(cacheKey);
    }

    const requestPromise = (async () => {
      try {
        const response = await fetch(root.JIA_ENRICHMENT_PROXY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'enrich_place',
            provider: 'foursquare',
            place: { name: place.name, location: place.location },
            missingFields: missingFields || []
          })
        });

        if (!response.ok) {
          throw new Error(`Foursquare proxy ${response.status}`);
        }

        const data = await response.json();
        // Save to short-term cache
        searchCache.set(cacheKey, { timestamp: Date.now(), data });
        return data;
      } finally {
        inFlightRequests.delete(cacheKey);
      }
    })();

    inFlightRequests.set(cacheKey, requestPromise);
    return await requestPromise;
  }

  return {
    FOURSQUARE_DETAILS_ENABLED,
    search,
    _inFlightRequests: inFlightRequests,
    _searchCache: searchCache
  };
});
