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
const nominatim = require('../src/providers/nominatimAdapter.js');
const overpass = require('../src/providers/osmAdapter.js');

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
  const preferred = ['黑輪坤', '金溫州餛飩大王', '米半 鐵板料理', '桃花源餐廳嘉義分店', '日和珈琲 GoodVibe Coffee'];
  const selected = preferred.map(name => allPlaces.find(x => x.name === name)).filter(Boolean);

  console.log('--- STARTING 5-STORE REAL COMPARISON (READ-ONLY) ---');
  const results = [];

  for (const place of selected) {
    console.log(`\nEvaluating [${place.name}] (${place.city || '未知城市'}) ...`);
    
    // Foursquare call via GAS
    const fsqRaw = await callGasProxy('foursquare', place);
    
    // Geoapify call via GAS
    const geoRaw = await callGasProxy('geoapify', place);

    // HERE call via GAS (expect disabled_no_key)
    const hereRaw = await callGasProxy('here', place);

    // Nominatim
    let nomRaw = null;
    try {
      nomRaw = await nominatim.search(place);
    } catch (e) {
      nomRaw = { error: e.message };
    }

    // Overpass
    let osmRaw = null;
    try {
      osmRaw = await overpass.search(place);
    } catch (e) {
      osmRaw = { error: e.message };
    }

    results.push({
      place: {
        jiaPlaceId: place.jiaPlaceId,
        name: place.name,
        city: place.city,
        location: place.location,
        existing: {
          address: place.address || '',
          phone: place.phone || '',
          website: place.website || '',
          openingHours: place.openingHours || ''
        }
      },
      foursquare: fsqRaw,
      geoapify: geoRaw,
      here: hereRaw,
      nominatim: nomRaw,
      overpass: osmRaw
    });
  }

  fs.mkdirSync(path.join(rootDir, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'reports', 'real-provider-comparison.json'), JSON.stringify(results, null, 2));
  console.log('\n--- FINISHED COMPARISON. SAVED TO reports/real-provider-comparison.json ---');
})();
