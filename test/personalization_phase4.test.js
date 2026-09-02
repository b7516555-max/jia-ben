const assert = require('assert');
global.window = global;

const Personalization = require('../src/services/personalization.js');
const imageSafety = require('../src/utils/imageSafety.js');
const RestaurantCard = require('../src/components/restaurantCard.js');
global.imageSafety = imageSafety;

(async () => {
  console.log('--- Starting Jia-ben Personalization Phase 4 Unit Tests ---');

  // Test 1: Module exports and methods availability
  assert(Personalization, 'Personalization module exists');
  assert.strictEqual(typeof Personalization.buildUserTasteProfile, 'function', 'buildUserTasteProfile is function');
  assert.strictEqual(typeof Personalization.calculatePersonalRecommendationWeight, 'function', 'calculatePersonalRecommendationWeight is function');
  assert.strictEqual(typeof Personalization.getForYouRecommendations, 'function', 'getForYouRecommendations is function');
  assert.strictEqual(typeof Personalization.calculateGroupRecommendationWeight, 'function', 'calculateGroupRecommendationWeight is function');

  // Test 2: Implicit Taste Profile Builder
  const mockStates = {
    'place_1': { wantToEat: true, ate: false, visitCount: 0, lastVisitedAt: null },
    'place_2': { wantToEat: false, ate: true, visitCount: 5, lastVisitedAt: new Date().toISOString() },
    'place_3': { wantToEat: false, ate: true, visitCount: 1, lastVisitedAt: '2026-01-01T00:00:00.000Z' }
  };
  const mockFeed = [
    { creator: '黃政誥', restaurantName: '鼎泰豐', rating: 'super', group: '主揪' },
    { creator: '黃政誥', restaurantName: '瞞著爹', rating: 'good', group: '主揪' },
    { creator: '小華', restaurantName: '麥當勞', rating: 'bad', group: '社發' }
  ];
  const mockRestaurants = [
    { creator: '黃政誥', name: '鼎泰豐', category: '台式料理', city: '台北市', group: '主揪' },
    { creator: '黃政誥', name: '瞞著爹', category: '日式料理', city: '台北市', group: '主揪' }
  ];
  const mockParties = [
    { title: '週末聚餐', joined: ['黃政誥', '小華'], location: '台北市大安區' }
  ];
  const mockPlaces = [
    { jiaPlaceId: 'place_1', name: '牛肉麵王', categories: ['牛肉麵', '台式料理'], city: '台北市', location: { lat: 25.033, lng: 121.565 } },
    { jiaPlaceId: 'place_2', name: '瞞著爹', categories: ['日式料理', '生魚片'], city: '台北市', location: { lat: 25.041, lng: 121.552 } },
    { jiaPlaceId: 'place_3', name: '鼎泰豐', categories: ['台式料理', '小籠包'], city: '台北市', location: { lat: 25.033, lng: 121.530 } }
  ];

  const profile = Personalization.buildUserTasteProfile({
    userName: '黃政誥',
    userPlaceStates: mockStates,
    feedData: mockFeed,
    restaurantData: mockRestaurants,
    partyData: mockParties,
    placesData: mockPlaces
  });

  assert.strictEqual(profile.userName, '黃政誥', 'Profile userName matches');
  assert(profile.favoriteCategories['台式料理'] > 0, 'Favorite categories has 台式料理');
  assert(profile.favoriteCategories['日式料理'] > 0, 'Favorite categories has 日式料理');
  assert.strictEqual(profile.wantToEatList.length, 1, 'Want to eat list length is 1');
  assert.strictEqual(profile.visitedList.length, 2, 'Visited list length is 2');
  console.log('✅ Test 1 & 2 Passed: Taste profile implicit learning correctly derived preferences.');

  // Test 3: Recommendation Weight Scoring with Exploration Multiplier
  const testPlaceAffinity = {
    jiaPlaceId: 'place_99',
    name: '台式滷肉飯專門店',
    categories: ['台式料理', '小吃'],
    city: '台北市',
    location: { lat: 25.034, lng: 121.566 },
    communityStats: { ratingAverage: 4.8, ratingCount: 15, averageSpend: 150 }
  };
  const testPlaceUnrelated = {
    jiaPlaceId: 'place_100',
    name: '美式漢堡專門店',
    categories: ['美式料理', '漢堡'],
    city: '台北市',
    location: { lat: 25.034, lng: 121.566 },
    communityStats: { ratingAverage: 3.5, ratingCount: 2, averageSpend: 350 }
  };

  const scoreAffinity = Personalization.calculatePersonalRecommendationWeight(testPlaceAffinity, profile, { userLocation: { lat: 25.033, lng: 121.565 } });
  const scoreUnrelated = Personalization.calculatePersonalRecommendationWeight(testPlaceUnrelated, profile, { userLocation: { lat: 25.033, lng: 121.565 } });

  assert(scoreAffinity.totalWeight > scoreUnrelated.totalWeight, 'Affinity place has higher recommendation weight');
  assert(scoreAffinity.reason, 'Recommendation reason generated');
  console.log('✅ Test 3 Passed: Composite recommendation weighting works with reason:', scoreAffinity.reason);

  // Test 4: 75% Affinity + 25% Exploration Balance
  const forYouList = Personalization.getForYouRecommendations([...mockPlaces, testPlaceAffinity, testPlaceUnrelated], profile, { limit: 4 });
  assert(Array.isArray(forYouList), 'For you is array');
  assert(forYouList.length >= 1 && forYouList.length <= 4, 'For you returns within limit');
  assert(forYouList[0]._recommendationReason, 'For you recommendation has recommendation reason badge');
  console.log('✅ Test 4 Passed: For You recommendations delivered with reasons.');

  // Test 5: Multi-Person Fair Group Recommendation Aggregation
  const profile2 = Personalization.buildUserTasteProfile({
    userName: '小華',
    userPlaceStates: {},
    feedData: [{ creator: '小華', restaurantName: '美式漢堡專門店', rating: 'super' }],
    restaurantData: [{ creator: '小華', name: '美式漢堡專門店', category: '美式料理' }],
    partyData: [],
    placesData: []
  });

  const groupScoreAffinity = Personalization.calculateGroupRecommendationWeight([profile, profile2], testPlaceAffinity);
  const groupScoreBurger = Personalization.calculateGroupRecommendationWeight([profile, profile2], testPlaceUnrelated);
  assert(groupScoreAffinity.groupWeight > 0, 'Group score is positive');
  assert(groupScoreBurger.groupWeight > 0, 'Group score for burger is positive');
  console.log('✅ Test 5 Passed: Fair group aggregation computed without starvation.');

  // Test 6: AI Food Photography & Safety Fallback
  const aiLuRou = imageSafety.getAiFoodImageForPlace({ name: '金峰滷肉飯', categories: ['台式料理'] });
  assert(aiLuRou.includes('lu_rou_fan.jpg'), 'Mapped to lu_rou_fan AI image');

  const aiRamen = imageSafety.getAiFoodImageForPlace({ name: '一蘭拉麵', categories: ['日式拉麵'] });
  assert(aiRamen.includes('ramen.jpg'), 'Mapped to ramen AI image');

  const aiYakiniku = imageSafety.getAiFoodImageForPlace({ name: '乾杯燒肉居酒屋', categories: ['燒肉'] });
  assert(aiYakiniku.includes('yakiniku.jpg'), 'Mapped to yakiniku AI image');
  console.log('✅ Test 6 Passed: AI Food photo fallbacks correctly map dish keywords.');

  // Test 7: RestaurantCard 2.0 with Recommendation Reason Pill
  const cardHtml = RestaurantCard.render({
    ...testPlaceAffinity,
    _recommendationReason: '❤️ 你最愛的台式料理'
  });
  assert(cardHtml.includes('你最愛的台式料理'), 'Card markup contains recommendation pill text');
  console.log('✅ Test 7 Passed: RestaurantCard 2.0 successfully displays recommendation badge pill.');

  console.log('🎉 All Jia-ben Personalization Phase 4 unit tests passed successfully!');
})();
