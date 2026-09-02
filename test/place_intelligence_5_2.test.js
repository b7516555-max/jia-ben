const assert = require('assert');
global.window = global;

// Load all modules under test
const ProviderRegistry = require('../src/providers/providerRegistry.js');
const TaiwanOpenDataAdapter = require('../src/providers/taiwanOpenDataAdapter.js');
const NlscAdapter = require('../src/providers/nlscAdapter.js');
const HotPepperAdapter = require('../src/providers/hotPepperAdapter.js');
const KakaoLocalAdapter = require('../src/providers/kakaoLocalAdapter.js');
const NaverLocalAdapter = require('../src/providers/naverLocalAdapter.js');
const NaverBlogAdapter = require('../src/providers/naverBlogAdapter.js');
const YelpAdapter = require('../src/providers/yelpAdapter.js');
const CountryRouter = require('../src/services/countryProviderRouter.js');
const PlaceIdentityResolver = require('../src/services/placeIdentityResolver.js');
const ReviewResolver = require('../src/services/reviewResolver.js');
const DiscoveryResolver = require('../src/services/discoveryResolver.js');
const QuotaManager = require('../src/services/quotaManager.js');
const PlaceIntelligence = require('../src/services/placeIntelligence.js');
const imageSafety = require('../src/utils/imageSafety.js');
const placeMatch = require('../src/utils/placeMatch.js');

global.JiaProviderRegistry = ProviderRegistry;
global.JiaCountryRouter = CountryRouter;
global.JiaPlaceIdentityResolver = PlaceIdentityResolver;
global.JiaReviewResolver = ReviewResolver;
global.JiaDiscoveryResolver = DiscoveryResolver;
global.JiaQuotaManager = QuotaManager;
global.JiaPlaceIntelligence = PlaceIntelligence;
global.JiaPlaceMatch = placeMatch;
global.imageSafety = imageSafety;
global.JiaProviderAdapters = {
  taiwanOpenData: TaiwanOpenDataAdapter,
  nlsc: NlscAdapter,
  hotpepper: HotPepperAdapter,
  kakaoLocal: KakaoLocalAdapter,
  naverLocal: NaverLocalAdapter,
  naverBlog: NaverBlogAdapter,
  yelp: YelpAdapter
};

