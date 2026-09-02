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

  // Selected 11 Batch 3 candidates (reliable GPS & names)
  const selectedNames = [
    '8818 比薩屋',
    '森碳 Wooded Coal Beverage & Grill',
    '麥料食堂',
    '時區（鹹甜餐盒/外燴服務）',
    '藤燒肉',
    '炸蛋蔥油餅 黃車',
    '正良麵店',
    '美菊麵店',
    '碰心蘿蔔',
    '焦糖楓串燒漢方無烟撒粉第一品牌 屏東直營店（內用/外帶）',
    '咕嘰咕嘰早午餐-和平店'
  ];

  const batch = selectedNames.map(name => allPlaces.find(x => x.name === name)).filter(Boolean);
  console.log(`=== STARTING BATCH 3 DRY RUN (${batch.length} STORES) ===\n`);

  const diffReport = [];

  for (const place of batch) {
    console.log(`Evaluating [${place.name}] (${place.city || '未填'})...`);

    const missing = [];
    if (!place.address) missing.push('address');
    if (!place.phone) missing.push('phone');
    if (!place.website) missing.push('website');
    if (!place.openingHours) missing.push('openingHours');

    // Single Foursquare Search request
    const fsqResult = await callGasProxy('foursquare', place);

    let matchEvaluation = {
      nameSimilarity: 0,
      brandCoreA: '',
      brandCoreB: '',
      isBrandCoreExact: false,
      distance: 0,
      confidence: 0,
      acceptable: false,
      canAutoWrite: false
    };

    let proposedUpdates = {};
    let action = 'NO_MATCH';

    if (fsqResult && fsqResult.status === 'success' && fsqResult.name) {
      matchEvaluation = global.JiaPlaceMatch.scoreMatch(place, fsqResult);

      if (matchEvaluation.canAutoWrite && matchEvaluation.confidence >= AUTO_WRITE_THRESHOLD) {
        // Strict address filter
        if (missing.includes('address') && fsqResult.address) {
          const addr = fsqResult.address.trim();
          if (addr.includes('路') || addr.includes('街') || addr.includes('巷') || addr.includes('號') || addr.includes('段')) {
            proposedUpdates.address = addr;
          }
        }
        if (missing.includes('phone') && fsqResult.phone) {
          proposedUpdates.phone = fsqResult.phone;
        }

        action = Object.keys(proposedUpdates).length > 0 ? 'AUTO_WRITE' : 'MATCHED_NO_NEW_FIELDS';
      } else if (matchEvaluation.acceptable && matchEvaluation.confidence >= MATCH_DETAILS_THRESHOLD) {
        action = 'NEEDS_REVIEW';
      } else {
        action = 'REJECT_MATCH';
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
      foursquareRaw: fsqResult,
      matchEvaluation,
      proposedUpdates,
      action
    });
  }

  fs.mkdirSync(path.join(rootDir, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'reports', 'batch3-proposed-diff.json'), JSON.stringify(diffReport, null, 2));

  console.log('\n=== BATCH 3 PROPOSED DIFF SUMMARY ===');
  diffReport.forEach((d, idx) => {
    console.log(`\n${idx + 1}. [${d.name}] (${d.city}) -> Action: ${d.action} (Confidence: ${d.matchEvaluation.confidence})`);
    console.log(`   Candidate: "${d.foursquareRaw?.name || 'none'}" (Distance: ${d.matchEvaluation.distance}m, CoreMatch: ${d.matchEvaluation.isBrandCoreExact})`);
    console.log(`   Before: Addr="${d.existing.address}", Phone="${d.existing.phone}"`);
    console.log(`   Proposed: ${JSON.stringify(d.proposedUpdates)}`);
  });
})();
