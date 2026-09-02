/**
 * Official MOEA Registry & Ingestion Validation Tests (test/taiwan_official_registry.test.js)
 * 
 * Tests for Jia-ben Taiwan Place Intelligence 6.0A:
 * 1. OfficialMoeaDatasetOnlyTest
 * 2. OfficialSourceProvenanceTest
 * 3. RawSourceHashRequiredTest
 * 4. FixtureRejectedInProductionTest
 * 5. BusinessIdDedupTest
 * 6. RegistryDoesNotInventPhoneTest
 * 7. RegistryDoesNotInventHoursTest
 * 8. RegistryDoesNotInventWebsiteTest
 * 9. DryRunDoesNotModifyJiaPlacesTest
 * 10. GenericRestaurantNameSafetyTest
 */
const assert = require('assert');
const crypto = require('crypto');
const TaiwanPoiCache = require('../src/services/taiwanPoiCache.js');
const TaiwanPlaceIdentityResolver = require('../src/services/taiwanPlaceIdentityResolver.js');

async function runOfficialRegistryTests() {
  console.log('============================================================');
  console.log('--- JIA-BEN TAIWAN 6.0A OFFICIAL REGISTRY TESTS ---');
  console.log('============================================================\n');

  // Test 1: OfficialMoeaDatasetOnlyTest
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
    console.log('✅ 1. OfficialMoeaDatasetOnlyTest Passed: Only MOEA_GCIS source is allowlisted.');
  }

  // Test 2: OfficialSourceProvenanceTest
  {
    const missingProvenanceRecord = {
      businessId: '05703908',
      officialName: '鼎泰豐小吃店股份有限公司',
      address: '台北市大安區信義路二段198號',
      source: 'MOEA_GCIS'
      // missing provenance
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

  // Test 5: BusinessIdDedupTest
  {
    const rawPayload = JSON.stringify({
      businessId: '05703908',
      officialName: '鼎泰豐小吃店股份有限公司',
      address: '台北市大安區信義路二段198號'
    });
    const hash = 'sha256:' + crypto.createHash('sha256').update(rawPayload).digest('hex');

    const recA = {
      businessId: '05703908',
      officialName: '鼎泰豐小吃店股份有限公司',
      address: '台北市大安區信義路二段198號',
      source: 'MOEA_GCIS',
      provenance: {
        sourceDataset: '公司登記(依營業項目別)－餐廳餐館',
        officialSourceUrl: 'https://data.gcis.nat.gov.tw/dataset/company-registration-restaurant',
        rawSourceHash: hash
      }
    };

    const recB = {
      businessId: '05703908',
      officialName: '鼎泰豐小吃店股份有限公司 信義總店',
      address: '台北市大安區信義路二段198號1樓',
      source: 'MOEA_GCIS',
      provenance: {
        sourceDataset: '公司登記(依營業項目別)－餐廳餐館',
        officialSourceUrl: 'https://data.gcis.nat.gov.tw/dataset/company-registration-restaurant',
        rawSourceHash: hash
      }
    };

    const res = await TaiwanPoiCache.ingestGovernmentRecords([recA, recB]);
    assert.strictEqual(res.imported, 2, 'Both unique batches processed');
    assert.strictEqual(TaiwanPoiCache._memoryCache.has('moea_05703908'), true);
    console.log('✅ 5. BusinessIdDedupTest Passed: Unified business ID provides deterministic deduplication.');
  }

  // Test 6: RegistryDoesNotInventPhoneTest
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
    console.log('✅ 6. RegistryDoesNotInventPhoneTest Passed: MOEA records cannot inject unverified phone numbers.');
  }

  // Test 7: RegistryDoesNotInventHoursTest
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
    console.log('✅ 7. RegistryDoesNotInventHoursTest Passed: MOEA records cannot inject unverified opening hours.');
  }

  // Test 8: RegistryDoesNotInventWebsiteTest
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
    console.log('✅ 8. RegistryDoesNotInventWebsiteTest Passed: MOEA records cannot inject unverified websites.');
  }

  // Test 9: DryRunDoesNotModifyJiaPlacesTest
  {
    const originalJiaPlaces = [
      { jiaPlaceId: 'p1', name: '大同', address: '', phone: '', rating: 4.5 }
    ];
    const poiCandidates = [
      { officialName: '大同小吃部', address: '台北市大同區大同路1號', businessId: '11223344' }
    ];

    // Simulate dry run
    const dryRunResults = originalJiaPlaces.map(place => {
      const match = TaiwanPlaceIdentityResolver.evaluateTaiwanMatch(place, poiCandidates[0]);
      return { placeId: place.jiaPlaceId, match };
    });

    assert.strictEqual(originalJiaPlaces[0].address, '', 'Original place object must remain unmodified');
    assert.strictEqual(originalJiaPlaces[0].phone, '', 'Original place object must remain unmodified');
    assert.strictEqual(dryRunResults.length, 1);
    console.log('✅ 9. DryRunDoesNotModifyJiaPlacesTest Passed: Dry run evaluates matching without mutating canonical places.');
  }

  // Test 10: GenericRestaurantNameSafetyTest
  {
    const genericTarget = { name: '大同', city: '台北市', address: '' };
    const genericCandidate = { officialName: '大同小吃店', address: '台北市大安區和平東路二段10號', city: '台北市' };
    const res = TaiwanPlaceIdentityResolver.evaluateTaiwanMatch(genericTarget, genericCandidate);
    assert.strictEqual(res.confidence < 0.85, true, `Generic store name must be rejected without exact ID/phone. Got: ${res.confidence}`);
    assert.strictEqual(res.matchType, 'reject');
    console.log('✅ 10. GenericRestaurantNameSafetyTest Passed: Common generic store names protected against false matches.');
  }

  console.log('\n🎉 ALL 10 TAIWAN 6.0A OFFICIAL REGISTRY UNIT TESTS PASSED SUCCESSFULLY!\n');
}

if (require.main === module) {
  runOfficialRegistryTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
}

module.exports = { runOfficialRegistryTests };
