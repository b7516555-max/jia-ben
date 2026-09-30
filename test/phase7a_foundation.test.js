const assert = require('assert');
const fs = require('fs');

const ViewModel = require('../src/services/restaurantViewModel.js');
const MapContract = require('../src/services/mapRestaurantContract.js');
const Guard = require('../src/utils/googlePlacesGuard.js');
const Card = require('../src/components/restaurantCard.js');

const place = {
  jiaPlaceId: 'jia_7a_demo', name: '測試餐廳', category: '台式料理',
  location: { lat: 22.6761, lng: 120.4942 }, address: '屏東市測試路 1 號',
  openingHours: '今日 11:00–21:00', communityStats: { ratingAverage: 4.5, ratingCount: 12, averageSpend: 250 }
};
const vm = ViewModel.normalize(place);
assert.strictEqual(vm.id, 'jia_7a_demo');
assert.strictEqual(vm.name, '測試餐廳');
assert.strictEqual(vm.rating, 4.5);
assert.strictEqual(vm.openingHours, '今日 11:00–21:00');
console.log('✅ 1. RestaurantViewModelNormalizationTest Passed');

const map = MapContract.normalize(place);
assert.deepStrictEqual({ restaurantId: map.restaurantId, lat: map.lat, lng: map.lng }, { restaurantId: 'jia_7a_demo', lat: 22.6761, lng: 120.4942 });
for (const bad of [{ lat: null, lng: 120 }, { lat: 91, lng: 120 }, { lat: 22, lng: 181 }, { lat: 0, lng: 0 }, { lat: NaN, lng: 120 }]) {
  assert.strictEqual(ViewModel.validCoordinate(bad.lat, bad.lng), false);
  assert.strictEqual(MapContract.isValid(bad), false);
}
assert.strictEqual(MapContract.normalize({ ...place, location: { lat: 0, lng: 0 } }), null);
console.log('✅ 2. MapRestaurantCoordinateContractTest Passed');

assert.strictEqual(Guard.isGooglePlacesUrl('https://maps.googleapis.com/maps/api/place/details/json'), true);
assert.strictEqual(Guard.isGooglePlacesUrl('https://places.googleapis.com/v1/places/abc'), true);
assert.strictEqual(Guard.isGooglePlacesUrl('https://www.google.com/maps/dir/?api=1'), false);
assert.throws(() => Guard.assertAllowedUrl('https://maps.googleapis.com/maps/api/place/photo?photo_reference=x'), /NO_GOOGLE_PLACES_RUNTIME/);
console.log('✅ 3. GooglePlacesRuntimeGuardTest Passed');

const cardHtml = Card.render(place);
assert.ok(cardHtml.includes('data-restaurant-id="jia_7a_demo"'));
assert.ok(cardHtml.includes('測試餐廳'));
assert.ok(cardHtml.includes('今日 11:00–21:00'));
assert.ok(cardHtml.includes('role="button"'));
assert.ok(cardHtml.includes('event.stopPropagation()'));
console.log('✅ 4. RestaurantCard7FoundationTest Passed');

const indexHtml = fs.readFileSync('index.html', 'utf8');
const osmAdapter = fs.readFileSync('osm-adapter.js', 'utf8');
assert.ok(indexHtml.includes('NO_GOOGLE_PLACES_RUNTIME'));
assert.ok(indexHtml.includes('restaurantViewModel.js'));
assert.ok(indexHtml.includes('mapRestaurantContract.js'));
assert.ok(indexHtml.includes('window.JiaPlaces?.searchPlaces'));
assert.ok(osmAdapter.includes('__JIA_ENABLE_LEGACY_GOOGLE_COMPAT__ === true'));
assert.ok(osmAdapter.includes('no Google-shaped global compatibility shim'));
assert.ok(fs.existsSync('src/styles/design-tokens.css'));
console.log('✅ 5. BrowserFoundationWiringTest Passed');
