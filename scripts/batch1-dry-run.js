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
  const selectedNames = [
    '金溫州餛飩大王',
    '米半 鐵板料理',
    '桃花源餐廳嘉義分店',
    '日和珈琲 GoodVibe Coffee',
    '野田壽司',
    '海豐鱔魚意麵'
  ];

  const batch = selectedNames.map(name => allPlaces.find(x => x.name === name)).filter(Boolean);
  console.log(`=== STARTING BATCH 1 DRY RUN (${batch.length} STORES) ===\n`);

  const diffReport = [];

  for (const place of batch) {
    console.log(`Evaluating [${place.name}] (${place.city || '未填'})...`);
    
    // Check missing fields
    const missing = [];
    if (!place.address) missing.push('address');
    if (!place.phone) missing.push('phone');
    if (!place.website) missing.push('website');
    if (!place.openingHours) missing.push('openingHours');

    // Call FSQ Search via GAS
    const fsq = await callGasProxy('foursquare', place);

    let matchEvaluation = {
      nameSimilarity: 0,
      distance: 0,
      confidence: 0,
      acceptable: false,
      reason: ''
    };

    let proposedUpdates = {};
    let action = 'SKIP';

    if (fsq && fsq.status === 'success' && fsq.name) {
      const nameSim = global.JiaPlaceMatch.similarity(place.name, fsq.name);
      const dist = fsq.location?.lat && fsq.location?.lng 
        ? global.JiaPlaceMatch.distanceMeters(place.location, fsq.location)
        : 20; // Default nominal distance if not exposed in proxy
      
      const isAcceptable = nameSim >= 0.85;
      const confidence = Number((nameSim * 0.7 + (dist <= 100 ? 0.3 : 0.15)).toFixed(2));

      matchEvaluation = {
        nameSimilarity: Number(nameSim.toFixed(3)),
        distance: Math.round(dist),
        confidence: confidence,
        acceptable: isAcceptable
      };

      if (isAcceptable && confidence >= 0.88) {
        // Prepare proposed fields - ONLY fill missing fields!
        if (missing.includes('address') && fsq.address && fsq.address.length > 5) {
          // Check if address is not just a generic city string
          if (!fsq.address.match(/^[\u4e00-\u9fa5\w\s,]+$/) || fsq.address.includes('路') || fsq.address.includes('街') || fsq.address.includes('巷') || fsq.address.includes('號') || fsq.address.includes('段')) {
            proposedUpdates.address = fsq.address;
          }
        }
        if (missing.includes('phone') && fsq.phone) {
          proposedUpdates.phone = fsq.phone;
        }
        if (missing.includes('website') && fsq.website && /^https?:\/\//i.test(fsq.website)) {
          proposedUpdates.website = fsq.website;
        }
        if (missing.includes('openingHours') && fsq.openingHours) {
          proposedUpdates.openingHours = fsq.openingHours;
        }

        if (Object.keys(proposedUpdates).length > 0) {
          action = 'AUTO_WRITE';
        } else {
          action = 'MATCHED_NO_NEW_FIELDS';
        }
      } else {
        action = 'NEEDS_REVIEW';
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
        openingHours: place.openingHours || ''
      },
      missingFields: missing,
      foursquareRaw: fsq,
      matchEvaluation,
      proposedUpdates,
      action
    });
  }

  fs.mkdirSync(path.join(rootDir, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'reports', 'batch1-proposed-diff.json'), JSON.stringify(diffReport, null, 2));
  console.log('\n=== PROPOSED DIFF SUMMARY ===');
  diffReport.forEach((d, idx) => {
    console.log(`\n${idx + 1}. [${d.name}] (${d.city}) -> Action: ${d.action} (Confidence: ${d.matchEvaluation.confidence || 0})`);
    console.log(`   Before: Addr="${d.existing.address}", Phone="${d.existing.phone}"`);
    console.log(`   Proposed: ${JSON.stringify(d.proposedUpdates)}`);
  });
})();
