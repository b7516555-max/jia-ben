const assert = require('assert');
global.window = global;

const PlaceIntelligence = require('../src/services/placeIntelligence.js');
const CommunityData = require('../src/services/communityData.js');
const RestaurantCard = require('../src/components/restaurantCard.js');
const imageSafety = require('../src/utils/imageSafety.js');
const placeMatch = require('../src/utils/placeMatch.js');

global.JiaPlaceMatch = placeMatch;
global.JiaCommunity = CommunityData;
global.JiaPlaceIntelligence = PlaceIntelligence;
global.imageSafety = imageSafety;

(async () => {
  console.log('--- Starting Place Detail Fields & Normalization Tests ---');

  // Test 1: Full Normalization from Rich Place Data
  const samplePlace = {
    jiaPlaceId: 'jia_goodvibe',
    name: '日和珈琲 GoodVibe Coffee',
    address: '高雄市左營區新上街307巷2號',
    phone: '07-556-7788',
    categories: ['咖啡廳', '甜點/冰品'],
    openingHours: '週一～週日 10:00–18:00',
    website: 'https://goodvibe.example.com',
    menuUrl: 'https://goodvibe.example.com/menu',
    officialSocial: {
      facebook: 'https://facebook.com/goodvibecoffee',
      instagram: 'https://instagram.com/goodvibecoffee'
    },
    communityStats: {
      averageSpend: 250,
      spendCount: 8,
      ratingAverage: 4.8,
      ratingCount: 15
    },
    fieldSources: {
      address: 'community_verified',
      phone: 'community_verified'
    }
  };

  const norm = PlaceIntelligence.normalizePlaceDetailData(samplePlace);
  assert(norm, 'Normalized place exists');
  assert.strictEqual(norm.name, '日和珈琲 GoodVibe Coffee');
  assert.strictEqual(norm.address, '高雄市左營區新上街307巷2號');
  assert.strictEqual(norm.phone, '07-556-7788');
  assert.deepStrictEqual(norm.categories, ['咖啡廳', '甜點/冰品']);
  assert.strictEqual(norm.openingHours, '週一～週日 10:00–18:00');
  assert.strictEqual(norm.averageSpend, 250);
  assert.strictEqual(norm.spendCount, 8);
  assert.strictEqual(norm.website, 'https://goodvibe.example.com');
  assert.strictEqual(norm.menuUrl, 'https://goodvibe.example.com/menu');
  assert.strictEqual(norm.social.facebook, 'https://facebook.com/goodvibecoffee');
  assert.strictEqual(norm.social.instagram, 'https://instagram.com/goodvibecoffee');
  assert(norm.sources.includes('Jia-ben'));
  assert(norm.sources.includes('社群驗證'));
  console.log('✅ Test 1 Passed: Full place detail normalization across all fields.');

  // Test 2: Missing Fields Safe Handling (No undefined, no null, no NT$0)
  const emptyPlace = {
    name: '極簡小攤'
  };
  const normEmpty = PlaceIntelligence.normalizePlaceDetailData(emptyPlace);
  assert.strictEqual(normEmpty.address, '');
  assert.strictEqual(normEmpty.phone, '');
  assert.deepStrictEqual(normEmpty.categories, []);
  assert.strictEqual(normEmpty.openingHours, '');
  assert.strictEqual(normEmpty.averageSpend, null, 'averageSpend is null when 0 or missing, not 0');
  assert.strictEqual(normEmpty.website, null);
  assert.strictEqual(normEmpty.menuUrl, null);
  console.log('✅ Test 2 Passed: Missing fields cleanly nullified to prevent unwanted render.');

  // Test 3: Legacy Compatibility (fallback from singular category and legacy phone)
  const legacyPlace = {
    name: '傳統麵店',
    category: 'noodle',
    telephone: '0223456789',
    formatted_address: '台北市大安區和平東路一段1號'
  };
  const normLegacy = PlaceIntelligence.normalizePlaceDetailData(legacyPlace);
  assert.strictEqual(normLegacy.address, '台北市大安區和平東路一段1號');
  assert.strictEqual(normLegacy.phone, '02-2345-6789', 'Normalized landline');
  assert.deepStrictEqual(normLegacy.categories, ['麵食水餃'], 'Mapped singular legacy category');
  console.log('✅ Test 3 Passed: Legacy schema backward compatibility and mapping.');

  // Test 4: Full Contribution -> Admin Review -> Partial PATCH Data Chain
  const baseCanonical = {
    jiaPlaceId: 'jia_contrib_test',
    name: '測試餐廳',
    communityStats: { averageSpend: 0, spendCount: 0 }
  };

  // User submits 5 fields
  const cSpend = CommunityData.createContributionRecord({
    jiaPlaceId: 'jia_contrib_test',
    uid: 'u1',
    userName: 'Tester',
    field: 'averageSpend',
    value: 250
  });
  const cAddr = CommunityData.createContributionRecord({
    jiaPlaceId: 'jia_contrib_test',
    uid: 'u1',
    userName: 'Tester',
    field: 'address',
    value: '高雄市左營區測試路123號'
  });
  const cPhone = CommunityData.createContributionRecord({
    jiaPlaceId: 'jia_contrib_test',
    uid: 'u1',
    userName: 'Tester',
    field: 'phone',
    value: '07-123-4567'
  });
  const cCat = CommunityData.createContributionRecord({
    jiaPlaceId: 'jia_contrib_test',
    uid: 'u1',
    userName: 'Tester',
    field: 'category',
    value: '咖啡'
  });
  const cHours = CommunityData.createContributionRecord({
    jiaPlaceId: 'jia_contrib_test',
    uid: 'u1',
    userName: 'Tester',
    field: 'openingHours',
    value: '週一～週五 11:00–20:00'
  });

  // Admin approves all 5
  let patched = { ...baseCanonical };
  patched = CommunityData.applyContributionToPlace(patched, cSpend, 'admin').updatedPlace;
  patched = CommunityData.applyContributionToPlace(patched, cAddr, 'admin').updatedPlace;
  patched = CommunityData.applyContributionToPlace(patched, cPhone, 'admin').updatedPlace;
  patched = CommunityData.applyContributionToPlace(patched, cCat, 'admin').updatedPlace;
  patched = CommunityData.applyContributionToPlace(patched, cHours, 'admin').updatedPlace;

  // Verify Patched Place
  assert.strictEqual(patched.address, '高雄市左營區測試路123號');
  assert.strictEqual(patched.phone, '07-123-4567');
  assert.strictEqual(patched.openingHours, '週一～週五 11:00–20:00');
  assert.deepStrictEqual(patched.categories, ['咖啡廳']); // Mapped to controlled category
  assert.strictEqual(patched.communityStats.averageSpend, 250);
  assert.strictEqual(patched.communityStats.spendCount, 1);

  // Verify Detail View normalization on patched canonical
  const patchedNorm = PlaceIntelligence.normalizePlaceDetailData(patched);
  assert.strictEqual(patchedNorm.averageSpend, 250);
  assert.strictEqual(patchedNorm.address, '高雄市左營區測試路123號');
  assert.strictEqual(patchedNorm.phone, '07-123-4567');
  assert.strictEqual(patchedNorm.openingHours, '週一～週五 11:00–20:00');
  assert.deepStrictEqual(patchedNorm.categories, ['咖啡廳']);
  console.log('✅ Test 4 Passed: Contribution -> Admin Partial PATCH -> Detail Normalization data chain.');

  // Test 5: RestaurantCard 2.0 View Model rendering with averageSpend & Category
  const cardHtml = RestaurantCard.render(patched);
  assert(cardHtml.includes('約 NT$250 / 人'), 'Card renders average spend correctly');
  assert(cardHtml.includes('咖啡廳'), 'Card renders primary category correctly');
  console.log('✅ Test 5 Passed: RestaurantCard correctly displays averageSpend & category.');

  console.log('🎉 All Place Detail Fields & Normalization Tests passed successfully!');
})();
