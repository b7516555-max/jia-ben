/**
 * Staged In-Memory Matching Tool (scripts/dry_run_match_staged_moea.js)
 * 
 * Jia-ben Taiwan Place Intelligence 6.0B — Staged MOEA CSV Matcher
 * 
 * Takes staged records parsed from local official CSV and matches against 52 JiaPlaces.
 * STRICTLY READ-ONLY for Firestore (0 writes).
 */
const https = require('https');
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

async function matchStagedRecordsAgainstJiaPlaces(stagedRecords) {
  const jiaPlaces = await fetchCollection('jiaPlaces');
  console.log(`Loaded ${jiaPlaces.length} JiaPlaces from Firestore.\n`);

  const autoMatchList = [];
  const needsReviewList = [];
  const rejectList = [];
  const candidateTable = [];

  for (const place of jiaPlaces) {
    let topScore = 0;
    let bestRecord = null;
    let bestEval = null;

    for (const rec of stagedRecords) {
      const evalRes = TaiwanPlaceIdentityResolver.evaluateTaiwanMatch(place, rec);
      if (evalRes.confidence > topScore) {
        topScore = evalRes.confidence;
        bestRecord = rec;
        bestEval = evalRes;
      }
    }

    let decision = 'REJECT';
    if (topScore >= 0.93) {
      decision = 'AUTO_MATCH';
      autoMatchList.push({ place, record: bestRecord, evalRes: bestEval, confidence: topScore });
    } else if (topScore >= 0.85) {
      decision = 'NEEDS_REVIEW';
      needsReviewList.push({ place, record: bestRecord, evalRes: bestEval, confidence: topScore });
    } else {
      rejectList.push({ place, record: bestRecord, evalRes: bestEval, confidence: topScore });
    }

    candidateTable.push({
      jiaPlaceId: place.jiaPlaceId,
      jiaBenName: place.name,
      existingAddress: place.address || '—',
      existingCity: place.city || '—',
      officialRegistryName: bestRecord ? bestRecord.officialName : '—',
      businessId: bestRecord ? bestRecord.businessId : '—',
      officialAddress: bestRecord ? bestRecord.address : '—',
      sourceRow: bestRecord ? bestRecord.sourceRowNumber : '—',
      rawSourceHash: bestRecord ? bestRecord.rawSourceHash : '—',
      confidence: topScore,
      matchSignals: bestEval ? bestEval.matchSignals.join(' | ') : 'No candidate',
      decision
    });
  }

  console.log('============================================================');
  console.log('📊 DRY RUN MATCHING SUMMARY (STAGED OFFICIAL CSV):');
  console.log(`   - Total Existing JiaPlaces Evaluated: ${jiaPlaces.length}`);
  console.log(`   - Staged Relevant Official Records: ${stagedRecords.length}`);
  console.log(`   - ✨ AUTO MATCH (>= 0.93): ${autoMatchList.length}`);
  console.log(`   - ⚠️ NEEDS REVIEW (0.85 - 0.929): ${needsReviewList.length}`);
  console.log(`   - ❌ REJECT / NO MATCH (< 0.85): ${rejectList.length}`);
  console.log(`   - 🛡️ Database Writes: 0 (STRICTLY READ ONLY)`);
  console.log('============================================================\n');

  return {
    totalPlaces: jiaPlaces.length,
    autoMatchCount: autoMatchList.length,
    needsReviewCount: needsReviewList.length,
    rejectCount: rejectList.length,
    candidateTable,
    autoMatchList,
    needsReviewList,
    rejectList
  };
}

module.exports = {
  matchStagedRecordsAgainstJiaPlaces
};
