const assert = require('assert');
global.window = global;
global.imageSafety = require('../src/utils/imageSafety.js');
global.JiaQuotaManager = require('../src/services/quotaManager.js');
global.JiaPlaceMatch = require('../src/utils/placeMatch.js');
const enrichment = require('../src/services/enrichment.js');
const foursquareAdapter = require('../src/providers/foursquareAdapter.js');

(async () => {
  // 1. Missing field detection
  assert.deepStrictEqual(enrichment.detectMissingFields({ photos: ['https://example.com/a.jpg'], address: 'A', phone: '1', website: 'https://x', openingHours: 'Mo-Fr', priceLevel: 2 }), [], 'detectMissingFields complete');

  // 2. Legacy Google Image blocking
  assert(global.imageSafety.isBlockedLegacyGoogleImage('https://maps.googleapis.com/maps/api/place/photo?photo_reference=x'), 'blocked Google image');
  assert(!global.imageSafety.isBlockedLegacyGoogleImage('https://lh3.googleusercontent.com/d/user-upload'), 'user Drive image remains allowed');

  // 3. Quota stop logic & warning simulation
  const memory = new Map();
  global.JiaQuotaManager.configure({ get: async id => memory.get(id) || { used: 0 }, set: async (id, v) => memory.set(id, v) });
  
  // 359 -> normal
  memory.set(global.JiaQuotaManager.documentId('foursquare'), { used: 359 });
  let st = await global.JiaQuotaManager.status('foursquare');
  assert.strictEqual(st.state, 'ok');
  assert.strictEqual(st.allowed, true);

  // 360 -> warning
  memory.set(global.JiaQuotaManager.documentId('foursquare'), { used: 360 });
  st = await global.JiaQuotaManager.status('foursquare');
  assert.strictEqual(st.state, 'warning');
  assert.strictEqual(st.allowed, true);

  // 405 -> strong warning
  memory.set(global.JiaQuotaManager.documentId('foursquare'), { used: 405 });
  st = await global.JiaQuotaManager.status('foursquare');
  assert.strictEqual(st.state, 'high');
  assert.strictEqual(st.allowed, true);

  // 449 -> allow one final
  memory.set(global.JiaQuotaManager.documentId('foursquare'), { used: 449 });
  st = await global.JiaQuotaManager.status('foursquare');
  assert.strictEqual(st.allowed, true);

  // 450 -> hard stop
  memory.set(global.JiaQuotaManager.documentId('foursquare'), { used: 450 });
  st = await global.JiaQuotaManager.status('foursquare');
  assert.strictEqual(st.state, 'stop');
  assert.strictEqual(st.allowed, false);
  assert.strictEqual(await global.JiaQuotaManager.canConsume('foursquare'), false);
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

  // Case D: 美菊麵店 vs 巨林美而美 -> REJECT
  const resMeiju = global.JiaPlaceMatch.scoreMatch(
    { name: '美菊麵店', location: { lat: 22.6802, lng: 120.4918 } },
    { name: '巨林美而美（中正店）', location: { lat: 22.6802, lng: 120.4918 } }
  );
  assert.strictEqual(resMeiju.acceptable, false, `Meiju false match must be rejected (got ${resMeiju.confidence})`);

  // 8. Foursquare Production Policy Verification
  assert.strictEqual(foursquareAdapter.FOURSQUARE_DETAILS_ENABLED, false, 'Details must be OFF by default');

  // Existing store with sourceIds.foursquare must not trigger search
  const resExistingFsq = await foursquareAdapter.search({
    name: '8818 比薩屋',
    sourceIds: { foursquare: '6a0247ec74edbe387950b051' }
  });
  assert.strictEqual(resExistingFsq.status, 'already_has_source_id');

  // Double click / concurrent search deduplication test
  let rawFetchCalls = 0;
  global.JIA_ENRICHMENT_PROXY_URL = 'https://example.com/proxy';
  global.fetch = async () => {
    rawFetchCalls++;
    await new Promise(r => setTimeout(r, 20));
    return {
      ok: true,
      json: async () => ({ status: 'success', name: 'Concurrent Test' })
    };
  };

  const p1 = foursquareAdapter.search({ name: '測試連點店家', location: { lat: 22.6, lng: 120.3 } });
  const p2 = foursquareAdapter.search({ name: '測試連點店家', location: { lat: 22.6, lng: 120.3 } });
  const p3 = foursquareAdapter.search({ name: '測試連點店家', location: { lat: 22.6, lng: 120.3 } });

  const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
  assert.strictEqual(rawFetchCalls, 1, 'Double-click/concurrent search must produce exactly 1 proxy fetch call');
  assert.strictEqual(r1.name, 'Concurrent Test');
  assert.strictEqual(r2.name, 'Concurrent Test');
  assert.strictEqual(r3.name, 'Concurrent Test');

  // Short term cache hit test
  const r4 = await foursquareAdapter.search({ name: '測試連點店家', location: { lat: 22.6, lng: 120.3 } });
  assert.strictEqual(rawFetchCalls, 1, 'Subsequent search within TTL must hit cache without network fetch');
  assert.strictEqual(r4.name, 'Concurrent Test');

  console.log(JSON.stringify({ tests: 14, status: 'passed' }));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
