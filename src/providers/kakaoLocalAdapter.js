/**
 * Kakao Local Adapter (src/providers/kakaoLocalAdapter.js)
 * 
 * South Korea restaurant search provider using Kakao Local Keyword Search API (카카오 로컬 API).
 * Returns: place_name, category_name, address_name, road_address_name, phone, GPS (x/y), place_url.
 */
(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.JiaProviderAdapters = root.JiaProviderAdapters || {};
    root.JiaProviderAdapters.kakaoLocal = api;
  }
})(typeof window !== 'undefined' ? window : null, function(root) {
  'use strict';

  function normalize(doc) {
    if (!doc) return null;
    return {
      provider: 'kakao_local',
      sourceId: doc.id || '',
      name: doc.place_name || '',
      category: doc.category_name || '',
      address: doc.road_address_name || doc.address_name || '',
      roadAddress: doc.road_address_name || '',
      jibunAddress: doc.address_name || '',
      phone: doc.phone || '',
      location: {
        lat: Number(doc.y),
        lng: Number(doc.x)
      },
      placeUrl: doc.place_url || '',
      attribution: 'Kakao Local API',
      raw: doc
    };
  }

  async function search(place) {
    if (!place || !place.name) return null;
    if (!root?.JIA_ENRICHMENT_PROXY_URL) return { status: 'disabled_no_proxy' };

    try {
      const response = await fetch(root.JIA_ENRICHMENT_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'enrich_place',
          provider: 'kakao_local',
          place: {
            name: place.name,
            address: place.address,
            location: place.location
          }
        })
      });

      if (!response.ok) return { status: 'provider_error', statusText: response.statusText };
      const data = await response.json();
      if (data && data.status === 'success' && data.document) {
        return normalize(data.document);
      }
      return data;
    } catch (err) {
      console.warn('[KakaoLocalAdapter] Search error:', err);
      return { status: 'error', message: err.toString() };
    }
  }

  return {
    normalize,
    search
  };
});
