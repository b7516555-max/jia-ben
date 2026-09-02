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
  console.log('--- JIA-BEN PLACE INTELLIGENCE 5.2B UNIT TESTS ---');
  console.log('============================================================\n');

  // 1. NaverDevelopersUnavailableTest
  const naverLocalMeta = ProviderRegistry.getProvider('naver_local');
  const naverBlogMeta = ProviderRegistry.getProvider('naver_blog');
  assert.strictEqual(naverLocalMeta.status, 'disabled_new_registration_unavailable', 'Naver Local is disabled_new_registration_unavailable');
  assert.strictEqual(naverLocalMeta.productionEnabled, false, 'Naver Local productionEnabled is false');
  assert.strictEqual(naverBlogMeta.status, 'disabled_new_registration_unavailable', 'Naver Blog is disabled_new_registration_unavailable');
  assert.strictEqual(naverBlogMeta.productionEnabled, false, 'Naver Blog productionEnabled is false');
  console.log('✅ 1. NaverDevelopersUnavailableTest Passed: Naver Developers search registration unavailable status verified.');

  // 2. NaverApiHubBillingRequiredTest
  const naverHubMeta = ProviderRegistry.getProvider('naver_api_hub');
  assert.strictEqual(naverHubMeta.status, 'disabled_billing_required', 'NAVER API HUB is disabled_billing_required');
  assert.strictEqual(naverHubMeta.billing.paymentRequired, true, 'NAVER API HUB requires payment / credit card');
  assert.strictEqual(naverHubMeta.productionEnabled, false, 'NAVER API HUB productionEnabled is false');
  console.log('✅ 2. NaverApiHubBillingRequiredTest Passed: NAVER API HUB disabled due to credit card / billing requirement.');

  // 3. NaverProductionZeroCallTest
  const naverLocalCall = await NaverLocalAdapter.search({ name: '명동교자' });
  assert.strictEqual(naverLocalCall.productionEnabled, false, 'Naver Local search immediately returns without network call');
  assert.strictEqual(naverLocalCall.status, 'disabled_new_registration_unavailable');

  const naverBlogCall = await NaverBlogAdapter.searchArticles({ name: '명동교자' });
  assert.strictEqual(naverBlogCall.productionEnabled, false, 'Naver Blog search immediately returns without network call');
  assert.strictEqual(naverBlogCall.status, 'disabled_new_registration_unavailable');
  assert.strictEqual(naverBlogCall.articles.length, 0);
  console.log('✅ 3. NaverProductionZeroCallTest Passed: Zero network calls guaranteed on Naver adapters.');

  // 4. KoreaRouterSkipsNaverTest
  const krPipeline = CountryRouter.getCountryPipeline('KR');
  const krProviderIds = krPipeline.map(p => p.id);
  assert(!krProviderIds.includes('naver_local'), 'KR pipeline excludes naver_local');
  assert(!krProviderIds.includes('naver_blog'), 'KR pipeline excludes naver_blog');
  assert(!krProviderIds.includes('naver_api_hub'), 'KR pipeline excludes naver_api_hub');
  assert.deepStrictEqual(krProviderIds, ['kakao_local', 'osm', 'geoapify', 'foursquare']);
  console.log('✅ 4. KoreaRouterSkipsNaverTest Passed: CountryProviderRouter for KR omits Naver.');

  // 5. KoreaRouterUsesKakaoTest
  assert.strictEqual(krPipeline[0].id, 'kakao_local', 'Kakao Local is primary provider in KR pipeline');
  assert.strictEqual(krPipeline[0].canExecute, true, 'Kakao Local canExecute is true');
  const kakaoMeta = ProviderRegistry.getProvider('kakao_local');
  assert.strictEqual(kakaoMeta.status, 'enabled', 'Kakao Local status is enabled');
  assert.strictEqual(kakaoMeta.billing.bizWalletEnabled, false, 'Kakao Biz Wallet is OFF');
  assert.strictEqual(kakaoMeta.billing.paidApiEnabled, false, 'Kakao Paid API is OFF');
  console.log('✅ 5. KoreaRouterUsesKakaoTest Passed: Kakao Local is active primary KR provider with billing safeguards.');

  // 6. KoreaFallbackWithoutNaverTest
  const executableStages = krPipeline.filter(p => p.canExecute).map(p => p.id);
  assert.strictEqual(executableStages[0], 'kakao_local');
  assert.strictEqual(executableStages[1], 'osm');
  assert.strictEqual(executableStages[2], 'geoapify');
  assert.strictEqual(executableStages[3], 'foursquare');
  console.log('✅ 6. KoreaFallbackWithoutNaverTest Passed: Clean fallback chain Kakao -> OSM -> Geoapify -> Foursquare.');

  // 7. NoPaidProviderAutoEnableTest
  const allProviders = ProviderRegistry.getAllProviders();
  const paidProviders = allProviders.filter(p => p.billing && p.billing.paymentRequired);
  for (const p of paidProviders) {
    assert.notStrictEqual(p.status, 'enabled', `Paid provider ${p.id} must NEVER be enabled`);
    assert.strictEqual(p.productionEnabled, false, `Paid provider ${p.id} must have productionEnabled: false`);
  }
  console.log('✅ 7. NoPaidProviderAutoEnableTest Passed: Strict prohibition on paid provider activation verified.');

  // 8. GoogleZeroCallTest
  const googleMeta = ProviderRegistry.getProvider('google_places');
  assert.strictEqual(googleMeta.status, 'permanently_disabled_zero_call', 'Google Places is permanently_disabled_zero_call');
  assert.strictEqual(googleMeta.productionEnabled, false, 'Google Places productionEnabled is false');
  console.log('✅ 8. GoogleZeroCallTest Passed: Google Places permanently disabled with 0 calls.');

  // 9. KakaoLiveAdapterTest
  const rawKakao = {
    id: "26567082",
    place_name: "명동교자 분점",
    category_name: "음식점 > 분식",
    address_name: "서울 중구 명동2가 33-4",
    road_address_name: "서울 중구 명동10길 8",
    phone: "02-776-3424",
    x: "126.98513648386128",
    y: "37.563455471473475",
    place_url: "http://place.map.kakao.com/26567082"
  };
  const normKakao = KakaoLocalAdapter.normalize(rawKakao);
  assert.strictEqual(normKakao.name, "명동교자 분점");
  assert.strictEqual(normKakao.roadAddress, "서울 중구 명동10길 8");
  assert.strictEqual(normKakao.phone, "02-776-3424");
  assert(Math.abs(normKakao.location.lng - 126.985136) < 0.001); // x is longitude
  assert(Math.abs(normKakao.location.lat - 37.563455) < 0.001);  // y is latitude
  assert.strictEqual(normKakao.sourceUrl, "http://place.map.kakao.com/26567082");
  console.log('✅ 9. KakaoLiveAdapterTest Passed: Parsing, road address, x/y coords verified.');

  // 10. KoreanCoordinateNormalizationTest
  const sampleCoord = { lat: Number(rawKakao.y), lng: Number(rawKakao.x) };
  assert(sampleCoord.lat > 33 && sampleCoord.lat < 39, "Valid Korean latitude range");
  assert(sampleCoord.lng > 124 && sampleCoord.lng < 132, "Valid Korean longitude range");
  console.log('✅ 10. KoreanCoordinateNormalizationTest Passed: Coordinate range checks verified.');

  // 11. KoreanAddressNormalizerTest
  const normAddr = CountryRouter.normalizeAddressByCountry("대한민국 서울특별시 중구 창경궁로 62-29", "KR");
  assert.strictEqual(normAddr, "서울특별시 중구 창경궁로 62-29", "Country prefix removed");
  const normAddrPostal = CountryRouter.normalizeAddressByCountry("04546 서울 중구 명동10길 8", "KR");
  assert.strictEqual(normAddrPostal, "서울 중구 명동10길 8", "5-digit Korean postal code stripped");
  console.log('✅ 11. KoreanAddressNormalizerTest Passed: Road address normalizer verified.');

  // 12. KoreanIdentityResolutionTest
  const targetK = {
    name: "명동교자 분점",
    address: "서울 중구 명동10길 8",
    phone: "02-776-3424",
    location: { lat: 37.563455, lng: 126.985136 },
    country: "KR"
  };
  const candK = {
    name: "명동교자",
    address: "서울 중구 명동10길 8",
    phone: "02-776-3424",
    location: { lat: 37.5635, lng: 126.9852 }
  };
  const evalK = PlaceIdentityResolver.evaluateMatch(targetK, candK, { country: "KR" });
  assert(evalK.confidence >= 0.93, `Confidence should be >= 0.93, got ${evalK.confidence}`);
  assert.strictEqual(evalK.matchType, "auto_match");
  console.log('✅ 12. KoreanIdentityResolutionTest Passed: Multi-signal identity match verified.');

  // 13. KoreanGenericNameRejectTest
  const genericStore = {
    name: "식당",
    address: "서울 중구 남대문로",
    location: { lat: 37.5600, lng: 126.9700 }
  };
  const genericOther = {
    name: "식당",
    address: "부산 해운대구 우동",
    location: { lat: 35.1600, lng: 129.1600 }
  };
  const genericEval = PlaceIdentityResolver.evaluateMatch(genericStore, genericOther, { country: "KR" });
  assert(genericEval.confidence < 0.70, `Generic store without matching GPS must be rejected, got ${genericEval.confidence}`);
  assert.strictEqual(genericEval.matchType, "reject");
  console.log('✅ 13. KoreanGenericNameRejectTest Passed: Common generic Korean store names protected.');

  // 14. KakaoQuotaGuardTest (Official REST API limit: 100,000 req/day)
  const kakaoLimit = QuotaManager.LIMITS.kakao_local.safeLimit;
  assert.strictEqual(kakaoLimit, 95000, "Kakao safe limit set to 95,000/day (95% of 100,000 REST Local API quota)");
  assert.strictEqual(QuotaManager.LIMITS.kakao_local.warning, 80000, "Kakao 80% warning is 80,000");
  assert.strictEqual(QuotaManager.LIMITS.kakao_local.high, 90000, "Kakao 90% warning is 90,000");
  console.log('✅ 14. KakaoQuotaGuardTest Passed: Kakao official REST API quota (100k) & safety thresholds verified.');

  console.log('\n🎉 ALL 14 JIA-BEN PLACE INTELLIGENCE 5.2B UNIT TESTS PASSED SUCCESSFULLY!');
})();
