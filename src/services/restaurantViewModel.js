(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JiaRestaurantViewModel = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function text(value) { return value == null ? '' : String(value).trim(); }
  function numberOrNull(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  function canonicalId(place) {
    const p = place || {};
    return text(p.jiaPlaceId || p.restaurantId || p.canonicalId || p.id || p.place_id);
  }
  function validCoordinate(lat, lng) {
    if (lat == null || lng == null || lat === '' || lng === '') return false;
    const a = Number(lat), b = Number(lng);
    return Number.isFinite(a) && Number.isFinite(b) && a >= -90 && a <= 90 && b >= -180 && b <= 180 && !(a === 0 && b === 0);
  }
  function coordinates(place) {
    const p = place || {};
    const location = p.location || p.geometry?.location || {};
    const lat = typeof location.lat === 'function' ? location.lat() : (location.lat ?? p.latitude ?? p.lat);
    const lng = typeof location.lng === 'function' ? location.lng() : (location.lng ?? p.longitude ?? p.lng);
    return validCoordinate(lat, lng) ? { lat: Number(lat), lng: Number(lng) } : null;
  }
  function hours(place) {
    const raw = place?.openingHours ?? place?.opening_hours ?? place?.hours ?? '';
    if (typeof raw === 'string') return raw.trim();
    if (Array.isArray(raw?.weekday_text)) return raw.weekday_text.filter(Boolean).join(' · ');
    return text(raw?.text);
  }
  function photo(place) {
    const p = place || {};
    return text(p.primaryPhoto || p.coverPhoto || p.communityPhotos?.[0] || p.photoUrl || p.photos?.[0]);
  }
  function normalize(place, options) {
    const p = place || {}, opts = options || {}, stats = p.communityStats || {};
    const cats = Array.isArray(p.categories) ? p.categories.filter(Boolean) : (p.category ? [p.category] : []);
    const coord = coordinates(p);
    const rating = numberOrNull(stats.ratingAverage ?? p.rating);
    const reviews = numberOrNull(stats.ratingCount ?? p.reviewCount ?? p.user_ratings_total);
    const spend = numberOrNull(stats.averageSpend ?? p.averageSpend ?? p.avgSpend);
    return {
      id: canonicalId(p),
      name: text(p.name) || '未命名餐廳',
      category: text(cats[0]),
      categories: cats,
      latitude: coord?.lat ?? null,
      longitude: coord?.lng ?? null,
      address: text(p.address || p.formatted_address || [p.city, p.district].filter(Boolean).join(' ')),
      phone: text(p.phone || p.formatted_phone_number),
      openingHours: hours(p),
      openStatus: text(p.openStatus || p.openingStatus || p.status),
      rating,
      reviewCount: reviews,
      averageSpend: spend,
      recommendedDishes: Array.isArray(p.recommendedDishes) ? p.recommendedDishes : [],
      primaryPhoto: photo(p),
      photoFallback: text(opts.photoFallback || './assets/place-placeholder.svg'),
      distance: numberOrNull(opts.distance ?? p.distance ?? p._distKm ?? p.dist),
      communityState: p.communityState || p.communityStats || null,
      contributionState: p.contributionState || null,
      visited: Boolean(p.visited),
      wishlist: Boolean(p.wishlist || p.wantToEat),
      source: text(p.source || p._provider || 'jia-ben'),
      raw: p
    };
  }
  function toMapRestaurant(placeOrVm) {
    const vm = placeOrVm && Object.prototype.hasOwnProperty.call(placeOrVm, 'latitude') ? placeOrVm : normalize(placeOrVm);
    if (!validCoordinate(vm.latitude, vm.longitude)) return null;
    return {
      restaurantId: vm.id,
      lat: vm.latitude,
      lng: vm.longitude,
      name: vm.name,
      category: vm.category,
      rating: vm.rating,
      openStatus: vm.openStatus,
      primaryPhoto: vm.primaryPhoto || vm.photoFallback,
      distance: vm.distance
    };
  }
  return { text, canonicalId, validCoordinate, coordinates, normalize, toMapRestaurant };
});
