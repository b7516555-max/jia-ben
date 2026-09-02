/**
 * Yelp Adapter Interface (src/providers/yelpAdapter.js)
 * 
 * Yelp Fusion API interface for US places.
 * Policy Enforcement:
 * Yelp requires credit card / billing account for production usage.
 * Therefore, this adapter is STRICTLY set to `status = 'disabled_billing_required'`.
 * Production calls are permanently blocked to prevent unexpected charges.
 */
(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.JiaProviderAdapters = root.JiaProviderAdapters || {};
    root.JiaProviderAdapters.yelp = api;
  }
})(typeof window !== 'undefined' ? window : null, function(root) {
  'use strict';

  const STATUS = 'disabled_billing_required';
  const BILLING_REQUIRED = true;

  function normalize(business) {
    if (!business) return null;
    return {
      provider: 'yelp',
      sourceId: business.id || '',
      name: business.name || '',
      rating: business.rating || null,
      reviewCount: business.review_count || 0,
      price: business.price || '',
      phone: business.phone || business.display_phone || '',
      address: Array.isArray(business.location?.display_address) ? business.location.display_address.join(', ') : (business.location?.address1 || ''),
      location: {
        lat: Number(business.coordinates?.latitude),
        lng: Number(business.coordinates?.longitude)
      },
      url: business.url || '',
      attribution: 'Powered by Yelp'
    };
  }

  async function search(place) {
    // Hard guard: Always block execution due to billing requirement policy
    console.warn('[YelpAdapter] Blocked: Yelp Fusion API is disabled due to billing/payment method requirement policy.');
    return {
      status: STATUS,
      provider: 'yelp',
      message: 'Yelp is disabled because billing/credit card is required.',
      match: null
    };
  }

  return {
    STATUS,
    BILLING_REQUIRED,
    normalize,
    search
  };
});
