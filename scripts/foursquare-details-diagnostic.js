const fs = require('fs');
const path = require('path');
const rootDir = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const apiKeyMatch = html.match(/apiKey:\s*['"]([^'"]+)['"]/);
const projectIdMatch = html.match(/projectId:\s*['"]([^'"]+)['"]/);
const apiKey = apiKeyMatch ? apiKeyMatch[1] : null;
const projectId = projectIdMatch ? projectIdMatch[1] : null;
const GAS_URL = 'https://script.google.com/macros/s/AKfycbwTg7lmireS-npCAzvDZVPVmI7u5jAFpslg7SNL59Ab3ulLOUr7cPB5wzIaTSyTUJpl/exec';

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

async function getAuthToken() {
  const authRes = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true })
  });
  const auth = await authRes.json();
  return auth.idToken;
}

async function loadPlaces(token) {
  const res = await fetch('https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/(default)/documents/artifacts/' + projectId + '/public/data/jiaPlaces?pageSize=100', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const data = await res.json();
  return (data.documents || []).map(d => ({
    jiaPlaceId: d.name.split('/').pop(),
    ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, dv(v)]))
  }));
}

async function callGasProxyDetails(fsqId) {
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'enrich_place_details',
        provider: 'foursquare',
        fsqId: fsqId
      })
    });
    return await res.json();
  } catch (e) {
    return { status: 'error', error: e.message };
  }
}

(async () => {
  const token = await getAuthToken();
  const jiaPlaces = await loadPlaces(token);

  // Find places with sourceIds.foursquare that lack phone, website, or openingHours
  const candidatePlaces = jiaPlaces.filter(p => {
    return p.sourceIds?.foursquare && (!p.phone || !p.website || !p.openingHours);
  });

  console.log(`Found ${candidatePlaces.length} places with Foursquare ID missing fields.`);
  const testSet = candidatePlaces.slice(0, 5);

  console.log(`=== RUNNING 5-CALL CONTROLLED FOURSQUARE DETAILS DIAGNOSTIC ===`);
  let phoneFound = 0, webFound = 0, hoursFound = 0, addrFound = 0;

  for (let i = 0; i < testSet.length; i++) {
    const p = testSet[i];
    const fsqId = p.sourceIds.foursquare;
    console.log(`\n[${i + 1}/5] Diagnosing: ${p.name} (FSQ ID: ${fsqId})...`);
    const resp = await callGasProxyDetails(fsqId);
    console.log(`Response status: ${resp.status}`);
    
    if (resp.status === 'ok' && resp.data) {
      const d = resp.data;
      const hasPhone = !!d.tel || !!d.phone;
      const hasWeb = !!d.website;
      const hasHours = !!d.hours || !!d.hours_popular;
      const hasAddr = !!d.location?.formatted_address || !!d.location?.address;

      if (hasPhone) phoneFound++;
      if (hasWeb) webFound++;
      if (hasHours) hoursFound++;
      if (hasAddr) addrFound++;

      console.log(`- phone: ${hasPhone ? (d.tel || d.phone) : 'none'}`);
      console.log(`- website: ${hasWeb ? d.website : 'none'}`);
      console.log(`- hours: ${hasHours ? JSON.stringify(d.hours || d.hours_popular).slice(0, 60) : 'none'}`);
      console.log(`- address: ${hasAddr ? (d.location?.formatted_address || d.location?.address) : 'none'}`);
    } else {
      console.log(`Details failed or not returned: ${JSON.stringify(resp)}`);
    }

    await new Promise(r => setTimeout(r, 1200));
  }

  console.log(`\n=== FOURSQUARE DETAILS DIAGNOSTIC VALUE REPORT ===`);
  console.log(`Total Calls: ${testSet.length}`);
  console.log(`Phone coverage: ${phoneFound} / ${testSet.length}`);
  console.log(`Website coverage: ${webFound} / ${testSet.length}`);
  console.log(`OpeningHours coverage: ${hoursFound} / ${testSet.length}`);
  console.log(`Address coverage: ${addrFound} / ${testSet.length}`);
})();