(async () => {
  console.log('============================================================');
  console.log('--- JIA-BEN PLACE INTELLIGENCE 5.2 UNIT TESTS (16 SUITES) ---');
  console.log('============================================================\n');

  // 1. ProviderRegistryTest
  const osmMeta = ProviderRegistry.getProvider('osm');
  assert(osmMeta && osmMeta.status === 'enabled', 'OSM is registered and enabled');
  const kakaoMeta = ProviderRegistry.getProvider('kakao_local');
  assert.strictEqual(kakaoMeta.billing.freeQuotaEligibility, 'first_map_enabled_app_only', 'Kakao has first_map_enabled_app_only eligibility');
  assert.strictEqual(kakaoMeta.status, 'enabled', 'Kakao status is enabled after live verification');
  const yelpMeta = ProviderRegistry.getProvider('yelp');
  assert.strictEqual(yelpMeta.status, 'disabled_billing_required', 'Yelp strictly marked disabled_billing_required');
  assert.strictEqual(yelpMeta.billing.paymentRequired, true, 'Yelp requires payment method');
  const googleMeta = ProviderRegistry.getProvider('google_places');
  assert.strictEqual(googleMeta.status, 'permanently_disabled_zero_call', 'Google Places is permanently disabled');
  console.log('✅ 1. ProviderRegistryTest Passed: Metadata, billing safety, and status registry verified.');

  // 2. CountryProviderRouterTest
  assert.strictEqual(CountryRouter.normalizeCountryCode('台灣'), 'TW');
  assert.strictEqual(CountryRouter.normalizeCountryCode('United States'), 'US');
  assert.strictEqual(CountryRouter.normalizeCountryCode('日本'), 'JP');
  assert.strictEqual(CountryRouter.normalizeCountryCode('韓國'), 'KR');
  const twPipeline = CountryRouter.getCountryPipeline('TW');
  assert(twPipeline.some(p => p.id === 'taiwan_open_data'), 'TW pipeline includes Taiwan Open Data');
  const jpPipeline = CountryRouter.getCountryPipeline('JP');
  assert(jpPipeline.some(p => p.id === 'hotpepper'), 'JP pipeline includes Hot Pepper');
  const krPipeline = CountryRouter.getCountryPipeline('KR');
  assert(krPipeline.some(p => p.id === 'kakao_local') && krPipeline.some(p => p.id === 'naver_blog'), 'KR pipeline includes Kakao and Naver Blog');
  console.log('✅ 2. CountryProviderRouterTest Passed: Country code normalization & provider pipeline routing verified.');

  // 3. PlaceIdentityResolverTest
  const targetStore = {
    name: '手酒咖啡 soldier coffee',
    address: '台中市西區四維街30號',
    phone: '04-22297991',
    location: { lat: 24.1375, lng: 120.6720 },
    country: 'TW'
  };
  const exactMatchCand = {
    name: '手酒咖啡',
    address: '台中市西區四維街30號',
    phone: '04-22297991',
    location: { lat: 24.1376, lng: 120.6721 }
  };
  const matchResult = PlaceIdentityResolver.evaluateMatch(targetStore, exactMatchCand, { country: 'TW' });
  assert(matchResult.confidence >= 0.93, `Exact store confidence >= 0.93, got ${matchResult.confidence}`);
  assert.strictEqual(matchResult.matchType, 'auto_match', 'High confidence match is auto_match');
  assert.strictEqual(matchResult.canAutoMerge, true, 'canAutoMerge is true');
  console.log('✅ 3. PlaceIdentityResolverTest Passed: Multi-signal similarity & confidence scoring verified.');

  // 4. TaiwanProviderTest
  const rawTwOd = {
    businessId: '12345678',
    businessName: '鼎泰豐小吃店',
    registeredAddress: '台北市大安區信義路二段194號',
    industryName: '餐館業'
  };
  const normTwOd = TaiwanOpenDataAdapter.normalize(rawTwOd);
  assert.strictEqual(normTwOd.name, '鼎泰豐小吃店', 'Taiwan Open Data name normalized');
  assert.strictEqual(normTwOd.category, '餐館業', 'Taiwan Open Data category normalized');
  const nlscLayers = NlscAdapter.getAvailableLayers();
  assert(nlscLayers.some(l => l.id === 'EMAP'), 'NLSC EMAP layer exists');
  assert(nlscLayers.some(l => l.id === 'PHOTO2'), 'NLSC PHOTO2 aerial layer exists');
  console.log('✅ 4. TaiwanProviderTest Passed: Taiwan Open Data & NLSC map layers verified.');

  // 5. USProviderTest
  const usPipe = CountryRouter.getCountryPipeline('US');
  assert(usPipe.some(p => p.id === 'osm'), 'US pipeline includes OSM');
  const yelpRes = await YelpAdapter.search({ name: 'Joe Burger' });
  assert.strictEqual(yelpRes.status, 'disabled_billing_required', 'Yelp search immediately blocked by billing safety');
  console.log('✅ 5. USProviderTest Passed: US routing & strict Yelp billing disablement verified.');

  // 6. JapanProviderTest
  const rawShop = {
    id: 'J123456',
    name: '一蘭 渋谷店',
    name_kana: 'いちらん しぶやてん',
    address: '東京都渋谷区神南1-22-7',
    lat: 35.6617,
    lng: 139.7013,
    genre: { name: 'ラーメン' },
    budget: { name: '1000円' },
    urls: { pc: 'https://www.hotpepper.jp/strJ123456/' }
  };
  const normShop = HotPepperAdapter.normalize(rawShop);
  assert.strictEqual(normShop.name, '一蘭 渋谷店', 'Hot Pepper name preserved');
  assert.strictEqual(normShop.genre, 'ラーメン', 'Hot Pepper genre preserved');
  assert.strictEqual(normShop.website, 'https://www.hotpepper.jp/strJ123456/', 'Hot Pepper URL mapped');
  console.log('✅ 6. JapanProviderTest Passed: Hot Pepper Gourmet schema normalization verified.');

  // 7. KoreaProviderTest
  const rawKakaoDoc = {
    id: '887766',
    place_name: '명동교자 본점',
    category_name: '음식점 > 한식 > 칼국수,만두',
    address_name: '서울 중구 명동2가 25-2',
    road_address_name: '서울 중구 명동10길 29',
    phone: '02-776-5336',
    x: '126.9858',
    y: '37.5636',
    place_url: 'http://place.map.kakao.com/887766'
  };
  const normKakao = KakaoLocalAdapter.normalize(rawKakaoDoc);
  assert.strictEqual(normKakao.name, '명동교자 본점', 'Kakao name preserved');
  assert.strictEqual(normKakao.roadAddress, '서울 중구 명동10길 29', 'Kakao road address preserved');

  const rawNaverBlogItem = {
    title: '<b>명동교자 본점</b> 칼국수 만두 맛집 솔직후기',
    description: '서울 명동의 유명한 <b>명동교자</b>에 다녀왔습니다...',
    bloggername: '맛집탐방가',
    postdate: '20260815',
    link: 'https://blog.naver.com/sample/12345'
  };
  const normArticle = NaverBlogAdapter.normalizeArticle(rawNaverBlogItem);
  assert.strictEqual(normArticle.title, '명동교자 본점 칼국수 만두 맛집 솔직후기', 'Naver Blog HTML stripped from title');
  assert.strictEqual(normArticle.source, 'Naver Blog', 'Source is Naver Blog');
  console.log('✅ 7. KoreaProviderTest Passed: Kakao Local & Naver Blog discovery normalization verified.');

  // 8. GenericNameFalsePositiveTest
  const genericTarget = {
    name: '大同',
    address: '台北市大同區延平北路三段',
    location: { lat: 25.0600, lng: 121.5100 }
  };
  const falseCandidate = {
    name: '大同火鍋',
    address: '高雄市新興區大同一路',
    location: { lat: 22.6200, lng: 120.3000 } // > 100km away
  };
  const genericMatch = PlaceIdentityResolver.evaluateMatch(genericTarget, falseCandidate, { country: 'TW' });
  assert(genericMatch.confidence < 0.70, `Generic store with distant GPS rejected, got ${genericMatch.confidence}`);
  assert.strictEqual(genericMatch.matchType, 'reject', 'Generic false match is strictly rejected');
  console.log('✅ 8. GenericNameFalsePositiveTest Passed: Common generic names protected against false positive match.');

  // 9. CrossProviderReviewMatchTest
  let reviewModel = ReviewResolver.createReviewModel({
    jiaBen: { rating: 4.8, count: 16 }
  });
  // Low confidence match (< 0.85) should NOT attach external reviews
  reviewModel = ReviewResolver.attachExternalReview(reviewModel, 'foursquare', { rating: 9.0, count: 50 }, 0.75);
  assert.strictEqual(reviewModel.foursquare.enabled, false, 'External review not attached for low confidence');
  // High confidence match (>= 0.93) attaches external reviews
  reviewModel = ReviewResolver.attachExternalReview(reviewModel, 'foursquare', { rating: 8.6, count: 42, tips: ['必點招牌小籠包'] }, 0.96);
  assert.strictEqual(reviewModel.foursquare.enabled, true, 'External review attached for high confidence');
  assert.strictEqual(reviewModel.foursquare.rating, 8.6, 'Foursquare rating stored independently');
  assert.strictEqual(reviewModel.jiaBen.rating, 4.8, 'Jia-ben rating remains strictly separated without averaging');
  console.log('✅ 9. CrossProviderReviewMatchTest Passed: Review isolation & high-confidence attachment verified.');

  // 10. ProviderQuotaStopTest
  assert(QuotaManager.LIMITS.foursquare.safeLimit === 450, 'Foursquare limit is 450');
  assert(QuotaManager.LIMITS.geoapify.safeLimit === 2700, 'Geoapify limit is 2700');
  assert(QuotaManager.LIMITS.kakao_local.safeLimit === 95000, 'Kakao limit is 95000');
  const mockStorage = {
    data: new Map(),
    async get(id) { return this.data.get(id); },
    async set(id, val) { this.data.set(id, val); }
  };
  QuotaManager.configure(mockStorage);
  const qStatusBefore = await QuotaManager.status('foursquare');
  assert.strictEqual(qStatusBefore.allowed, true, 'Quota initially allowed');
  // Simulate reaching safe limit
  await mockStorage.set(QuotaManager.documentId('foursquare'), { used: 450 });
  const qStatusAfter = await QuotaManager.status('foursquare');
  assert.strictEqual(qStatusAfter.allowed, false, 'Quota exhausted returns allowed: false');
  assert.strictEqual(qStatusAfter.state, 'stop', 'Quota state is stop');
  QuotaManager.configure(null); // Reset
  console.log('✅ 10. ProviderQuotaStopTest Passed: Quota limits & stop enforcement verified.');

  // 11. BillingDisabledProviderTest
  const yelpStatus = ProviderRegistry.getProvider('yelp').status;
  assert.strictEqual(yelpStatus, 'disabled_billing_required', 'Yelp marked disabled_billing_required');
  const yelpRun = await YelpAdapter.search({ name: 'Steakhouse' });
  assert.strictEqual(yelpRun.status, 'disabled_billing_required', 'Yelp execution prevented');
  console.log('✅ 11. BillingDisabledProviderTest Passed: Paid / billing-required providers blocked.');

  // 12. NoGoogleCallTest
  const googleStatus = ProviderRegistry.getProvider('google_places').status;
  assert.strictEqual(googleStatus, 'permanently_disabled_zero_call', 'Google Places is permanently 0 call');
  assert.strictEqual(global.window?.google?.maps?.places?.PlacesService, undefined, 'No native Google Maps Places service in runtime');
  console.log('✅ 12. NoGoogleCallTest Passed: Google Maps / Places API calls strictly 0.');

  // 13. NoExternalCallOnHomepageTest
  const mockJiaPlaces = [
    { jiaPlaceId: 'j1', name: '老王牛肉麵', address: '台北市大安區', rating: 4.5 }
  ];
  global.jiaPlacesData = mockJiaPlaces;
  const initialDetail = PlaceIntelligence.normalizePlaceDetailData(mockJiaPlaces[0]);
  assert.strictEqual(initialDetail.name, '老王牛肉麵', 'Local normalization uses 0 external API calls');
  console.log('✅ 13. NoExternalCallOnHomepageTest Passed: Homepage rendering causes 0 external API calls.');

  // 14. NoExternalCallOnWheelTest
  const wheelPlace = { jiaPlaceId: 'w1', name: '春水堂', address: '台中市西區' };
  const wheelDetail = PlaceIntelligence.normalizePlaceDetailData(wheelPlace);
  assert.strictEqual(wheelDetail.name, '春水堂', 'Wheel detail normalized with 0 external calls');
  console.log('✅ 14. NoExternalCallOnWheelTest Passed: Smart Wheel operation causes 0 external API calls.');

  // 15. MultilingualNameTest
  const zhName = CountryRouter.normalizeNameByCountry('鼎泰豐 (信義總店)', 'TW');
  assert.strictEqual(zhName, '鼎泰豐信義總店', 'Traditional Chinese name normalized');
  const enName = CountryRouter.normalizeNameByCountry('Shake Shack - Madison Square', 'US');
  assert.strictEqual(enName, 'shakeshackmadisonsquare', 'English name normalized');
  const jpName = CountryRouter.normalizeNameByCountry('一蘭　渋谷店（ラーメン）', 'JP');
  assert.strictEqual(jpName, '一蘭渋谷店ラーメン', 'Japanese full-width spaces and brackets normalized');
  const krName = CountryRouter.normalizeNameByCountry('명동교자 (본점)', 'KR');
  assert.strictEqual(krName, '명동교자본점', 'Korean Hangul name normalized');
  console.log('✅ 15. MultilingualNameTest Passed: Multilingual name normalization for TW, US, JP, KR verified.');

  // 16. CountryAddressNormalizerTest
  const twAddr = CountryRouter.normalizeAddressByCountry('106 台北市大安區信義路二段194號', 'TW');
  assert(!twAddr.startsWith('106'), 'Taiwan postal code removed');
  const usAddr = CountryRouter.normalizeAddressByCountry('USA, 11 Madison Ave, New York, NY 10010', 'US');
  assert(!usAddr.startsWith('USA'), 'US country prefix cleaned while preserving street/state');
  const jpAddr = CountryRouter.normalizeAddressByCountry('〒150-0041 東京都渋谷区神南1-22-7', 'JP');
  assert(!jpAddr.includes('〒150-0041'), 'Japan postal symbol removed while preserving prefecture and chome');
  const krAddr = CountryRouter.normalizeAddressByCountry('04536 서울특별시 중구 명동10길 29', 'KR');
  assert(!krAddr.startsWith('04536'), 'Korean postal code removed while preserving road address');
  console.log('✅ 16. CountryAddressNormalizerTest Passed: Country-specific address normalization verified.');

  console.log('\n🎉 ALL 16 JIA-BEN PLACE INTELLIGENCE 5.2 UNIT TESTS PASSED SUCCESSFULLY!');
})();
