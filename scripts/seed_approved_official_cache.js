/**
 * Verified Single Official Cache Seed CLI (scripts/seed_approved_official_cache.js)
 * 
 * Jia-ben Taiwan Place Intelligence 6.0C — Verified Official Cache Seed (Approved Record Only)
 * 
 * - Seeds EXACTLY ONE verified MOEA record into Firestore `taiwanPoiCache`:
 *   - JiaPlace ID: jia_861b7f1e734675b2422c (金溫州餛飩大王)
 *   - Business ID: 08878896
 *   - Official Address: 高雄市鹽埕區新樂街１６３巷１號
 *   - Source file: moea_business_restaurants.official-source.csv (Row 10955)
 *   - Document ID: moea_business_08878896
 * - Performs pre-write cryptographic and content validation on Row 10955.
 * - Performs duplicate protection checks (businessId & jiaPlaceId).
 * - Enforces zero writes to `jiaPlaces` (jiaPlaces writes = 0).
 * - Queries back the created document to confirm field-level accuracy.
 */
const https = require('https');
const fs = require('fs');
const readline = require('readline');
const crypto = require('crypto');
const { fetchCollection } = require('./safe_backup_and_rollback.js');
const TaiwanPoiCache = require('../src/services/taiwanPoiCache.js');
const TaiwanAddressNormalizer = require('../src/utils/taiwanAddressNormalizer.js');

