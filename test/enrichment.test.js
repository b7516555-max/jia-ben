const assert = require('assert');
global.window = global;
global.imageSafety = require('../src/utils/imageSafety.js');
global.JiaQuotaManager = require('../src/services/quotaManager.js');
global.JiaPlaceMatch = require('../src/utils/placeMatch.js');
const enrichment = require('../src/services/enrichment.js');

(async () => {
  // 1. Missing field detection
  assert.deepStrictEqual(enrichment.detectMissingFields({ photos: ['https://example.com/a.jpg'], address: 'A', phone: '1', website: 'https://x', openingHours: 'Mo-Fr', priceLevel: 2 }), [], 'detectMissingFields complete');

  // 2. Legacy Google Image blocking
  assert(global.imageSafety.isBlockedLegacyGoogleImage('https://maps.googleapis.com/maps/api/place/photo?photo_reference=x'), 'blocked Google image');
  assert(!global.imageSafety.isBlockedLegacyGoogleImage('https://lh3.googleusercontent.com/d/user-upload'), 'user Drive image remains allowed');

  // 3. Quota stop logic
  const memory = new Map();
  global.JiaQuotaManager.configure({ get: async id => memory.get(id) || { used: 0 }, set: async (id, v) => memory.set(id, v) });
  assert(await global.JiaQuotaManager.canConsume('foursquare'), 'quota canConsume');
  memory.set(global.JiaQuotaManager.documentId('foursquare'), { used: 450 });
  assert.strictEqual(await global.JiaQuotaManager.canConsume('foursquare'), false, 'quota hard stop');
  memory.clear();

  // 4. HERE skip
  global.JIA_ENRICHMENT_PROXY_URL = '';
  const here = require('../src/providers/hereAdapter.js');
  assert.strictEqual((await here.search({ name: 'x' })).status, 'disabled_no_proxy', 'disabled_no_key/proxy safe skip');

  // 5. Cooldown & merge only missing
  const base = { jiaPlaceId: 'jia_1', name: 'Test', location: { lat: 22, lng: 120 }, photos: ['https://example.com/a.jpg'], phone: '1', website: 'https://x', openingHours: 'x', priceLevel: 1 };
  assert(enrichment.isCoolingDown({ ...base, enrichment: { lastCheckedAt: new Date().toISOString() } }), 'cooldown');
  const merged = enrichment.mergeOnlyMissing({ ...base, address: 'Keep' }, { provider: 'overpass', address: 'Replace', phone: '2' }, ['address', 'phone']);
  assert.strictEqual(merged.address, 'Keep');
  assert.strictEqual(merged.phone, '1', 'merge only missing fields');

  // 6. Name Normalization & Suffix Tests
  // Case: 8818 比薩屋 vs 8818比薩屋南門總店
  const res8818 = global.JiaPlaceMatch.scoreMatch(
    { name: '8818 比薩屋', location: { lat: 22.9823, lng: 120.2036 } },
    { name: '8818比薩屋南門總店', location: { lat: 22.9822, lng: 120.2035 } }
  );
  assert(res8818.confidence >= 0.90, `8818 case confidence should be >= 0.90, got ${res8818.confidence}`);
  assert.strictEqual(res8818.isBrandCoreExact, true, '8818 brandCore should match');
  assert.strictEqual(res8818.canAutoWrite, true, '8818 within 20m should allow auto write');

  // 7. False-Positive Safety Regression Tests
  // Case A: 清流房日式拉麵 vs 山本堂日式拉麵 -> REJECT
  const resRamen = global.JiaPlaceMatch.scoreMatch(
    { name: '清流房日式拉麵', location: { lat: 22.6521, lng: 120.2844 } },
    { name: '山本堂日式拉麵', location: { lat: 22.6521, lng: 120.2844 } }
  );
  assert.strictEqual(resRamen.acceptable, false, `Ramen false match must be rejected (got ${resRamen.confidence})`);
  assert.strictEqual(resRamen.canAutoWrite, false);

  // Case B: 大埔牛肉麵 vs 大埔蕃茄盤 -> REJECT
  const resBeef = global.JiaPlaceMatch.scoreMatch(
    { name: '大埔牛肉麵', location: { lat: 22.6723, lng: 120.4800 } },
    { name: '大埔蕃茄盤', location: { lat: 22.6723, lng: 120.4800 } }
  );
  assert.strictEqual(resBeef.acceptable, false, `Beef false match must be rejected (got ${resBeef.confidence})`);

  // Case C: 芳-眷村麵店 vs 孫記老眷村麵館 -> REJECT
  const resVillage = global.JiaPlaceMatch.scoreMatch(
    { name: '芳-眷村麵店（原六塊厝-眷村麵店）', location: { lat: 22.6630, lng: 120.4821 } },
    { name: '孫記老眷村麵館', location: { lat: 22.6630, lng: 120.4821 } }
  );
  assert.strictEqual(resVillage.acceptable, false, `Village false match must be rejected (got ${resVillage.confidence})`);

  console.log(JSON.stringify({ tests: 10, status: 'passed' }));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
