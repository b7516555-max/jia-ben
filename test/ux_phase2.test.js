const assert = require('assert');
global.window = global;

const SmartSearch = require('../src/services/smartSearch.js');
const SmartWheel = require('../src/services/smartWheel.js');
const RestaurantCard = require('../src/components/restaurantCard.js');
const imageSafety = require('../src/utils/imageSafety.js');
global.imageSafety = imageSafety;

const mockPlaces = [
  {
    jiaPlaceId: 'jia_1',
    name: '極味拉麵 站前店',
    categories: ['日式拉麵', '麵食'],
    address: '台北市中正區忠孝西路一段1號',
    city: '台北市',
    location: { lat: 25.0478, lng: 121.5170 },
    communityStats: { ratingAverage: 4.8, ratingCount: 15, averageSpend: 280, spendCount: 10 }
  },
  {
    jiaPlaceId: 'jia_2',
    name: '時光咖啡館',
    categories: ['咖啡', '甜點'],
    address: '台北市大安區敦化南路一段10號',
    city: '台北市',
    location: { lat: 25.0420, lng: 121.5480 },
    communityStats: { ratingAverage: 4.2, ratingCount: 5, averageSpend: 180, spendCount: 4 }
  },
  {
    jiaPlaceId: 'jia_3',
    name: '好想吃燒肉 旗艦總店',
    categories: ['日式燒肉', '燒肉'],
    address: '高雄市左營區博愛二路100號',
    city: '高雄市',
    location: { lat: 22.6680, lng: 120.3020 },
    communityStats: { ratingAverage: 4.9, ratingCount: 22, averageSpend: 850, spendCount: 18 }
  },
  {
    jiaPlaceId: 'jia_4',
    name: '暖暖鍋物',
    categories: ['火鍋', '鍋物'],
    address: '台北市信義區忠孝東路五段100號',
    city: '台北市',
    location: { lat: 25.0410, lng: 121.5700 },
    communityStats: { ratingAverage: 0, ratingCount: 0, averageSpend: 0, spendCount: 0 }
  }
];

(async () => {
  console.log('--- Starting UX Phase 2 Unit Tests ---');

  // Test 1: Synonym expansion & search
  const ramenSyns = SmartSearch.expandSynonyms('ramen');
  assert(ramenSyns.includes('拉麵'), 'Synonym: ramen -> 拉麵');
  
  const searchRamen = SmartSearch.search(mockPlaces, { query: 'ramen' });
  assert.strictEqual(searchRamen.length, 1, 'Search ramen returns 1 match');
  assert.strictEqual(searchRamen[0].place.jiaPlaceId, 'jia_1', 'Match is 極味拉麵');

  // Test 2: BrandCore extraction & match
  const brandCore = SmartSearch.extractBrandCore('好想吃燒肉 旗艦總店');
  assert.strictEqual(brandCore, '好想吃燒肉', 'BrandCore extraction removes 旗艦總店');

  const searchYakiniku = SmartSearch.search(mockPlaces, { query: 'yakiniku' });
  assert.strictEqual(searchYakiniku.length, 1, 'Search yakiniku returns 燒肉');
  assert.strictEqual(searchYakiniku[0].place.jiaPlaceId, 'jia_3');

  // Test 3: Distance calculation & formatting
  const dist = SmartSearch.calculateDistanceKm(25.0478, 121.5170, 25.0420, 121.5480);
  assert(dist > 0 && dist < 5, 'Distance between Taipei stations ~3.2km');
  assert.strictEqual(SmartSearch.formatDistance(0.45), '450 m', 'Format distance < 1km in meters');
  assert.strictEqual(SmartSearch.formatDistance(2.34), '2.3 km', 'Format distance >= 1km');

  // Test 4: SmartWheel Weight Calculation & Distance factor
  const userLocTaipei = { lat: 25.0470, lng: 121.5180 };
  const wRamen = SmartWheel.calculateRecommendationWeight(mockPlaces[0], { userLocation: userLocTaipei });
  const wKaohsiung = SmartWheel.calculateRecommendationWeight(mockPlaces[2], { userLocation: userLocTaipei, maxDistanceKm: 10 });
  assert(wRamen > wKaohsiung, 'Taipei place has significantly higher weight than Kaohsiung place for Taipei user');

  // Test 5: Recent Spin Penalty
  SmartWheel.clearRecommendationHistory();
  SmartWheel.recordRecommendation('jia_1');
  const wRamenPenalized = SmartWheel.calculateRecommendationWeight(mockPlaces[0], { userLocation: userLocTaipei });
  assert(wRamenPenalized < wRamen, 'Recently spun place receives penalty multiplier');

  // Test 6: Wheel Candidates Generation
  const candidates = SmartWheel.getWheelCandidates(mockPlaces, { userLocation: userLocTaipei, maxDistanceKm: 10 });
  assert(candidates.length > 0, 'Candidates pool generated');
  assert(candidates.every(c => c.city === '台北市'), 'Only nearby Taipei places selected within 10km');

  // Test 7: RestaurantCard 2.0 HTML Rendering Safety (No undefined, NaN, or 0.0 rating)
  const cardHtml = RestaurantCard.render(mockPlaces[0], { distanceKm: 0.35 });
  assert(cardHtml.includes('350 m'), 'Card contains formatted distance 350 m');
  assert(cardHtml.includes('4.8'), 'Card contains Jia-ben rating 4.8');
  assert(cardHtml.includes('NT$280'), 'Card contains average spend NT$280');
  assert(!cardHtml.includes('undefined') && !cardHtml.includes('NaN'), 'Card HTML has no undefined/NaN');

  // Test 8: Unrated Place Card Safety (No fake 0.0 or NT$0)
  const unratedCardHtml = RestaurantCard.render(mockPlaces[3]);
  assert(unratedCardHtml.includes('暫無 Jia-ben 評分'), 'Unrated place displays 暫無 Jia-ben 評分');
  assert(!unratedCardHtml.includes('0.0') && !unratedCardHtml.includes('NT$0'), 'Unrated place does not display 0.0 or NT$0');

  // Test 9: Wheel Winner HTML Rendering
  const winnerHtml = RestaurantCard.renderWheelWinner(mockPlaces[0], { distanceKm: 1.2 });
  assert(winnerHtml.includes('命運推薦'), 'Winner card contains 命運推薦');
  assert(winnerHtml.includes('1.2 km'), 'Winner card contains distance 1.2 km');

  console.log('✅ ALL 9 UX Phase 2 Unit Tests Passed Successfully!');
})();
