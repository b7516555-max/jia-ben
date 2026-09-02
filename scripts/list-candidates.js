const fs = require('fs');
const path = require('path');
const rootDir = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const apiKeyMatch = html.match(/apiKey:\s*['"]([^'"]+)['"]/);
const projectIdMatch = html.match(/projectId:\s*['"]([^'"]+)['"]/);
const apiKey = apiKeyMatch ? apiKeyMatch[1] : null;
const projectId = projectIdMatch ? projectIdMatch[1] : null;

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

(async () => {
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
  const places = (data.documents || []).map(d => ({
    jiaPlaceId: d.name.split('/').pop(),
    ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, dv(v)]))
  }));

  console.log('Total places:', places.length);
  places.forEach((p, idx) => {
    console.log(`${idx + 1}. [${p.name}] (City: ${p.city || '未填'}) - GPS: (${p.location?.lat}, ${p.location?.lng}) - Addr: "${p.address || ''}" - Phone: "${p.phone || ''}"`);
  });
})();