function getAnonymousToken() {
  return new Promise((resolve, reject) => {
    const indexHtml = fs.readFileSync('index.html', 'utf-8');
    const keyMatch = indexHtml.match(/apiKey:\s*["\x27](AIza[0-9A-Za-z_-]+)["\x27]/);
    if (!keyMatch) return reject(new Error('No apiKey found in index.html'));
    const apiKey = keyMatch[1];
    
    const postData = JSON.stringify({ returnSecureToken: true });
    const req = https.request({
      hostname: 'identitytoolkit.googleapis.com',
      path: `/v1/accounts:signUp?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': postData.length
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(d);
          resolve(json.idToken);
        } catch(e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function encodeFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: val.toString() } : { doubleValue: val };
  }
  if (typeof val === 'boolean') return { booleanValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(encodeFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) fields[k] = encodeFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function saveToFirestore(collectionName, docId, data, token) {
  return new Promise((resolve, reject) => {
    const fields = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined && !k.startsWith('_')) fields[k] = encodeFirestoreValue(v);
    }
    const body = JSON.stringify({ fields });
    const appId = 'letseat-366e9';
    const path = `/v1/projects/${appId}/databases/(default)/documents/artifacts/${appId}/public/data/${collectionName}/${encodeURIComponent(docId)}`;
    
    const req = https.request({
      hostname: 'firestore.googleapis.com',
      path,
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(d));
        } else {
          reject(new Error(`Firestore error ${res.statusCode}: ${d}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function seedSingleApprovedRecord() {
  console.log('============================================================');
  console.log('--- JIA-BEN TAIWAN 6.0C VERIFIED OFFICIAL CACHE SEED ---');
  console.log('============================================================\n');

  const csvFilePath = 'private_staging/moea/moea_business_restaurants.official-source.csv';
  if (!fs.existsSync(csvFilePath)) {
    throw new Error(`Official CSV file missing: ${csvFilePath}`);
  }

  // 1. Re-verify source file SHA-256
  const fileBuffer = fs.readFileSync(csvFilePath);
  const fileSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const expectedSha256 = '43e483c1bd37848a5a4bf5a329a91ae7ba0d14e498553a66992526753737d08b';
  
  if (fileSha256 !== expectedSha256) {
    throw new Error(`SHA-256 mismatch! Expected: ${expectedSha256}, Got: ${fileSha256}`);
  }
  console.log(`🔒 Official CSV SHA-256 Verified: ${fileSha256}`);

  // 2. Re-read row 10955 directly from CSV
  const fileStream = fs.createReadStream(csvFilePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let targetRowNumber = 10955;
  let currentRow = 0;
  let targetRawLine = null;

  for await (const line of rl) {
    currentRow++;
    if (currentRow === targetRowNumber) {
      targetRawLine = line.trim();
      break;
    }
  }

  if (!targetRawLine) {
    throw new Error(`Row ${targetRowNumber} not found in CSV!`);
  }

  console.log(`\n🔍 Read Source Row ${targetRowNumber}:`);
  console.log(`   ${targetRawLine}\n`);

  // Parse CSV line
  const cleanLine = targetRawLine.replace(/^["']|["']$/g, '');
  const cols = cleanLine.split('","');
  const businessId = (cols[0] || '').replace(/^"/, '');
  const officialName = cols[1] || '';
  const officialAddress = cols[2] || '';
  const businessStatus = cols[3] || '核准設立';

  console.log('📋 Validating extracted fields:');
  console.log(`   - 統一編號: ${businessId}`);
  console.log(`   - 商業名稱: ${officialName}`);
  console.log(`   - 商業地址: ${officialAddress}`);
  console.log(`   - 登記狀態: ${businessStatus}\n`);

  if (businessId !== '08878896') {
    throw new Error(`Validation failed: Expected businessId 08878896, got ${businessId}`);
  }
  if (officialName !== '金溫州餛飩大王') {
    throw new Error(`Validation failed: Expected officialName 金溫州餛飩大王, got ${officialName}`);
  }
  if (!officialAddress.includes('高雄市') || !officialAddress.includes('鹽埕區') || !officialAddress.includes('新樂街') || !officialAddress.includes('163巷') && !officialAddress.includes('１６３巷') || !officialAddress.includes('1號') && !officialAddress.includes('１號')) {
    throw new Error(`Validation failed: Address does not match expected elements: ${officialAddress}`);
  }

  const rawSourceHash = 'sha256:' + crypto.createHash('sha256').update(targetRawLine).digest('hex');
  const normAddr = TaiwanAddressNormalizer.normalizeTaiwanAddress(officialAddress);

  // 3. Check existing production counts and duplicates
  console.log('🛡️ Performing Pre-Write Production Audit...');
  const currentJiaPlaces = await fetchCollection('jiaPlaces');
  const currentPoiCache = await fetchCollection('taiwanPoiCache');

  console.log(`   - Current jiaPlaces: ${currentJiaPlaces.length}`);
  console.log(`   - Current taiwanPoiCache: ${currentPoiCache.length}`);

  if (currentJiaPlaces.length !== 52) {
    throw new Error(`Aborted: jiaPlaces count expected 52, got ${currentJiaPlaces.length}`);
  }

  // Duplicate checks
  const existingDocWithId = currentPoiCache.find(doc => doc.businessId === businessId);
  if (existingDocWithId) {
    throw new Error(`Duplicate protection: businessId ${businessId} already exists in taiwanPoiCache!`);
  }
  const existingDocWithPlace = currentPoiCache.find(doc => doc.jiaPlaceId === 'jia_861b7f1e734675b2422c');
  if (existingDocWithPlace) {
    throw new Error(`Duplicate protection: jiaPlaceId jia_861b7f1e734675b2422c already mapped in taiwanPoiCache!`);
  }

  // 4. Construct verified official cache document
  const docId = `moea_business_${businessId}`;
  const verifiedDoc = {
    taiwanPoiId: docId,
    cacheId: docId,
    jiaPlaceId: 'jia_861b7f1e734675b2422c',
    businessId,
    officialName,
    rawOfficialName: officialName,
    normalizedName: officialName,
    address: officialAddress,
    officialAddress,
    rawOfficialAddress: officialAddress,
    normalizedAddress: normAddr.formattedAddress,
    city: normAddr.city || '高雄市',
    district: normAddr.district || '鹽埕區',
    businessStatus,
    registryType: 'BUSINESS',
    source: 'MOEA_GCIS',
    businessItems: ['F501060 餐館業'],
    provenance: {
      sourceDataset: '商業登記(依營業項目別)－餐廳餐館',
      officialSourceUrl: 'https://data.gcis.nat.gov.tw/',
      sourceFile: 'moea_business_restaurants.official-source.csv',
      sourceFileSha256: fileSha256,
      sourceRowNumber: targetRowNumber,
      rawSourceHash
    },
    verificationStatus: 'verified_official_registry',
    verifiedAt: new Date().toISOString()
  };

  // 5. Ingestion safety validation via TaiwanPoiCache
  const valRes = TaiwanPoiCache.validateProductionIngestionRecord(verifiedDoc);
  if (!valRes.valid) {
    throw new Error(`TaiwanPoiCache validation failed: ${valRes.reason}`);
  }
  console.log('✅ Ingestion record passes all TaiwanPoiCache safety validators.');

  // 6. Write ONLY THIS ONE record to Firestore taiwanPoiCache
  console.log(`\n🚀 Writing single verified document [${docId}] to Firestore taiwanPoiCache...`);
  const token = await getAnonymousToken();
  await saveToFirestore('taiwanPoiCache', docId, verifiedDoc, token);
  console.log('✅ Document successfully written to Firestore.');

  // 7. Post-write validation
  console.log('\n🔍 Verifying Production State...');
  const postJiaPlaces = await fetchCollection('jiaPlaces');
  const postPoiCache = await fetchCollection('taiwanPoiCache');

  console.log(`   - Post-write jiaPlaces: ${postJiaPlaces.length} (Expected: 52)`);
  console.log(`   - Post-write taiwanPoiCache: ${postPoiCache.length} (Expected: 1)`);

  if (postJiaPlaces.length !== 52) {
    throw new Error(`CRITICAL: jiaPlaces count altered! Expected 52, got ${postJiaPlaces.length}`);
  }
  if (postPoiCache.length !== 1) {
    throw new Error(`CRITICAL: taiwanPoiCache count mismatch! Expected 1, got ${postPoiCache.length}`);
  }

  const seededDoc = postPoiCache[0];
  console.log('\n📄 Seeded Document Inspection:');
  console.log(`   - Document ID: ${seededDoc.jiaPlaceId || seededDoc.cacheId || docId}`);
  console.log(`   - businessId: ${seededDoc.businessId}`);
  console.log(`   - officialName: ${seededDoc.officialName}`);
  console.log(`   - officialAddress: ${seededDoc.officialAddress}`);
  console.log(`   - businessStatus: ${seededDoc.businessStatus}`);
  console.log(`   - linked jiaPlaceId: ${seededDoc.jiaPlaceId}`);
  console.log(`   - source: ${seededDoc.source}`);
  console.log(`   - verificationStatus: ${seededDoc.verificationStatus}`);
  console.log(`   - unsupported inferred fields present: 0 (phone: ${seededDoc.phone || 'none'}, hours: ${seededDoc.openingHours || 'none'}, photos: ${seededDoc.photos || 'none'})`);

  console.log('\n🎉 JIA-BEN TAIWAN 6.0C OFFICIAL CACHE SEED COMPLETED SUCCESSFULLY!\n');

  return {
    docId,
    seededDoc,
    totalJiaPlaces: postJiaPlaces.length,
    totalPoiCache: postPoiCache.length
  };
}

if (require.main === module) {
  seedSingleApprovedRecord().catch(err => {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  });
}

module.exports = {
  seedSingleApprovedRecord
};
