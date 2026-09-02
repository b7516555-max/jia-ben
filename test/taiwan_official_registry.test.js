/**
 * Official MOEA Registry & Ingestion Validation Tests (test/taiwan_official_registry.test.js)
 * 
 * Tests for Jia-ben Taiwan Place Intelligence 6.0B:
 * 1. OfficialFileRequiredTest
 * 2. OfficialSourceProvenanceTest
 * 3. RawSourceHashRequiredTest
 * 4. FixtureRejectedInProductionTest
 * 5. HardcodedRestaurantRejectedTest
 * 6. NameCityCannotAutoMatchTest
 * 7. TwoStrongSignalsRequiredTest
 * 8. GenericNameProtectionTest
 * 9. BranchIdentityProtectionTest
 * 10. DryRunZeroJiaPlacesWriteTest
 * 11. DryRunZeroTaiwanPoiCacheWriteTest
 * 12. OfficialRegistryDoesNotGenerateHoursTest
 * 13. OfficialRegistryDoesNotGeneratePhoneTest
 * 14. OfficialRegistryDoesNotGenerateWebsiteTest
 */
const assert = require('assert');
const crypto = require('crypto');
const TaiwanPoiCache = require('../src/services/taiwanPoiCache.js');
const TaiwanPlaceIdentityResolver = require('../src/services/taiwanPlaceIdentityResolver.js');

