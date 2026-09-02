/**
 * Hot Pepper Gourmet Adapter (src/providers/hotPepperAdapter.js)
 * 
 * Japan restaurant POI provider using Recruit Web Service Hot Pepper API.
 * Adheres to official schema, attribution, and returns verified fields: name, address, GPS, genre, budget, phone, shop URL, photo, opening info.
 */
(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.JiaProviderAdapters = root.JiaProviderAdapters || {};
    root.JiaProviderAdapters.hotpepper = api;
  }
})(typeof window !== 'undefined' ? window : null, function(root) {
  'use strict';

  function normalize(shop) {
    if (!shop) return null;
    return {
      provider: 'hotpepper',
      sourceId: shop.id || '',
      name: shop.name || '',
      nameKana: shop.name_kana || '',
      address: shop.address || '',
      location: {
        lat: Number(shop.lat),
        lng: Number(shop.lng)
      },
      genre: shop.genre?.name || shop.genre_name || '',
      budget: shop.budget?.name || shop.budget_name || '',
      phone: shop.tel || '',
      website: shop.urls?.pc || shop.shop_url || '',
      openingHours: shop.open || '',
      photoUrl: shop.photo?.pc?.l || shop.photo?.pc?.m || shop.photo_url || '',
      attribution: 'Powered by ホットペッパー Webサービス',
      raw: shop
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
          provider: 'hotpepper',
          place: {
            name: place.name,
            address: place.address,
            location: place.location
          }
        })
      });

      if (!response.ok) return { status: 'provider_error', statusText: response.statusText };
      const data = await response.json();
      if (data && data.status === 'success' && data.shop) {
        return normalize(data.shop);
      }
      return data;
    } catch (err) {
      console.warn('[HotPepperAdapter] Search error:', err);
      return { status: 'error', message: err.toString() };
    }
  }

  return {
    normalize,
    search
  };
});
