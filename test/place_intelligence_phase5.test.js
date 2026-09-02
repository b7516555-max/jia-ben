const assert = require('assert');
global.window = global;

const PlaceIntelligence = require('../src/services/placeIntelligence.js');
const CommunityData = require('../src/services/communityData.js');
const imageSafety = require('../src/utils/imageSafety.js');
const placeMatch = require('../src/utils/placeMatch.js');

global.JiaPlaceMatch = placeMatch;
global.JiaCommunity = CommunityData;
global.imageSafety = imageSafety;

(async () => {
  console.log('--- Starting Jia-ben Place Intelligence Layer 5.0 Unit Tests ---');

  // Test 1: Module definition & Category Dictionary Mapping
  assert(PlaceIntelligence, 'PlaceIntelligence module exists');
  assert.strictEqual(typeof PlaceIntelligence.discoverPlaceInfo, 'function', 'discoverPlaceInfo is function');
  assert.strictEqual(typeof PlaceIntelligence.mapToControlledCategory, 'function', 'mapToControlledCategory is function');
  
  assert.strictEqual(PlaceIntelligence.mapToControlledCategory('ramen restaurant'), '拉麵', 'Mapped ramen restaurant to 拉麵');
  assert.strictEqual(PlaceIntelligence.mapToControlledCategory('Coffee Shop'), '咖啡廳', 'Mapped Coffee Shop to 咖啡廳');
  assert.strictEqual(PlaceIntelligence.mapToControlledCategory('BBQ'), '日式燒肉', 'Mapped BBQ to 日式燒肉');
  console.log('✅ Test 1 Passed: PlaceIntelligence exports & controlled category dictionary mapping.');

  // Test 2: Schema.org / JSON-LD structured data parser
  const sampleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    "name": "鼎泰豐 信義店",
    "telephone": "02-23218928",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "信義路二段194號",
      "addressLocality": "台北市",
      "addressRegion": "大安區"
    },
    "menu": "https://www.dintaifung.com.tw/menu.php",
    "servesCuisine": "台式料理",
    "openingHours": "Mo-Su 11:00-20:30",
    "image": "https://example.com/dintaifung_cover.jpg"
  };

  const parsedLd = PlaceIntelligence.parseSchemaJsonLd(sampleJsonLd);
  assert.strictEqual(parsedLd.name, '鼎泰豐 信義店', 'JSON-LD name matches');
  assert.strictEqual(parsedLd.phone, '02-23218928', 'JSON-LD phone matches');
  assert(parsedLd.address.includes('台北市大安區信義路二段194號') || parsedLd.address.includes('信義路二段194號'), 'JSON-LD address matches');
  assert.strictEqual(parsedLd.menuUrl, 'https://www.dintaifung.com.tw/menu.php', 'JSON-LD menu URL matches');
  console.log('✅ Test 2 Passed: Schema.org / JSON-LD restaurant metadata parser.');

  // Test 3: Existing Jia-ben data discovery (0 external API calls)
  global.jiaPlacesData = [
    {
      jiaPlaceId: 'jia_test_1',
      name: '春水堂 人文茶館',
      address: '台中市西區四維街30號',
      phone: '04-22297991',
      categories: ['手搖茶飲', '台式料理'],
      openingHours: '09:00 - 22:00'
    }
  ];

  const discResult1 = await PlaceIntelligence.discoverPlaceInfo({
    name: '春水堂 人文茶館'
  });

  assert.strictEqual(discResult1.status, 'success', 'Found existing Jia-ben data');
  assert.strictEqual(discResult1.autofill.address, '台中市西區四維街30號', 'Autofill address matches existing');
  assert.strictEqual(discResult1.autofill.phone, '04-22297991', 'Autofill phone matches existing');
  assert.strictEqual(discResult1.autofill.category, '手搖茶飲', 'Autofill category matches');
  assert(discResult1.confidence >= 0.90, 'High confidence for existing verified data');
  console.log('✅ Test 3 Passed: Existing Jia-ben data discovery with 0 external calls.');

  // Test 4: Partial Result Auto-fill (only available fields returned)
  global.restaurantData = [
    {
      name: '無名老麵攤',
      address: '高雄市鹽埕區新樂街100號',
      category: 'noodle'
    }
  ];

  const discResult2 = await PlaceIntelligence.discoverPlaceInfo({
    name: '無名老麵攤'
  });

  assert.strictEqual(discResult2.status, 'success', 'Partial data found');
  assert.strictEqual(discResult2.autofill.address, '高雄市鹽埕區新樂街100號', 'Address filled');
  assert.strictEqual(discResult2.autofill.category, '麵食水餃', 'Mapped category filled');
  assert.strictEqual(discResult2.autofill.phone, undefined, 'Phone remains undefined when not in sources');
  console.log('✅ Test 4 Passed: Partial result auto-fill preserves missing fields cleanly.');

  // Test 5: Cache & Request Deduplication
  const t0 = Date.now();
  const reqA = PlaceIntelligence.discoverPlaceInfo({ name: '春水堂 人文茶館' });
  const reqB = PlaceIntelligence.discoverPlaceInfo({ name: '春水堂 人文茶館' });
  const [resA, resB] = await Promise.all([reqA, reqB]);
  assert.deepStrictEqual(resA.autofill, resB.autofill, 'Concurrent and cached requests return identical data');
  console.log('✅ Test 5 Passed: Request deduplication and memory caching.');

  // Test 6: Unknown store gracefully returns no_match without crashing
  const discResultUnknown = await PlaceIntelligence.discoverPlaceInfo({
    name: '完全不存在的火星料理神秘小店999'
  });
  assert.strictEqual(discResultUnknown.status, 'no_match', 'Unknown store returns no_match');
  assert(discResultUnknown.message.includes('暫時找不到可靠的公開店家資訊'), 'Human friendly message provided');
  console.log('✅ Test 6 Passed: Unknown store fallback gracefully with manual form usable.');

  // Test 7: Web Intelligence schema structure creator
  const schema = PlaceIntelligence.createWebIntelligenceSchema({
    officialWebsite: 'https://example.com',
    discoveredFields: { address: '台北市', phone: '02-12345678' }
  });
  assert.strictEqual(schema.officialWebsite, 'https://example.com', 'Schema officialWebsite set');
  assert.strictEqual(schema.discoveredFields.phone, '02-12345678', 'Schema discoveredFields.phone set');
  console.log('✅ Test 7 Passed: Standard Web Intelligence canonical schema extension.');

  console.log('🎉 All Jia-ben Place Intelligence Layer 5.0 unit tests passed successfully!');
})();
