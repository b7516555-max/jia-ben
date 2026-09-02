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

// Thresholds
const MATCH_DETAILS_THRESHOLD = 0.88;
const AUTO_WRITE_THRESHOLD = 0.90;

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

  // Selected Batch 2 places:
  // 1. 金溫州餛飩大王 (Batch 1 store with sourceIds.foursquare, test Details / reuse)
  // 2. 桃花源餐廳嘉義分店 (Batch 1 store with sourceIds.foursquare, test Details / reuse)
  // 3. 帕狄尼諾 Padrino 義大利廚房 (高雄市 - new store)
  // 4. 清流房日式拉麵 (高雄市 - new store)
  // 5. 大埔牛肉麵 (屏東縣 - new store)
  // 6. 8818 比薩屋 (台南市 - new store)
  // 7. 福利咖啡社 (高雄市 - new store)
  // 8. 芳-眷村麵店（原六塊厝-眷村麵店） (屏東縣 - new store)

  const selectedNames = [
    '金溫州餛飩大王',
    '桃花源餐廳嘉義分店',
    '帕狄尼諾 Padrino 義大利廚房',
    '清流房日式拉麵',
    '大埔牛肉麵',
    '8818 比薩屋',
    '福利咖啡社',
    '芳-眷村麵店（原六塊厝-眷村麵店）'
  ];

  const batch = selectedNames.map(name => allPlaces.find(x => x.name === name)).filter(Boolean);
  console.log(`=== STARTING BATCH 2 DRY RUN (${batch.length} STORES) ===\n`);

  const diffReport = [];

  for (const place of batch) {
    console.log(`Evaluating [${place.name}] (${place.city || '未填'})...`);

    const hasFsqId = Boolean(place.sourceIds && place.sourceIds.foursquare);
    const missing = [];
    if (!place.address) missing.push('address');
    if (!place.phone) missing.push('phone');
    if (!place.website) missing.push('website');
    if (!place.openingHours) missing.push('openingHours');

    let searchNeeded = !hasFsqId;
    let detailsNeeded = hasFsqId && (missing.includes('openingHours') || missing.includes('website'));
    let fsqResult = null;
    let apiCallType = 'NONE';

    if (searchNeeded) {
      apiCallType = 'SEARCH';
      fsqResult = await callGasProxy('foursquare', place);
    } else if (detailsNeeded) {
      // Re-using cached FSQ data or verifying details
      apiCallType = 'DETAILS_REUSE';
      fsqResult = await callGasProxy('foursquare', place);
    } else {
      apiCallType = 'CACHE_HIT';
    }

    let matchEvaluation = {
      nameSimilarity: 0,
      distance: 0,
      confidence: 0,
      acceptable: false
    };

    let proposedUpdates = {};
    let action = 'SKIP';

    if (fsqResult && fsqResult.status === 'success' && fsqResult.name) {
      const nameSim = global.JiaPlaceMatch.similarity(place.name, fsqResult.name);
      const dist = fsqResult.location?.lat && fsqResult.location?.lng
        ? global.JiaPlaceMatch.distanceMeters(place.location, fsqResult.location)
        : 20;

      const isAcceptable = nameSim >= 0.85;
      const confidence = Number((nameSim * 0.7 + (dist <= 100 ? 0.3 : 0.15)).toFixed(2));

      matchEvaluation = {
        nameSimilarity: Number(nameSim.toFixed(3)),
        distance: Math.round(dist),
        confidence: confidence,
        acceptable: isAcceptable
      };

      if (confidence >= AUTO_WRITE_THRESHOLD) {
        // Address quality filter: must contain road/street/lane/no/sec
        if (missing.includes('address') && fsqResult.address) {
          const addr = fsqResult.address.trim();
          if (addr.includes('路') || addr.includes('街') || addr.includes('巷') || addr.includes('號') || addr.includes('段')) {
            proposedUpdates.address = addr;
          }
        }
        if (missing.includes('phone') && fsqResult.phone) {
          proposedUpdates.phone = fsqResult.phone;
        }
        if (missing.includes('website') && fsqResult.website && /^https?:\/\//i.test(fsqResult.website)) {
          proposedUpdates.website = fsqResult.website;
        }
        if (missing.includes('openingHours') && fsqResult.openingHours) {
          proposedUpdates.openingHours = fsqResult.openingHours;
        }

        action = Object.keys(proposedUpdates).length > 0 ? 'AUTO_WRITE' : 'MATCHED_NO_NEW_FIELDS';
      } else if (confidence >= MATCH_DETAILS_THRESHOLD) {
        action = 'NEEDS_REVIEW';
      } else {
        action = 'REJECT_MATCH';
      }
    } else {
      action = 'NO_MATCH';
    }

    diffReport.push({
      jiaPlaceId: place.jiaPlaceId,
      name: place.name,
      city: place.city,
      location: place.location,
      existing: {
        address: place.address || '',
        phone: place.phone || '',
        website: place.website || '',
        openingHours: place.openingHours || '',
        sourceIds: place.sourceIds || {}
      },
      missingFields: missing,
      apiCallType,
      foursquareRaw: fsqResult,
      matchEvaluation,
      proposedUpdates,
      action
    });
  }

  fs.mkdirSync(path.join(rootDir, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'reports', 'batch2-proposed-diff.json'), JSON.stringify(diffReport, null, 2));

  console.log('\n=== BATCH 2 PROPOSED DIFF SUMMARY ===');
  diffReport.forEach((d, idx) => {
    console.log(`\n${idx + 1}. [${d.name}] (${d.city}) -> Action: ${d.action} (Confidence: ${d.matchEvaluation.confidence})`);
    console.log(`   API Call Type: ${d.apiCallType}`);
    console.log(`   Before: Addr="${d.existing.address}", Phone="${d.existing.phone}"`);
    console.log(`   Proposed: ${JSON.stringify(d.proposedUpdates)}`);
  });
})();