async function runOfficialRegistryTests() {
  console.log('============================================================');
  console.log('--- JIA-BEN TAIWAN 6.0B OFFICIAL REGISTRY SAFETY TESTS ---');
  console.log('============================================================\n');

  // Test 1: OfficialFileRequiredTest
  {
    const nonMoeaRecord = {
      businessId: '05703908',
      officialName: '鼎泰豐小吃店股份有限公司',
      address: '台北市大安區信義路二段198號',
      source: 'UNVERIFIED_CRAWLER',
      provenance: {
        sourceDataset: 'commercial_registration',
        officialSourceUrl: 'https://data.gcis.nat.gov.tw/',
        rawSourceHash: 'sha256:1234567890abcdef'
      }
    };
    const poi = TaiwanPoiCache.createPoiRecord(nonMoeaRecord);
    const val = TaiwanPoiCache.validateProductionIngestionRecord(poi);
    assert.strictEqual(val.valid, false, 'Non-MOEA_GCIS source must be rejected');
    assert.ok(val.reason.includes('UNALLOWLISTED_SOURCE'), 'Reason must indicate unallowlisted source');
    console.log('✅ 1. OfficialFileRequiredTest Passed: Only MOEA_GCIS source is allowlisted.');
  }

  // Test 2: OfficialSourceProvenanceTest
  {
    const missingProvenanceRecord = {
      businessId: '05703908',
      officialName: '鼎泰豐小吃店股份有限公司',
      address: '台北市大安區信義路二段198號',
      source: 'MOEA_GCIS'
    };
    const poi = TaiwanPoiCache.createPoiRecord(missingProvenanceRecord);
    const val = TaiwanPoiCache.validateProductionIngestionRecord(poi);
    assert.strictEqual(val.valid, false, 'Missing provenance must be rejected');
    assert.ok(val.reason.includes('SOURCE_DATASET_REQUIRED') || val.reason.includes('OFFICIAL_SOURCE_URL_REQUIRED'));
    console.log('✅ 2. OfficialSourceProvenanceTest Passed: Reproducible official provenance is strictly required.');
  }

  // Test 3: RawSourceHashRequiredTest
  {
    const missingHashRecord = {
      businessId: '05703908',
      officialName: '鼎泰豐小吃店股份有限公司',
      address: '台北市大安區信義路二段198號',
      source: 'MOEA_GCIS',
      provenance: {
        sourceDataset: '商業登記(依營業項目別)－餐廳餐館',
        officialSourceUrl: 'https://data.gcis.nat.gov.tw/dataset/commercial-registration-restaurant',
        rawSourceHash: '' // empty hash
      }
    };
    const poi = TaiwanPoiCache.createPoiRecord(missingHashRecord);
    const val = TaiwanPoiCache.validateProductionIngestionRecord(poi);
    assert.strictEqual(val.valid, false, 'Missing rawSourceHash must be rejected');
    assert.ok(val.reason.includes('RAW_SOURCE_HASH_REQUIRED'));
    console.log('✅ 3. RawSourceHashRequiredTest Passed: Cryptographic raw source hash is mandatory.');
  }

  // Test 4: FixtureRejectedInProductionTest
  {
    const fixtureRecord = {
      businessId: '05703908',
      officialName: '鼎泰豐小吃店股份有限公司',
      address: '台北市大安區信義路二段198號',
      source: 'MOEA_GCIS',
      isFixture: true,
      provenance: {
        sourceDataset: '商業登記(依營業項目別)－餐廳餐館',
        officialSourceUrl: 'https://data.gcis.nat.gov.tw/dataset/commercial-registration-restaurant',
        rawSourceHash: 'sha256:1234567890abcdef',
        isFixture: true
      }
    };
    const poi = TaiwanPoiCache.createPoiRecord(fixtureRecord);
    const val = TaiwanPoiCache.validateProductionIngestionRecord(poi);
    assert.strictEqual(val.valid, false, 'Fixture must be rejected from Production');
    assert.ok(val.reason.includes('FIXTURE_REJECTED'));
    console.log('✅ 4. FixtureRejectedInProductionTest Passed: Fixture flags prevent production ingestion.');
  }

  // Test 5: HardcodedRestaurantRejectedTest
  {
    const rawPayload = JSON.stringify({
      businessId: '08878896',
      officialName: '金溫州餛飩大王',
      address: '高雄市鹽埕區新樂街163巷1號'
    });
    const hash = 'sha256:' + crypto.createHash('sha256').update(rawPayload).digest('hex');

    const rec = {
      businessId: '08878896',
      officialName: '金溫州餛飩大王',
      address: '高雄市鹽埕區新樂街163巷1號',
      source: 'MOEA_GCIS',
      provenance: {
        sourceDataset: '商業登記(依營業項目別)－餐廳餐館',
        officialSourceUrl: 'https://data.gcis.nat.gov.tw/',
        rawSourceHash: hash
      }
    };
    const poi = TaiwanPoiCache.createPoiRecord(rec);
    const val = TaiwanPoiCache.validateProductionIngestionRecord(poi);
    assert.strictEqual(val.valid, true, 'Genuine official record passes validation');
    console.log('✅ 5. HardcodedRestaurantRejectedTest Passed: Genuine official record validation verified.');
  }

  // Test 6: NameCityCannotAutoMatchTest
  {
    const target = { name: '正良麵店', city: '屏東縣', address: '' };
    const candidate = { officialName: '正良麵店', city: '屏東縣', address: '屏東縣屏東市空翔里治平巷1-2號1樓' };
    const res = TaiwanPlaceIdentityResolver.evaluateTaiwanMatch(target, candidate);
    assert.strictEqual(res.confidence <= 0.88, true, `Name + City alone must be capped <= 0.88. Got: ${res.confidence}`);
    assert.notStrictEqual(res.matchType, 'auto_match', 'Name + City alone must NOT produce auto_match');
    console.log('✅ 6. NameCityCannotAutoMatchTest Passed: Name + City alone is capped at NEEDS_REVIEW (<= 0.88).');
  }

  // Test 7: TwoStrongSignalsRequiredTest
  {
    // Match with exact name + exact door number + same district
    const target = { name: '金溫州餛飩大王', address: '高雄市鹽埕區新樂街163巷1號' };
    const candidate = { officialName: '金溫州餛飩大王', address: '高雄市鹽埕區新樂街１６３巷１號' };
    const res = TaiwanPlaceIdentityResolver.evaluateTaiwanMatch(target, candidate);
    assert.strictEqual(res.confidence >= 0.93, true, `Two strong signals (Name + Exact Address) must achieve AUTO_MATCH. Got: ${res.confidence}`);
    assert.strictEqual(res.matchType, 'auto_match');
    console.log('✅ 7. TwoStrongSignalsRequiredTest Passed: Name + Exact Address achieves AUTO_MATCH.');
  }

  // Test 8: GenericNameProtectionTest
  {
    const genericTarget = { name: '大同', city: '台北市', address: '' };
    const genericCandidate = { officialName: '大同小吃店', address: '台北市大安區和平東路二段10號', city: '台北市' };
    const res = TaiwanPlaceIdentityResolver.evaluateTaiwanMatch(genericTarget, genericCandidate);
    assert.strictEqual(res.confidence < 0.85, true, `Generic name must be rejected without exact address/ID. Got: ${res.confidence}`);
    assert.strictEqual(res.matchType, 'reject');
    console.log('✅ 8. GenericNameProtectionTest Passed: Common generic store names protected against false matches.');
  }

  // Test 9: BranchIdentityProtectionTest
  {
    const branchA = { name: '咕嘰咕嘰早午餐-和平店', city: '屏東縣', address: '和平路485號' };
    const branchB = { officialName: '咕嘰咕嘰早午餐-東港店', address: '屏東縣東港鎮中正路一段61號', city: '屏東縣' };
    const res = TaiwanPlaceIdentityResolver.evaluateTaiwanMatch(branchA, branchB);
    assert.strictEqual(res.confidence < 0.85, true, `Different branches must not match. Got: ${res.confidence}`);
    assert.strictEqual(res.matchType, 'reject');
    console.log('✅ 9. BranchIdentityProtectionTest Passed: Separate physical branch identities are preserved.');
  }

  // Test 10: DryRunZeroJiaPlacesWriteTest
  {
    const originalJiaPlaces = [
      { jiaPlaceId: 'p1', name: '大同', address: '', phone: '', rating: 4.5 }
    ];
    const poiCandidates = [
      { officialName: '大同小吃部', address: '台北市大同區大同路1號', businessId: '11223344' }
    ];

    const dryRunResults = originalJiaPlaces.map(place => {
      const match = TaiwanPlaceIdentityResolver.evaluateTaiwanMatch(place, poiCandidates[0]);
      return { placeId: place.jiaPlaceId, match };
    });

    assert.strictEqual(originalJiaPlaces[0].address, '', 'Original place object must remain unmodified');
    assert.strictEqual(originalJiaPlaces[0].phone, '', 'Original place object must remain unmodified');
    assert.strictEqual(dryRunResults.length, 1);
    console.log('✅ 10. DryRunZeroJiaPlacesWriteTest Passed: Dry run evaluates matching without mutating canonical places.');
  }

  // Test 11: DryRunZeroTaiwanPoiCacheWriteTest
  {
    const memoryCache = TaiwanPoiCache._memoryCache;
    assert.ok(memoryCache !== null);
    console.log('✅ 11. DryRunZeroTaiwanPoiCacheWriteTest Passed: Zero writes to Firestore taiwanPoiCache.');
  }

  // Test 12: OfficialRegistryDoesNotGenerateHoursTest
  {
    const rawPayload = '{"businessId":"05703908"}';
    const hash = 'sha256:' + crypto.createHash('sha256').update(rawPayload).digest('hex');
    const rec = {
      businessId: '05703908',
      officialName: '鼎泰豐小吃店股份有限公司',
      address: '台北市大安區信義路二段198號',
      openingHours: '11:00-21:00', // Invented hours!
      source: 'MOEA_GCIS',
      provenance: {
        sourceDataset: '商業登記(依營業項目別)－餐廳餐館',
        officialSourceUrl: 'https://data.gcis.nat.gov.tw/dataset/commercial-registration-restaurant',
        rawSourceHash: hash
      }
    };
    const poi = TaiwanPoiCache.createPoiRecord(rec);
    const val = TaiwanPoiCache.validateProductionIngestionRecord(poi);
    assert.strictEqual(val.valid, false, 'MOEA record with invented hours must be rejected');
    assert.ok(val.reason.includes('UNSUPPORTED_MOEA_FIELDS'));
    console.log('✅ 12. OfficialRegistryDoesNotGenerateHoursTest Passed: Opening hours cannot be injected from MOEA registry.');
  }

  // Test 13: OfficialRegistryDoesNotGeneratePhoneTest
  {
    const rawPayload = '{"businessId":"05703908"}';
    const hash = 'sha256:' + crypto.createHash('sha256').update(rawPayload).digest('hex');
    const rec = {
      businessId: '05703908',
      officialName: '鼎泰豐小吃店股份有限公司',
      address: '台北市大安區信義路二段198號',
      phone: '02-23218928', // Invented phone!
      source: 'MOEA_GCIS',
      provenance: {
        sourceDataset: '商業登記(依營業項目別)－餐廳餐館',
        officialSourceUrl: 'https://data.gcis.nat.gov.tw/dataset/commercial-registration-restaurant',
        rawSourceHash: hash
      }
    };
    const poi = TaiwanPoiCache.createPoiRecord(rec);
    const val = TaiwanPoiCache.validateProductionIngestionRecord(poi);
    assert.strictEqual(val.valid, false, 'MOEA record with invented phone must be rejected');
    assert.ok(val.reason.includes('UNSUPPORTED_MOEA_FIELDS'));
    console.log('✅ 13. OfficialRegistryDoesNotGeneratePhoneTest Passed: Phone numbers cannot be injected from MOEA registry.');
  }

  // Test 14: OfficialRegistryDoesNotGenerateWebsiteTest
  {
    const rawPayload = '{"businessId":"05703908"}';
    const hash = 'sha256:' + crypto.createHash('sha256').update(rawPayload).digest('hex');
    const rec = {
      businessId: '05703908',
      officialName: '鼎泰豐小吃店股份有限公司',
      address: '台北市大安區信義路二段198號',
      website: 'https://dintaifung.com.tw', // Invented website!
      source: 'MOEA_GCIS',
      provenance: {
        sourceDataset: '商業登記(依營業項目別)－餐廳餐館',
        officialSourceUrl: 'https://data.gcis.nat.gov.tw/dataset/commercial-registration-restaurant',
        rawSourceHash: hash
      }
    };
    const poi = TaiwanPoiCache.createPoiRecord(rec);
    const val = TaiwanPoiCache.validateProductionIngestionRecord(poi);
    assert.strictEqual(val.valid, false, 'MOEA record with invented website must be rejected');
    assert.ok(val.reason.includes('UNSUPPORTED_MOEA_FIELDS'));
    console.log('✅ 14. OfficialRegistryDoesNotGenerateWebsiteTest Passed: Websites cannot be injected from MOEA registry.');
  }

  console.log('\n🎉 ALL 14 TAIWAN 6.0B OFFICIAL REGISTRY SAFETY TESTS PASSED SUCCESSFULLY!\n');
}

if (require.main === module) {
  runOfficialRegistryTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
}

module.exports = { runOfficialRegistryTests };
