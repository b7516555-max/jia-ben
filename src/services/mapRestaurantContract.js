(function (root, factory) {
  const api = factory(root?.JiaRestaurantViewModel || (typeof require === 'function' ? require('./restaurantViewModel.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JiaMapRestaurantContract = api;
})(typeof window !== 'undefined' ? window : null, function (viewModel) {
  'use strict';
  function normalize(place) {
    const vm = viewModel.normalize(place);
    return viewModel.toMapRestaurant(vm);
  }
  function normalizeMany(places) {
    return (Array.isArray(places) ? places : []).map(normalize).filter(Boolean);
  }
  return { normalize, normalizeMany, isValid: item => Boolean(item && viewModel.validCoordinate(item.lat, item.lng)) };
});
