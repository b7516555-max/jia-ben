const assert = require('assert');
global.window = global;

const CommunityData = require('../src/services/communityData.js');
const SmartWheel = require('../src/services/smartWheel.js');
const RestaurantCard = require('../src/components/restaurantCard.js');
const imageSafety = require('../src/utils/imageSafety.js');
global.imageSafety = imageSafety;

(async () => {
  console.log('--- Starting Jia-ben Community Data Phase 3 Unit Tests ---');

  // Test 1: Category Dictionary Coverage
  assert(Array.isArray(CommunityData.CATEGORY_DICTIONARY), 'Category dictionary is array');
  assert(CommunityData.CATEGORY_DICTIONARY.length >= 20, 'Category dictionary has >= 20 categories');
  assert(CommunityData.CATEGORY_DICTIONARY.includes('台式料理'), 'Includes 台式料理');
  assert(CommunityData.CATEGORY_DICTIONARY.includes('日式燒肉'), 'Includes 日式燒肉');

  // Test 2: Text sanitization (Anti-XSS)
  const dirty = '<script>alert("hack")</script> & "test"';
  const clean = CommunityData.sanitizeText(dirty);
  assert(!clean.includes('<script>'), 'Sanitized XSS tags');
  assert(clean.includes('&lt;script&gt;'), 'HTML escaped');

  // Test 3: Phone number validation (TW Landline & Mobile)
  const validMobile = CommunityData.validateAndNormalizePhone('0912345678');
  assert.strictEqual(validMobile.valid, true, 'Valid mobile');
  assert.strictEqual(validMobile.normalized, '0912-345-678', 'Mobile normalized');

  const validLandline = CommunityData.validateAndNormalizePhone('071234567');
  assert.strictEqual(validLandline.valid, true, 'Valid landline');
  assert.strictEqual(validLandline.normalized, '07-123-4567', 'Landline normalized');

  const invalidPhone = CommunityData.validateAndNormalizePhone('12345');
  assert.strictEqual(invalidPhone.valid, false, 'Invalid short phone rejected');

  // Test 4: Address validation (Reject city-only)
  const validAddr = CommunityData.validateAddress('台北市大安區信義路二段198巷6號');
  assert.strictEqual(validAddr.valid, true, 'Full address valid');

  const cityOnlyAddr = CommunityData.validateAddress('台北市');
  assert.strictEqual(cityOnlyAddr.valid, false, 'City only address rejected');

  const shortAddr = CommunityData.validateAddress('路1號');
  assert.strictEqual(shortAddr.valid, false, 'Short address rejected');

  // Test 5: Opening hours schema validation
  const validHours = {
    monday: [{ open: '11:30', close: '14:00' }, { open: '17:00', close: '21:00' }],
    tuesday: []
  };
  const hoursCheck = CommunityData.validateOpeningHoursSchema(validHours);
  assert.strictEqual(hoursCheck.valid, true, 'Valid hours schema');
  assert.strictEqual(hoursCheck.normalized.monday.length, 2, 'Two intervals');

  const invalidHours = { monday: [{ open: '25:00', close: '14:00' }] };
  const invalidHoursCheck = CommunityData.validateOpeningHoursSchema(invalidHours);
  assert.strictEqual(invalidHoursCheck.valid, false, 'Invalid hour 25:00 rejected');

  // Test 6: Spend validation (1 ~ 100,000 integer)
  assert.strictEqual(CommunityData.validateSpend(350).valid, true, '350 is valid spend');
  assert.strictEqual(CommunityData.validateSpend(0).valid, false, '0 is invalid spend');
  assert.strictEqual(CommunityData.validateSpend(150000).valid, false, '150,000 exceeds limit');
  assert.strictEqual(CommunityData.validateSpend(350.5).valid, false, 'Float spend rejected');

  // Test 7: Robust Average Spend (Outlier protection)
  const normalSpends = [200, 220, 250, 280];
  const avgNormal = CommunityData.calculateRobustAverageSpend(normalSpends);
  assert(avgNormal.averageSpend >= 200 && avgNormal.averageSpend <= 280, 'Normal average calculation');

  const outlierSpends = [200, 220, 250, 99999]; // 99999 outlier
  const avgOutlierProtected = CommunityData.calculateRobustAverageSpend(outlierSpends);
  assert(avgOutlierProtected.averageSpend < 1000, 'Trimmed mean filtered out 99999 outlier');

  // Test 8: Place Completeness Calculation
  const richPlace = {
    coverPhoto: 'https://example.com/photo.jpg',
    address: '台北市大安區信義路二段198號',
    phone: '02-2345-6789',
    openingHours: '11:00-21:00',
    categories: ['日式拉麵'],
    communityStats: { ratingCount: 5, averageSpend: 250 }
  };
  const compRich = CommunityData.calculatePlaceCompleteness(richPlace);
  assert(compRich.score >= 80, 'Rich place completeness >= 80%');
  assert.strictEqual(compRich.isComplete, true, 'Marked complete');

  const emptyPlace = { name: '新開小吃店' };
  const compEmpty = CommunityData.calculatePlaceCompleteness(emptyPlace);
  assert(compEmpty.score < 50, 'Empty place completeness < 50%');
  assert(compEmpty.missingTips.length > 0, 'Generates missing tips for users');

  // Test 9: Contribution Creation & Status
  const contrib = CommunityData.createContributionRecord({
    jiaPlaceId: 'jia_test_1',
    uid: 'user_123',
    userName: '小明',
    field: 'phone',
    value: '02-8765-4321'
  });
  assert.strictEqual(contrib.status, 'pending', 'New contribution is pending');
  assert.strictEqual(contrib.field, 'phone');
  assert.strictEqual(contrib.value, '02-8765-4321');

  // Test 10: Partial PATCH Application on Admin Approval (fieldSources)
  const canonical = {
    jiaPlaceId: 'jia_test_1',
    name: '好食麵館',
    address: '台北市信義區',
    fieldSources: {}
  };
  const { updatedPlace, auditedContribution } = CommunityData.applyContributionToPlace(canonical, contrib, 'admin_user');
  assert.strictEqual(updatedPlace.phone, '02-8765-4321', 'Place phone patched');
  assert.strictEqual(updatedPlace.fieldSources.phone, 'community_verified', 'fieldSources marked community_verified');
  assert.strictEqual(auditedContribution.status, 'accepted', 'Contribution status accepted');
  assert.strictEqual(auditedContribution.reviewedBy, 'admin_user');

  // Test 11: Personalization in SmartWheel (Want to eat bonus & Recently ate penalty)
  const mockPlace = {
    jiaPlaceId: 'jia_1',
    name: '極味拉麵',
    location: { lat: 25.04, lng: 121.51 },
    communityStats: { ratingAverage: 4.8, ratingCount: 10 }
  };
  const baseWeight = SmartWheel.calculateRecommendationWeight(mockPlace, {});
  
  // Want to eat context
  const wantContext = { userPlaceStates: { jia_1: { wantToEat: true, ate: false } } };
  const wantWeight = SmartWheel.calculateRecommendationWeight(mockPlace, wantContext);
  assert(wantWeight > baseWeight, 'Want to eat increases weight (1.35x)');

  // Recently ate context (visited 3 days ago)
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const ateRecentContext = { userPlaceStates: { jia_1: { wantToEat: false, ate: true, lastVisitedAt: threeDaysAgo } } };
  const ateRecentWeight = SmartWheel.calculateRecommendationWeight(mockPlace, ateRecentContext);
  assert(ateRecentWeight < baseWeight, 'Recently ate decreases weight (0.4x)');

  // Test 12: RestaurantCard 2.0 State Buttons HTML
  const cardHtml = RestaurantCard.render(mockPlace);
  assert(cardHtml.includes('吃過'), 'Card contains 吃過 button');
  assert(cardHtml.includes('想吃'), 'Card contains 想吃 button');

  console.log('✅ ALL 12 Jia-ben Community Data Phase 3 Unit Tests Passed Successfully!');
})();
