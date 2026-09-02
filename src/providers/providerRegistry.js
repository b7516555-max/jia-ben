/**
 * Jia-ben Provider Registry (src/providers/providerRegistry.js)
 * 
 * Defines all supported global and country-specific place, review, discovery, and map providers.
 * Enforces zero-surprise billing policy, free quota limits, and attribution requirements.
 */
(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JiaProviderRegistry = api;
})(typeof window !== 'undefined' ? window : null, function(root) {
  'use strict';

  const PROVIDERS = {
    osm: {
      id: 'osm',
      name: 'OpenStreetMap',
      countries: ['TW', 'US', 'JP', 'KR', 'GLOBAL'],
      capabilities: {
        poi: true,
        reviews: false,
        photos: false,
        discovery: false,
        map: true,
        geocoding: true
      },
      billing: {
        free: true,
        freeQuota: 'Fair Use (~1 req/sec Nominatim / Overpass)',
        paymentRequired: false,
        hardLimitSupported: true
      },
      status: 'enabled',
      attributionRequired: '© OpenStreetMap contributors',
      persistencePolicy: 'allow_local_storage_and_canonical'
    },
    geoapify: {
      id: 'geoapify',
      name: 'Geoapify',
      countries: ['TW', 'US', 'JP', 'KR', 'GLOBAL'],
      capabilities: {
        poi: true,
        reviews: false,
        photos: false,
        discovery: false,
        map: true,
        geocoding: true
      },
      billing: {
        free: true,
        freeQuota: '3,000 credits/day (Safe limit 2,700)',
        paymentRequired: false,
        hardLimitSupported: true
      },
      status: 'enabled',
      attributionRequired: 'Powered by Geoapify',
      persistencePolicy: 'allow_local_storage_and_canonical'
    },
    foursquare: {
      id: 'foursquare',
      name: 'Foursquare',
      countries: ['TW', 'US', 'JP', 'KR', 'GLOBAL'],
      capabilities: {
        poi: true,
        reviews: false, // Details / Tips default OFF for billing safety
        photos: false,
        discovery: false,
        map: false,
        geocoding: false
      },
      billing: {
        free: true,
        freeQuota: '500 calls/month (Safe limit 450)',
        paymentRequired: false,
        hardLimitSupported: true
      },
      status: 'enabled_search_only',
      attributionRequired: 'Powered by Foursquare Places',
      persistencePolicy: 'allow_search_cache_only'
    },
    taiwan_open_data: {
      id: 'taiwan_open_data',
      name: 'Taiwan Government Open Data',
      countries: ['TW'],
      capabilities: {
        poi: true,
        reviews: false,
        photos: false,
        discovery: true,
        map: false,
        geocoding: false
      },
      billing: {
        free: true,
        freeQuota: 'Unlimited / Open Public Datasets (data.gov.tw)',
        paymentRequired: false,
        hardLimitSupported: true
      },
      status: 'enabled',
      attributionRequired: '政府資料開放平臺 (data.gov.tw)',
      persistencePolicy: 'allow_local_storage_and_canonical'
    },
    nlsc: {
      id: 'nlsc',
      name: 'NLSC 國土測繪圖資服務雲',
      countries: ['TW'],
      capabilities: {
        poi: false,
        reviews: false,
        photos: false,
        discovery: false,
        map: true,
        geocoding: false
      },
      billing: {
        free: true,
        freeQuota: 'Public Open WMTS',
        paymentRequired: false,
        hardLimitSupported: true
      },
      status: 'enabled',
      attributionRequired: '內政部國土測繪中心 (NLSC)',
      persistencePolicy: 'tile_layer_only'
    },
    hotpepper: {
      id: 'hotpepper',
      name: 'Hot Pepper Gourmet (Recruit)',
      countries: ['JP'],
      capabilities: {
        poi: true,
        reviews: false, // Hot Pepper Gourmet does not provide numeric review ratings
        photos: true,
        discovery: true,
        map: false,
        geocoding: false
      },
      billing: {
        free: true,
        freeQuota: 'Official Free Developer API (No Credit Card)',
        paymentRequired: false,
        hardLimitSupported: true
      },
      status: 'disabled_registration_rejected', // Registration was rejected by provider
      attributionRequired: 'Powered by ホットペッパー Web服務',
      persistencePolicy: 'allow_display_with_source_url'
    },
    kakao_local: {
      id: 'kakao_local',
      name: 'Kakao Local',
      countries: ['KR'],
      capabilities: {
        poi: true,
        reviews: false,
        photos: false,
        discovery: true,
        map: false,
        geocoding: true
      },
      billing: {
        free: true,
        freeQuota: '300,000 req/day (No Credit Card)',
        freeQuotaEligibility: 'first_map_enabled_app_only',
        paymentRequired: false,
        hardLimitSupported: true
      },
      status: 'enabled', // Verified & Live in production via Apps Script proxy
      attributionRequired: 'Kakao Local API',
      persistencePolicy: 'allow_display_with_place_url'
    },
    naver_local: {
      id: 'naver_local',
      name: 'Naver Search Local',
      countries: ['KR'],
      capabilities: {
        poi: true,
        reviews: false,
        photos: false,
        discovery: true,
        map: false,
        geocoding: false
      },
      billing: {
        free: true,
        freeQuota: '25,000 req/day (Search API shared quota, No Credit Card)',
        paymentRequired: false,
        hardLimitSupported: true
      },
      status: 'disabled_scope_invalid', // Keys configured; awaiting search scope activation in Naver Console
      attributionRequired: 'NAVER Search API',
      persistencePolicy: 'allow_display_with_source_link'
    },
    naver_blog: {
      id: 'naver_blog',
      name: 'Naver Blog Discovery',
      countries: ['KR'],
      capabilities: {
        poi: false,
        reviews: false, // Strictly food articles / blog snippets, NEVER numeric ratings
        photos: false,
        discovery: true,
        map: false,
        geocoding: false
      },
      billing: {
        free: true,
        freeQuota: '25,000 req/day (Search API shared quota, No Credit Card)',
        paymentRequired: false,
        hardLimitSupported: true
      },
      status: 'disabled_scope_invalid', // Keys configured; awaiting search scope activation in Naver Console
      attributionRequired: 'NAVER Blog Search API',
      persistencePolicy: 'short_excerpt_and_link_only'
    },
    yelp: {
      id: 'yelp',
      name: 'Yelp Fusion',
      countries: ['US'],
      capabilities: {
        poi: true,
        reviews: true,
        photos: true,
        discovery: true,
        map: false,
        geocoding: false
      },
      billing: {
        free: false,
        freeQuota: 'Requires payment method / paid tier for production',
        paymentRequired: true,
        hardLimitSupported: false
      },
      status: 'disabled_billing_required', // Strictly disabled in production to avoid billing
      attributionRequired: 'Yelp',
      persistencePolicy: 'prohibited'
    },
    google_places: {
      id: 'google_places',
      name: 'Google Places / Maps',
      countries: ['GLOBAL'],
      capabilities: {
        poi: false,
        reviews: false,
        photos: false,
        discovery: false,
        map: false,
        geocoding: false
      },
      billing: {
        free: false,
        freeQuota: '0 (Permanently forbidden)',
        paymentRequired: true,
        hardLimitSupported: false
      },
      status: 'permanently_disabled_zero_call',
      attributionRequired: 'N/A',
      persistencePolicy: 'prohibited'
    }
  };

  function getProvider(id) {
    return PROVIDERS[id] || null;
  }

  function listProvidersByCountry(countryCode) {
    const code = String(countryCode || '').toUpperCase();
    return Object.values(PROVIDERS).filter(p => 
      p.countries.includes(code) || p.countries.includes('GLOBAL')
    );
  }

  function getActiveProviders(countryCode) {
    return listProvidersByCountry(countryCode).filter(p => 
      p.status.startsWith('enabled')
    );
  }

  function getProviderStatuses() {
    return Object.values(PROVIDERS).map(p => ({
      id: p.id,
      name: p.name,
      countries: p.countries,
      status: p.status,
      billingFree: p.billing.free,
      paymentRequired: p.billing.paymentRequired,
      freeQuota: p.billing.freeQuota,
      freeQuotaEligibility: p.billing.freeQuotaEligibility || null
    }));
  }

  return {
    PROVIDERS,
    getProvider,
    listProvidersByCountry,
    getActiveProviders,
    getProviderStatuses
  };
});
