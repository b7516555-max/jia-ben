const fs = require('fs');
const path = require('path');
const rootDir = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const apiKeyMatch = html.match(/apiKey:\s*['"]([^'"]+)['"]/);
const projectIdMatch = html.match(/projectId:\s*['"]([^'"]+)['"]/);
const apiKey = apiKeyMatch ? apiKeyMatch[1] : null;
const projectId = projectIdMatch ? projectIdMatch[1] : null;
const GAS_URL = 'https://script.google.com/macros/s/AKfycbwTg7lmireS-npCAzvDZVPVmI7u5jAFpslg7SNL59Ab3ulLOUr7cPB5wzIaTSyTUJpl/exec';

global.window = global;
global.JiaPlaceMatch = require('../src/utils/placeMatch.js');

const AUTO_WRITE_THRESHOLD = 0.90;
const MATCH_DETAILS_THRESHOLD = 0.88;

function dv(v) {
  if (!v || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dv);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k,x]) => [k, dv(x)]));
  return null;
}

async function loadPlaces() {
  const authRes = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true })
  });
  const auth = await authRes.json();
  const res = await fetch('https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/(default)/documents/artifacts/' + projectId + '/public/data/jiaPlaces?pageSize=100', {
    headers: { Authorization: 'Bearer ' + auth.idToken }
  });
  const data = await res.json();
  return (data.documents || []).map(d => ({
    jiaPlaceId: d.name.split('/').pop(),
    ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, dv(v)]))
  }));
}

async function callGasProxy(provider, place) {
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'enrich_place',
        provider: provider,
        place: {
          name: place.name,
          location: place.location
        }
      })
    });
    return await res.json();
  } catch (err) {
    return { status: 'error', message: err.message };
  }
}

(async () => {
  const allPlaces = await loadPlaces();
  console.log(`Total jiaPlaces in Firestore: ${allPlaces.length}`);

  // Filter eligible stores:
  // - Has valid GPS (lat & lng finite)
  // - Name is valid string
  // - Missing address OR missing phone
  // - Does NOT already have a valid sourceIds.foursquare
  const eligiblePlaces = allPlaces.filter(p => {
    const hasGps = Number.isFinite(p.location?.lat) && Number.isFinite(p.location?.lng);
    const hasName = Boolean(p.name && String(p.name).trim());
    const hasFsqId = Boolean(p.sourceIds && p.sourceIds.foursquare);
    const needsInfo = (!p.address || String(p.address).trim() === '') || (!p.phone || String(p.phone).trim() === '');
    return hasGps && hasName && !hasFsqId && needsInfo;
  });

  console.log(`Found ${eligiblePlaces.length} eligible stores for Final Backfill.\n`);

  const diffReport = [];
  let fsqSearchCount = 0;
  let geoapifyFallbackCount = 0;

  for (const place of eligiblePlaces) {
    console.log(`Processing [${place.name}] (${place.city || '未填'})...`);

    const missing = [];
    if (!place.address) missing.push('address');
    if (!place.phone) missing.push('phone');

    // 1. Single FSQ Search
    fsqSearchCount++;
    let providerUsed = 'foursquare';
    let candidate = await callGasProxy('foursquare', place);
    let matchEvaluation = null;
    let proposedUpdates = {};
    let action = 'NO_MATCH';

    if (candidate && candidate.status === 'success' && candidate.name) {
      matchEvaluation = global.JiaPlaceMatch.scoreMatch(place, candidate);

      if (matchEvaluation.canAutoWrite && matchEvaluation.confidence >= AUTO_WRITE_THRESHOLD) {
        if (missing.includes('address') && candidate.address) {
          const addr = candidate.address.trim();
          if (addr.includes('路') || addr.includes('街') || addr.includes('巷') || addr.includes('號') || addr.includes('段')) {
            proposedUpdates.address = addr;
          }
        }
        if (missing.includes('phone') && candidate.phone) {
          proposedUpdates.phone = candidate.phone;
        }

        action = Object.keys(proposedUpdates).length > 0 ? 'AUTO_WRITE' : 'MATCHED_NO_NEW_FIELDS';
      } else if (matchEvaluation.acceptable && matchEvaluation.confidence >= MATCH_DETAILS_THRESHOLD) {
        action = 'NEEDS_REVIEW';
      } else {
        action = 'REJECT_MATCH';
      }
    } else {
      action = 'NO_MATCH';
    }

    // 2. If NO_MATCH or REJECT_MATCH with no candidate, check if Geoapify fallback is warranted
    if (action === 'NO_MATCH') {
      geoapifyFallbackCount++;
      const geoResult = await callGasProxy('geoapify', place);
      if (geoResult && geoResult.status === 'success' && geoResult.name) {
        const geoMatch = global.JiaPlaceMatch.scoreMatch(place, geoResult);
        if (geoMatch.canAutoWrite && geoMatch.confidence >= AUTO_WRITE_THRESHOLD) {
          providerUsed = 'geoapify';
          candidate = geoResult;
          matchEvaluation = geoMatch;
          if (missing.includes('address') && geoResult.address) {
            const addr = geoResult.address.trim();
            if (addr.includes('路') || addr.includes('街') || addr.includes('巷') || addr.includes('號') || addr.includes('段')) {
              proposedUpdates.address = addr;
            }
          }
          if (missing.includes('phone') && geoResult.phone) {
            proposedUpdates.phone = geoResult.phone;
          }
          action = Object.keys(proposedUpdates).length > 0 ? 'AUTO_WRITE' : 'MATCHED_NO_NEW_FIELDS';
        }
      }
    }

    diffReport.push({
      jiaPlaceId: place.jiaPlaceId,
      name: place.name,
      city: place.city,
      location: place.location,
      existing: {
        address: place.address || '',
        phone: place.phone || '',
        sourceIds: place.sourceIds || {}
      },
      missingFields: missing,
      providerUsed,
      candidateRaw: candidate,
      matchEvaluation: matchEvaluation || {
        nameSimilarity: 0,
        brandCoreA: '',
        brandCoreB: '',
        isBrandCoreExact: false,
        distance: 0,
        confidence: 0,
        acceptable: false,
        canAutoWrite: false
      },
      proposedUpdates,
      action
    });
  }

  fs.mkdirSync(path.join(rootDir, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'reports', 'final-backfill-proposed-diff.json'), JSON.stringify(diffReport, null, 2));

  console.log('\n=== FINAL BACKFILL PROPOSED DIFF SUMMARY ===');
  console.log(`Foursquare Search Calls: ${fsqSearchCount}`);
  console.log(`Geoapify Fallback Calls: ${geoapifyFallbackCount}`);

  diffReport.forEach((d, idx) => {
    console.log(`\n${idx + 1}. [${d.name}] (${d.city}) -> Action: ${d.action} (Confidence: ${d.matchEvaluation.confidence})`);
    console.log(`   Candidate: "${d.candidateRaw?.name || 'none'}" (Provider: ${d.providerUsed}, Distance: ${d.matchEvaluation.distance}m)`);
    console.log(`   Proposed Updates: ${JSON.stringify(d.proposedUpdates)}`);
  });
})();
