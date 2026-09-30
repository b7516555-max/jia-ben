(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JiaGooglePlacesGuard = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  // Keep the match narrow: Firestore paths contain the collection name "jiaPlaces"
  // and must remain readable. These patterns cover only Google Places API hosts/routes.
  const PATTERNS = [/maps\.googleapis\.com\/maps\/api\/place(?:\/|\?|$)/i, /places\.googleapis\.com(?:\/|\?|$)/i];
  function isGooglePlacesUrl(url) { return PATTERNS.some(re => re.test(String(url || ''))); }
  function assertAllowedUrl(url) {
    if (isGooglePlacesUrl(url)) throw new Error('NO_GOOGLE_PLACES_RUNTIME: Google Places request blocked');
    return true;
  }
  function install() {
    if (!root || root.__JIA_GOOGLE_PLACES_GUARD_INSTALLED) return;
    root.__JIA_GOOGLE_PLACES_GUARD_INSTALLED = true;
    if (typeof root.fetch === 'function') {
      const originalFetch = root.fetch.bind(root);
      root.fetch = function (input, init) { assertAllowedUrl(typeof input === 'string' ? input : input?.url); return originalFetch(input, init); };
    }
    if (root.XMLHttpRequest?.prototype?.open) {
      const originalOpen = root.XMLHttpRequest.prototype.open;
      root.XMLHttpRequest.prototype.open = function (method, url) { assertAllowedUrl(url); return originalOpen.apply(this, arguments); };
    }
  }
  return { isGooglePlacesUrl, assertAllowedUrl, install, patterns: PATTERNS.map(String) };
});
