/**
 * Controlled Taiwan Place Enrichment Runner (scripts/controlled_enrichment_runner.js)
 * 
 * Safely enriches existing 52 JiaPlaces in controlled batches (5 -> 10 -> 15 -> remainder)
 * using Taiwan POI Cache & verified Government Open Data.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const TaiwanAddressNormalizer = require('../src/utils/taiwanAddressNormalizer.js');
const TaiwanPhoneNormalizer = require('../src/utils/taiwanPhoneNormalizer.js');
const TaiwanPlaceIdentityResolver = require('../src/services/taiwanPlaceIdentityResolver.js');
const CompletenessScorer = require('../src/services/completenessScorer.js');
const { fetchCollection, decodeJiaFirestoreValue } = require('./safe_backup_and_rollback.js');

const AUDIT_LOG_FILE = path.join(__dirname, '../backups/enrichment_audit_log.json');

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

async function runControlledBatch(batchSize = 5, batchName = 'Batch') {
  console.log(`\n============================================================`);
  console.log(`--- RUNNING CONTROLLED ENRICHMENT: ${batchName} (${batchSize} PLACES) ---`);
  console.log(`============================================================\n`);

  const token = await getAnonymousToken();
  const jiaPlaces = await fetchCollection('jiaPlaces');
  const poiCache = await fetchCollection('taiwanPoiCache');

  console.log(`Loaded ${jiaPlaces.length} JiaPlaces and ${poiCache.length} cached POI records from Firestore.`);

  const auditLog = fs.existsSync(AUDIT_LOG_FILE) ? JSON.parse(fs.readFileSync(AUDIT_LOG_FILE, 'utf-8')) : { batches: [] };
  const batchReport = {
    batchName,
    timestamp: new Date().toISOString(),
    batchSize,
    evaluated: 0,
    matched: 0,
    needsReview: 0,
    rejected: 0,
    patchedPlaces: [],
    skippedPlaces: []
  };

  let countPatchedInThisBatch = 0;

  for (const place of jiaPlaces) {
    if (countPatchedInThisBatch >= batchSize) break;

    // Check if place is already enriched from open data
    const hasFullAddress = Boolean(place.address && place.address.trim() !== 'null' && place.address.length >= 8 && !place.address.startsWith('📍'));
    const hasPhone = Boolean(place.phone && place.phone.trim() !== 'null' && place.phone.length >= 7);
    const hasHours = Boolean(place.openingHours && place.openingHours.trim() !== 'null' && place.openingHours.trim() !== '');

    // Find best match in poiCache
    let bestMatch = null;
    let maxConfidence = 0;

    for (const poi of poiCache) {
      const evalRes = TaiwanPlaceIdentityResolver.evaluateTaiwanMatch(place, poi);
      if (evalRes.confidence > maxConfidence) {
        maxConfidence = evalRes.confidence;
        bestMatch = { poi, evalRes };
      }
    }

    batchReport.evaluated++;

    if (!bestMatch || maxConfidence < 0.85) {
      batchReport.rejected++;
      batchReport.skippedPlaces.push({
        jiaPlaceId: place.jiaPlaceId,
        name: place.name,
        reason: `No acceptable candidate found (Top confidence: ${maxConfidence})`
      });
      continue;
    }

    if (maxConfidence < 0.93) {
      batchReport.needsReview++;
      batchReport.skippedPlaces.push({
        jiaPlaceId: place.jiaPlaceId,
        name: place.name,
        candidateName: bestMatch.poi.officialName,
        confidence: maxConfidence,
        reason: 'Requires human review (confidence between 0.85 and 0.929)'
      });
      continue;
    }

    // Auto Match (>= 0.93)
    batchReport.matched++;
    const { poi, evalRes } = bestMatch;

    // Build partial PATCH object: only fill missing or improve existing fields
    const patchFields = {};
    const fieldSources = { ...(place.fieldSources || {}) };
    const sourceIds = { ...(place.sourceIds || {}) };

    // 1. Address
    if (!hasFullAddress && poi.address) {
      const norm = TaiwanAddressNormalizer.normalizeTaiwanAddress(poi.address, poi.city);
      patchFields.address = norm.formattedAddress;
      if (norm.city) patchFields.city = norm.city;
      if (norm.district) patchFields.district = norm.district;
      fieldSources.address = poi.source || 'taiwan_open_data';
    }

    // 2. Phone
    if (!hasPhone && poi.phone) {
      const normP = TaiwanPhoneNormalizer.normalizeTaiwanPhone(poi.phone);
      if (normP.valid) {
        patchFields.phone = normP.formatted;
        fieldSources.phone = poi.source || 'taiwan_open_data';
      }
    }

    // 3. Category
    if ((!place.categories || place.categories.length === 0 || place.categories[0] === '未分類') && poi.categories) {
      patchFields.categories = Array.isArray(poi.categories) ? poi.categories : [poi.categories];
      fieldSources.category = poi.source || 'taiwan_open_data';
    }

    // 4. Opening Hours
    if (!hasHours && poi.openingHours) {
      patchFields.openingHours = poi.openingHours;
      fieldSources.openingHours = poi.source || 'taiwan_open_data';
    }

    // 5. Website / Social
    if (!place.website && poi.website) {
      patchFields.website = poi.website;
      fieldSources.website = 'official_website';
    }

    // 6. Location GPS
    if ((!place.location || !place.location.lat) && poi.location) {
      patchFields.location = poi.location;
    }

    // 7. Source IDs & Metadata
    if (poi.businessId) sourceIds.moea = poi.businessId;
    if (poi.foodRegistrationId) sourceIds.tfda = poi.foodRegistrationId;
    sourceIds.taiwanPoiCache = poi.taiwanPoiId;

    patchFields.sourceIds = sourceIds;
    patchFields.fieldSources = fieldSources;
    patchFields.updatedAt = new Date().toISOString();

    // Check if there are actual new fields added
    const changedKeys = Object.keys(patchFields).filter(k => k !== 'updatedAt' && k !== 'sourceIds' && k !== 'fieldSources');
    if (changedKeys.length === 0) {
      console.log(`[SKIP] ${place.name} is already complete for matched fields.`);
      continue;
    }

    // Execute partial PATCH
    console.log(`[PATCH ${countPatchedInThisBatch + 1}/${batchSize}] ${place.name} (${place.jiaPlaceId})`);
    console.log(`   Matching: "${poi.officialName}" | Confidence: ${maxConfidence}`);
    console.log(`   Adding fields: ${changedKeys.join(', ')}`);

    try {
      await patchFirestorePlace(place.jiaPlaceId, patchFields, token);
      countPatchedInThisBatch++;

      batchReport.patchedPlaces.push({
        jiaPlaceId: place.jiaPlaceId,
        name: place.name,
        matchedPoi: poi.officialName,
        confidence: maxConfidence,
        signals: evalRes.matchSignals,
        before: {
          address: place.address || '',
          phone: place.phone || '',
          city: place.city || '',
          openingHours: place.openingHours || '',
          categories: place.categories || []
        },
        after: {
          address: patchFields.address || place.address || '',
          phone: patchFields.phone || place.phone || '',
          city: patchFields.city || place.city || '',
          openingHours: patchFields.openingHours || place.openingHours || '',
          categories: patchFields.categories || place.categories || []
        }
      });
      console.log(`   ✅ Patched successfully!`);
    } catch (err) {
      console.error(`   ❌ Failed to patch ${place.name}:`, err.message);
    }
  }

  auditLog.batches.push(batchReport);
  fs.writeFileSync(AUDIT_LOG_FILE, JSON.stringify(auditLog, null, 2));

  console.log(`\n🎉 ${batchName} Finished: Patched ${countPatchedInThisBatch} places, Matched ${batchReport.matched}, Rejected ${batchReport.rejected}, Needs Review ${batchReport.needsReview}`);
  return batchReport;
}

module.exports = {
  runControlledBatch
};

if (require.main === module) {
  const size = Number(process.argv[2]) || 5;
  const name = process.argv[3] || `Batch_${size}`;
  runControlledBatch(size, name).catch(console.error);
}
