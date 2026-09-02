/**
 * Taiwan Open Data Adapter (src/providers/taiwanOpenDataAdapter.js)
 * 
 * Provides verified government open data for Taiwan food businesses (經濟部商業登記/餐館業, 衛福部食品登錄, 地方政府餐飲).
 * Uses local static/cached index for 0 runtime external calls during regular searches, with optional proxy search.
 */
(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.JiaProviderAdapters = root.JiaProviderAdapters || {};
    root.JiaProviderAdapters.taiwanOpenData = api;
  }
})(typeof window !== 'undefined' ? window : null, function(root) {
  'use strict';

  // In-memory cache for Taiwan Open Data POI queries
  const memoryCache = new Map();
  const CACHE_TTL_MS = 30 * 60 * 1000;

  function normalize(raw) {
    if (!raw) return null;
    return {
      provider: 'taiwan_open_data',
      sourceId: raw.businessId || raw.ban || raw.unifiedBusinessNo || raw.id || '',
      name: raw.companyName || raw.businessName || raw.name || '',
      address: raw.address || raw.registeredAddress || '',
      city: raw.city || raw.county || '',
      district: raw.district || raw.town || '',
      phone: raw.phone || raw.telephone || '',
      category: raw.industryName || raw.category || '餐飲業',
      unifiedBusinessNo: raw.unifiedBusinessNo || raw.ban || '',
      status: raw.status || '核准設立',
      raw
    };
  }

  /**
   * Search within Taiwan Open Data
   */
  async function search(place) {
    if (!place || !place.name) return null;
    const name = String(place.name).trim();
    const city = String(place.city || '').trim();
    const cacheKey = `tw_od_${name}_${city}`;

    if (memoryCache.has(cacheKey)) {
      const cached = memoryCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.data;
      }
    }

    // Check existing in-memory static government POI dataset if available
    const staticTwDataset = root?.taiwanOpenDataRegistry || [];
    if (staticTwDataset.length > 0) {
      const matcher = root?.JiaPlaceMatch || (typeof require === 'function' ? require('../utils/placeMatch.js') : null);
      const matches = staticTwDataset.filter(item => {
        const itemNorm = normalize(item);
        if (!itemNorm) return false;
        if (matcher) {
          return matcher.similarity(itemNorm.name, name) >= 0.88;
        }
        return itemNorm.name.includes(name) || name.includes(itemNorm.name);
      }).map(normalize);

      if (matches.length > 0) {
        const topMatch = matches[0];
        memoryCache.set(cacheKey, { timestamp: Date.now(), data: topMatch });
        return topMatch;
      }
    }

    // Proxy search if available
    if (root?.JIA_ENRICHMENT_PROXY_URL) {
      try {
        const response = await fetch(root.JIA_ENRICHMENT_PROXY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'enrich_place',
            provider: 'taiwan_open_data',
            place: { name, city, address: place.address }
          })
        });
        if (response.ok) {
          const res = await response.json();
          if (res && res.status === 'success') {
            const normalizedRes = normalize(res);
            memoryCache.set(cacheKey, { timestamp: Date.now(), data: normalizedRes });
            return normalizedRes;
          }
        }
      } catch (e) {
        console.warn('[TaiwanOpenDataAdapter] Proxy search error:', e);
      }
    }

    return null;
  }

  return {
    normalize,
    search,
    _cache: memoryCache
  };
});
