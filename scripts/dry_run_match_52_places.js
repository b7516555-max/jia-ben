/**
 * Dry-Run Matching Tool (scripts/dry_run_match_52_places.js)
 * 
 * Jia-ben Taiwan Place Intelligence 6.0A — Verified Official Registry Matching Dry Run
 * 
 * Evaluates candidate identity matching between verified `taiwanPoiCache` and
 * the 52 existing `jiaPlaces` in production Firestore.
 * 
 * STRICTLY READ-ONLY: jiaPlaces canonical writes = 0.
 */
const https = require('https');
const fs = require('fs');
const TaiwanPlaceIdentityResolver = require('../src/services/taiwanPlaceIdentityResolver.js');
const TaiwanAddressNormalizer = require('../src/utils/taiwanAddressNormalizer.js');

function decodeJiaFirestoreValue(value) {
  if (!value || typeof value !== 'object') return value;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeJiaFirestoreValue);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k, v]) => [k, decodeJiaFirestoreValue(v)]));
  return null;
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
          const docs = (json.documents || []).map(d => ({
            id: d.name.split('/').pop(),
            jiaPlaceId: d.name.split('/').pop(),
            ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, decodeJiaFirestoreValue(v)]))
          }));
          resolve(docs);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function runDryRun() {
  console.log('============================================================');
  console.log('--- JIA-BEN TAIWAN 6.0A MATCHING DRY RUN (READ ONLY) ---');
  console.log('============================================================\n');

  const jiaPlaces = await fetchCollection('jiaPlaces');
  const poiCache = await fetchCollection('taiwanPoiCache');

  console.log(`Loaded ${jiaPlaces.length} JiaPlaces and ${poiCache.length} verified MOEA POI records from Firestore.\n`);

  const autoMatchList = [];
  const needsReviewList = [];
  const rejectList = [];

  const candidateTable = [];

  for (const place of jiaPlaces) {
    let topScore = 0;
    let bestPoi = null;
    let bestEval = null;

    for (const poi of poiCache) {
      const evalRes = TaiwanPlaceIdentityResolver.evaluateTaiwanMatch(place, poi);
      if (evalRes.confidence > topScore) {
        topScore = evalRes.confidence;
        bestPoi = poi;
        bestEval = evalRes;
      }
    }

    let decision = 'REJECT';
    if (topScore >= 0.93) {
      decision = 'AUTO_MATCH';
      autoMatchList.push({ place, poi: bestPoi, evalRes: bestEval, confidence: topScore });
    } else if (topScore >= 0.85) {
      decision = 'NEEDS_REVIEW';
      needsReviewList.push({ place, poi: bestPoi, evalRes: bestEval, confidence: topScore });
    } else {
      rejectList.push({ place, poi: bestPoi, evalRes: bestEval, confidence: topScore });
    }

    candidateTable.push({
      jiaPlaceId: place.jiaPlaceId,
      jiaBenName: place.name,
      officialRegistryName: bestPoi ? bestPoi.officialName : '—',
      businessId: bestPoi ? bestPoi.businessId : '—',
      officialAddress: bestPoi ? bestPoi.address : '—',
      cityDistrict: bestPoi ? `${bestPoi.city || ''} ${bestPoi.district || ''}`.trim() : (place.city || '—'),
      confidence: topScore,
      matchSignals: bestEval ? bestEval.matchSignals.join(' | ') : 'No candidate',
      decision
    });
  }

  console.log('------------------------------------------------------------');
  console.log('CANDIDATE EVALUATION TABLE (52 PLACES)');
  console.log('------------------------------------------------------------');
  candidateTable.forEach((row, idx) => {
    const icon = row.decision === 'AUTO_MATCH' ? '✨ [AUTO_MATCH]' : (row.decision === 'NEEDS_REVIEW' ? '⚠️ [NEEDS_REVIEW]' : '❌ [REJECT/NO_MATCH]');
    console.log(`${idx + 1}. ${icon} "${row.jiaBenName}" <==> "${row.officialRegistryName}" (Score: ${row.confidence})`);
    console.log(`   ID: ${row.jiaPlaceId} | 統編: ${row.businessId} | 地址: ${row.officialAddress} (${row.cityDistrict})`);
    console.log(`   Signals: ${row.matchSignals}\n`);
  });

  console.log('============================================================');
  console.log('📊 DRY RUN MATCHING SUMMARY:');
  console.log(`   - Total Existing JiaPlaces Evaluated: ${jiaPlaces.length}`);
  console.log(`   - Verified MOEA POI Cache Documents: ${poiCache.length}`);
  console.log(`   - ✨ AUTO MATCH (>= 0.93): ${autoMatchList.length}`);
  console.log(`   - ⚠️ NEEDS REVIEW (0.85 - 0.929): ${needsReviewList.length}`);
  console.log(`   - ❌ REJECT / NO MATCH (< 0.85): ${rejectList.length}`);
  console.log(`   - 🛡️ JiaPlaces Database Writes: 0 (STRICTLY READ ONLY)`);
  console.log('============================================================\n');

  return {
    totalPlaces: jiaPlaces.length,
    totalPois: poiCache.length,
    autoMatchCount: autoMatchList.length,
    needsReviewCount: needsReviewList.length,
    rejectCount: rejectList.length,
    candidateTable,
    autoMatchList,
    needsReviewList,
    rejectList
  };
}

if (require.main === module) {
  runDryRun().catch(console.error);
}

module.exports = { runDryRun };
