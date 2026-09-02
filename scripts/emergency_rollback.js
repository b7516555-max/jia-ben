/**
 * Emergency Data Integrity Audit & Rollback (scripts/emergency_rollback.js)
 * 
 * Safely reverts all unverified/sample-enriched fields in jiaPlaces
 * back to the pre-enrichment snapshot (jiaPlaces_backup_2026-09-02T14-55-44-913Z.json)
 * and purges all 20 unverified documents from taiwanPoiCache in Firestore.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const PRE_ENRICHMENT_BACKUP_FILE = path.join(__dirname, '../backups/jiaPlaces_backup_2026-09-02T14-55-44-913Z.json');

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

function patchFirestorePlace(jiaPlaceId, updateFields, token) {
  return new Promise((resolve, reject) => {
    const fields = {};
    const updateMask = [];
    for (const [k, v] of Object.entries(updateFields)) {
      if (v !== undefined) {
        fields[k] = encodeFirestoreValue(v);
        updateMask.push(`updateMask.fieldPaths=${encodeURIComponent(k)}`);
      }
    }
    const body = JSON.stringify({ fields });
    const appId = 'letseat-366e9';
    const maskQuery = updateMask.length > 0 ? `?${updateMask.join('&')}` : '';
    const path = `/v1/projects/${appId}/databases/(default)/documents/artifacts/${appId}/public/data/jiaPlaces/${encodeURIComponent(jiaPlaceId)}${maskQuery}`;
    
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
          reject(new Error(`Firestore PATCH error ${res.statusCode}: ${d}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function deleteFirestoreDoc(collectionName, docId, token) {
  return new Promise((resolve, reject) => {
    const appId = 'letseat-366e9';
    const path = `/v1/projects/${appId}/databases/(default)/documents/artifacts/${appId}/public/data/${collectionName}/${encodeURIComponent(docId)}`;
    const req = https.request({
      hostname: 'firestore.googleapis.com',
      path,
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(true);
        } else {
          reject(new Error(`Firestore DELETE error ${res.statusCode}: ${d}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function fetchCollection(collectionName) {
  return new Promise((resolve, reject) => {
    const url = `https://firestore.googleapis.com/v1/projects/letseat-366e9/databases/(default)/documents/artifacts/letseat-366e9/public/data/${collectionName}?pageSize=100`;
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.documents || []);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function executeRollback() {
  console.log('============================================================');
  console.log('--- EXECUTING EMERGENCY DATA INTEGRITY AUDIT & ROLLBACK ---');
  console.log('============================================================\n');

  if (!fs.existsSync(PRE_ENRICHMENT_BACKUP_FILE)) {
    throw new Error(`Pre-enrichment backup file not found at ${PRE_ENRICHMENT_BACKUP_FILE}`);
  }

  const token = await getAnonymousToken();
  console.log('✅ Firebase Authentication Succeeded.');

  // 1. Load Pre-Enrichment Backup
  const backupData = JSON.parse(fs.readFileSync(PRE_ENRICHMENT_BACKUP_FILE, 'utf-8'));
  const originalRecordsMap = new Map();
  backupData.records.forEach(r => originalRecordsMap.set(r.jiaPlaceId, r));
  console.log(`Loaded ${originalRecordsMap.size} pre-enrichment canonical records from backup.`);

  // 2. Rollback the 19 touched jiaPlaces
  const touchedPlaceIds = [
    'jia_00a6204be2176c827b4d', // 金井珈琲
    'jia_13513514ba4e48881396', // 藤燒肉
    'jia_154f86ca612af8c64acf', // 義爵式創意輕食
    'jia_1bcc5d4c06279d923b10', // 炸蛋蔥油餅 黃車
    'jia_21dbfa864cf455f8596f', // 正良麵店
    'jia_24ae59a6709abd150def', // 美菊麵店
    'jia_26e52c76231e410d234c', // 碰心蘿蔔
    'jia_2b7a7cf3a453a4336bdb', // 日和珈琲 GoodVibe Coffee
    'jia_46be98c59eeb1ea2eaf1', // 咕嘰咕嘰早午餐-和平店
    'jia_48f4378cd9d4f0b0d3b8', // 野田壽司
    'jia_4a0aa04dc144b9d537ca', // 手酒咖啡 soldier coffee
    'jia_753d6854733e2ac7f509', // 魚罐頭咖啡館
    'jia_861b7f1e734675b2422c', // 金溫州餛飩大王
    'jia_86514ed466bffcce450a', // 拉麵山田
    'jia_8a5c0e6a56c8c69e0bf4', // 米半 鐵板料理
    'jia_a05a5d74e32f5863e88e', // 帕狄尼諾 Padrino 義大利廚房
    'jia_bbffaba7e372dc4bb25c', // 8818 比薩屋
    'jia_bdf8a92aeea10e5e6771', // 義成伯の麵店
    'jia_c7c9e231e57698f15123'  // 桃花源餐廳嘉義分店
  ];

  console.log(`\n--- PARTIAL ROLLBACK OF 19 TOUCHED JIAPLACES ---`);
  let rollbackCount = 0;
  for (const placeId of touchedPlaceIds) {
    const orig = originalRecordsMap.get(placeId);
    if (!orig) {
      console.warn(`⚠️ Original record not found for ID: ${placeId}`);
      continue;
    }

    const revertFields = {
      address: orig.address !== undefined ? orig.address : '',
      phone: orig.phone !== undefined ? orig.phone : '',
      city: orig.city !== undefined ? orig.city : '',
      district: orig.district !== undefined ? orig.district : '',
      openingHours: orig.openingHours !== undefined ? orig.openingHours : '',
      categories: orig.categories !== undefined ? orig.categories : [],
      website: orig.website !== undefined ? orig.website : '',
      sourceIds: orig.sourceIds || {
        google: orig.googlePlaceId || '',
        osm: '',
        foursquare: '',
        here: '',
        geoapify: '',
        moea: '',
        tfda: '',
        taiwanPoiCache: ''
      },
      fieldSources: orig.fieldSources || {},
      updatedAt: new Date().toISOString()
    };

    try {
      await patchFirestorePlace(placeId, revertFields, token);
      rollbackCount++;
      console.log(`[${rollbackCount}/${touchedPlaceIds.length}] Reverted: ${orig.name} (${placeId}) -> Clean original state`);
    } catch (err) {
      console.error(`❌ Failed to revert ${orig.name}:`, err.message);
    }
  }

  // 3. Purge all 20 unverified documents from taiwanPoiCache
  console.log(`\n--- PURGING ALL UNVERIFIED TAIWAN POI CACHE DOCUMENTS ---`);
  const poiDocs = await fetchCollection('taiwanPoiCache');
  console.log(`Found ${poiDocs.length} documents in live taiwanPoiCache.`);

  let purgedCount = 0;
  for (const doc of poiDocs) {
    const docId = doc.name.split('/').pop();
    try {
      await deleteFirestoreDoc('taiwanPoiCache', docId, token);
      purgedCount++;
      console.log(`[${purgedCount}/${poiDocs.length}] Deleted unverified cache doc: ${docId}`);
    } catch (err) {
      console.error(`❌ Failed to delete cache doc ${docId}:`, err.message);
    }
  }

  console.log('\n============================================================');
  console.log(`🎉 EMERGENCY ROLLBACK COMPLETE:`);
  console.log(`   - JiaPlaces Reverted: ${rollbackCount} / 19`);
  console.log(`   - Unverified taiwanPoiCache Documents Deleted: ${purgedCount} / ${poiDocs.length}`);
  console.log('============================================================\n');
}

if (require.main === module) {
  executeRollback().catch(console.error);
}

module.exports = { executeRollback };
