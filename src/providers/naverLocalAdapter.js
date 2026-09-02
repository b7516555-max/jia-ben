/**
 * Naver Local Adapter (src/providers/naverLocalAdapter.js)
 * 
 * South Korea restaurant POI search provider using Naver Search Local API (네이버 검색 지역 API).
 * Schema: title, category, address, roadAddress, mapx, mapy, link.
 */
(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.JiaProviderAdapters = root.JiaProviderAdapters || {};
    root.JiaProviderAdapters.naverLocal = api;
  }
})(typeof window !== 'undefined' ? window : null, function(root) {
  'use strict';

  function stripHtml(str) {
    return String(str || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  }

  function normalize(item) {
    if (!item) return null;
    // Naver mapx, mapy are in KATEC / WGS84 integer coordinates (or divided by 1e7 for lat/lng)
    let lat = Number(item.mapy);
    let lng = Number(item.mapx);
    if (lat > 1000) lat = lat / 1e7;
    if (lng > 1000) lng = lng / 1e7;

    return {
      provider: 'naver_local',
      sourceId: item.link || item.title || '',
      name: stripHtml(item.title),
      category: item.category || '',
      address: item.roadAddress || item.address || '',
      roadAddress: item.roadAddress || '',
      jibunAddress: item.address || '',
      phone: item.telephone || '',
      location: {
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6))
      },
      link: item.link || '',
      attribution: 'NAVER Search API',
      raw: item
    };
  }

  async function search(place) {
    if (!place || !place.name) return null;
    const providerMeta = root?.JiaProviderRegistry?.getProvider('naver_local');
    if (providerMeta && providerMeta.productionEnabled === false) {
      return { status: 'disabled_new_registration_unavailable', productionEnabled: false };
    }
    if (!root?.JIA_ENRICHMENT_PROXY_URL) return { status: 'disabled_no_proxy' };

    try {
      const response = await fetch(root.JIA_ENRICHMENT_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'enrich_place',
          provider: 'naver_local',
          place: {
            name: place.name,
            address: place.address
          }
        })
      });

      if (!response.ok) return { status: 'provider_error', statusText: response.statusText };
      const data = await response.json();
      if (data && data.status === 'success' && data.item) {
        return normalize(data.item);
      }
      return data;
    } catch (err) {
      console.warn('[NaverLocalAdapter] Search error:', err);
      return { status: 'error', message: err.toString() };
    }
  }

  return {
    normalize,
    search,
    stripHtml
  };
});
