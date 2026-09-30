const assert = require('assert');
const fs = require('fs');
const Map = require('../src/services/interactiveMap.js');
const ViewModel = require('../src/services/restaurantViewModel.js');

const places = [
  { jiaPlaceId: 'A', name: '甲店', location: { lat: 22.6761, lng: 120.4942 }, category: '麵店' },
  { jiaPlaceId: 'B', name: '乙店', location: { lat: 22.6771, lng: 120.4952 }, category: '燒肉' },
  { jiaPlaceId: 'NO_GPS', name: '無座標店', address: '仍可搜尋與查看詳情' }
];
const normalized = Map.normalizePlaces(places);
assert.deepStrictEqual(normalized.map(item => item.id), ['A', 'B', 'NO_GPS']);
assert.deepStrictEqual(Map.getState().visibleRestaurantIds, ['A', 'B']);
assert.strictEqual(Map.selectRestaurant('A', { pan: false }), true);
assert.strictEqual(Map.getState().selectedRestaurantId, 'A');
assert.strictEqual(Map.selectRestaurant('NO_GPS', { pan: false }), false);
console.log('✅ 1. CanonicalMarkerCardIdentityTest Passed');

const dense = Array.from({ length: 250 }, (_, i) => ({ restaurantId: `r${i}`, lat: 22.67 + (i % 25) * .00005, lng: 120.49 + Math.floor(i / 25) * .00005 }));
const groups = Map.groupMapModels(dense, 13);
assert.ok(groups.some(group => group.type === 'cluster'));
assert.ok(groups.flatMap(group => group.items).every(item => /^r\d+$/.test(item.restaurantId)));
console.log('✅ 2. DeterministicClusterIdentityTest Passed');

assert.strictEqual(ViewModel.validCoordinate(22.6761, 120.4942), true);
assert.strictEqual(ViewModel.validCoordinate(0, 0), false);
assert.strictEqual(ViewModel.validCoordinate(91, 120), false);
console.log('✅ 3. InvalidCoordinateExclusionTest Passed');

const source = fs.readFileSync('src/services/interactiveMap.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
assert.ok(source.includes('searchThisArea'));
assert.ok(source.includes('locateUser'));
assert.ok(source.includes("['collapsed', 'half', 'expanded']"));
assert.ok(source.includes('openstreetmap.org/copyright'));
assert.ok(index.includes('id="jia-map-canvas"'));
assert.ok(index.includes("window.switchTab('map')"));
assert.ok(index.includes('interactive-map.css'));
console.log('✅ 4. InteractiveMapWiringTest Passed');
