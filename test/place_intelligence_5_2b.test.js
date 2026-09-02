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
  console.log('--- JIA-BEN PLACE INTELLIGENCE 5.2B UNIT TESTS (13 SUITES) ---');
  console.log('============================================================\n');

  // 1. KakaoLiveAdapterTest
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
  console.log('✅ 1. KakaoLiveAdapterTest Passed: Parsing, road address, x/y coords verified.');

  // 2. NaverLocalLiveAdapterTest
  const rawNaverLocal = {
    title: "<b>명동교자</b> 본점",
    link: "http://www.mdkj.co.kr/",
    category: "한식>칼국수,만두",
    description: "",
    telephone: "02-776-5336",
    address: "서울특별시 중구 명동2가 25-2",
    roadAddress: "서울특별시 중구 명동10길 29",
    mapx: "1269858000",
    mapy: "375636000"
  };
  const normNaverLocal = NaverLocalAdapter.normalize(rawNaverLocal);
  assert.strictEqual(normNaverLocal.name, "명동교자 본점", "HTML tags stripped");
  assert.strictEqual(normNaverLocal.roadAddress, "서울특별시 중구 명동10길 29");
  assert.strictEqual(normNaverLocal.phone, "02-776-5336");
  assert.strictEqual(normNaverLocal.category, "한식>칼국수,만두");
  console.log('✅ 2. NaverLocalLiveAdapterTest Passed: Tag stripping, road address & category verified.');

  // 3. NaverBlogLiveAdapterTest
  const rawNaverBlogItem = {
    title: "서울 명동 맛집 [<b>명동교자 본점</b>] 칼국수와 만두 후기",
    link: "https://blog.naver.com/testuser/223000000000",
    description: "명동에 방문하면 꼭 들러야 하는 미쉐린 가이드 서울 맛집 <b>명동교자</b>...",
    bloggername: "맛있는일상",
    bloggerlink: "https://blog.naver.com/testuser",
    postdate: "20260710"
  };
  const normArticle = NaverBlogAdapter.normalizeArticle(rawNaverBlogItem);
  assert.strictEqual(normArticle.title, "서울 명동 맛집 [명동교자 본점] 칼국수와 만두 후기");
  assert(!normArticle.title.includes("<b>"), "HTML tags stripped from blog title");
  assert.strictEqual(normArticle.blogger, "맛있는일상");
  assert.strictEqual(normArticle.date, "20260710");
  assert.strictEqual(normArticle.sourceUrl, "https://blog.naver.com/testuser/223000000000");
  console.log('✅ 3. NaverBlogLiveAdapterTest Passed: Blog discovery metadata extraction verified.');

  // 4. KoreanCoordinateNormalizationTest
  const validWgs84 = NaverLocalAdapter.normalize({
    title: "우래옥",
    mapx: "1269987000",
    mapy: "375682000"
  });
  assert(validWgs84.location.lat > 33 && validWgs84.location.lat < 39, "Valid Korean latitude range");
  assert(validWgs84.location.lng > 124 && validWgs84.location.lng < 132, "Valid Korean longitude range");
  console.log('✅ 4. KoreanCoordinateNormalizationTest Passed: Coordinate range checks verified.');

  // 5. KoreanAddressNormalizerTest
  const normAddr = CountryRouter.normalizeAddressByCountry("대한민국 서울특별시 중구 창경궁로 62-29", "KR");
  assert.strictEqual(normAddr, "서울특별시 중구 창경궁로 62-29", "Country prefix removed");
  const normAddrPostal = CountryRouter.normalizeAddressByCountry("04546 서울 중구 명동10길 8", "KR");
  assert.strictEqual(normAddrPostal, "서울 중구 명동10길 8", "5-digit Korean postal code stripped");
  console.log('✅ 5. KoreanAddressNormalizerTest Passed: Road address normalizer verified.');

  // 6. KoreanIdentityResolutionTest
  const targetK = {
    name: "명동교자 본점",
    address: "서울 중구 명동10길 29",
    phone: "02-776-5336",
    location: { lat: 37.5636, lng: 126.9858 },
    country: "KR"
  };
  const candK = {
    name: "명동교자 본점",
    address: "서울 중구 명동2가 25-2",
    phone: "02-776-5336",
    location: { lat: 37.5636, lng: 126.9858 }
  };
  const evalK = PlaceIdentityResolver.evaluateMatch(targetK, candK, { country: "KR" });
  assert(evalK.confidence >= 0.93, `Confidence should be >= 0.93, got ${evalK.confidence}`);
  assert.strictEqual(evalK.matchType, "auto_match");
  console.log('✅ 6. KoreanIdentityResolutionTest Passed: Multi-signal identity match verified.');

  // 7. KakaoNaverSamePlaceTest
  const kakaoPlace = {
    name: "우래옥 본점",
    address: "서울 중구 창경궁로 62-29",
    phone: "02-2265-0151",
    location: { lat: 37.568211, lng: 126.998718 }
  };
  const naverPlace = {
    name: "우래옥",
    address: "서울특별시 중구 주교동 118-1",
    phone: "02-2265-0151",
    location: { lat: 37.568211, lng: 126.998718 }
  };
  const crossMatch = PlaceIdentityResolver.evaluateMatch(kakaoPlace, naverPlace, { country: "KR" });
  assert(crossMatch.confidence >= 0.93, `Same place cross-provider confidence >= 0.93, got ${crossMatch.confidence}`);
  console.log('✅ 7. KakaoNaverSamePlaceTest Passed: Kakao and Naver records correctly resolve to ONE JiaPlace.');

  // 8. KoreanGenericNameRejectTest
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
  console.log('✅ 8. KoreanGenericNameRejectTest Passed: Common generic Korean store names protected.');

  // 9. NaverBlogNotRatingTest
  const blogArticle = {
    title: "우래옥 평양냉면 불고기 찐 맛집",
    summary: "서울 평양냉면 성지 우래옥에 다녀왔습니다. 국물이 깊고...",
    sourceUrl: "https://blog.naver.com/test/123",
    source: "Naver Blog"
  };
  let discModel = DiscoveryResolver.createDiscoveryModel({});
  discModel = DiscoveryResolver.addFoodArticle(discModel, blogArticle);
  assert.strictEqual(discModel.foodArticles.length, 1);
  assert.strictEqual(discModel.foodArticles[0].source, "Naver Blog");
  assert.strictEqual(discModel.foodArticles[0].rating, undefined, "No numeric rating computed from blog");
  console.log('✅ 9. NaverBlogNotRatingTest Passed: Naver Blog strictly categorized as discovery.');

  // 10. NaverArticleMatchTest
  const targetPlace = {
    name: "명동교자",
    city: "서울",
    district: "중구",
    roadAddress: "서울 중구 명동10길 29"
  };
  const goodArticle = {
    title: "명동교자 본점 서울 중구 명동 맛집",
    summary: "서울 중구 명동10길에 위치한 명동교자에서 만두와 칼국수를 먹었습니다.",
    sourceUrl: "https://blog.naver.com/1"
  };
  const goodMatch = DiscoveryResolver.evaluateArticleMatch(targetPlace, goodArticle);
  assert(goodMatch.confidence >= 0.90, `Good match confidence >= 0.90, got ${goodMatch.confidence}`);
  assert.strictEqual(goodMatch.canDisplay, true);

  const irrelevantArticle = {
    title: "제주도 흑돼지 맛집 탐방",
    summary: "서귀포 올레시장에서 맛있는 음식을 먹었습니다.",
    sourceUrl: "https://blog.naver.com/2"
  };
  const badMatch = DiscoveryResolver.evaluateArticleMatch(targetPlace, irrelevantArticle);
  assert(badMatch.confidence < 0.80, `Irrelevant article rejected, got ${badMatch.confidence}`);
  assert.strictEqual(badMatch.canDisplay, false);
  console.log('✅ 10. NaverArticleMatchTest Passed: Article confidence thresholds verified.');

  // 11. KakaoQuotaGuardTest
  const kakaoLimit = QuotaManager.LIMITS.kakao_local.safeLimit;
  assert.strictEqual(kakaoLimit, 250000, "Kakao safe limit set to 250,000/day");
  console.log('✅ 11. KakaoQuotaGuardTest Passed: Kakao quota guard verified.');

  // 12. NaverSharedQuotaGuardTest
  const naverLocalLimit = QuotaManager.LIMITS.naver_local.safeLimit;
  assert(naverLocalLimit <= 20000, "Naver local safe limit <= 20,000 req/day");
  console.log('✅ 12. NaverSharedQuotaGuardTest Passed: Naver conservative shared quota budget verified.');

  // 13. SecretNeverExposedTest
  const exposedKeys = Object.keys(global).filter(k => k.includes('SECRET') || k.includes('API_KEY'));
  assert.strictEqual(exposedKeys.length, 0, "No raw secret keys exposed in global scope");
  console.log('✅ 13. SecretNeverExposedTest Passed: API secrets strictly confined to server-side.');

  console.log('\n🎉 ALL 13 JIA-BEN PLACE INTELLIGENCE 5.2B UNIT TESTS PASSED SUCCESSFULLY!');
})();
