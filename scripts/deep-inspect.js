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

async function getAuthToken() {
  const authRes = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true })
  });
  const auth = await authRes.json();
  return auth.idToken;
}

async function loadCollection(collectionName, token) {
  const res = await fetch('https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/(default)/documents/artifacts/' + projectId + '/public/data/' + collectionName + '?pageSize=300', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const data = await res.json();
  return (data.documents || []).map(d => ({
    id: d.name.split('/').pop(),
    ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, dv(v)]))
  }));
}

(async () => {
  const token = await getAuthToken();
  const [jiaPlaces, restaurants, feed] = await Promise.all([
    loadCollection('jiaPlaces', token),
    loadCollection('restaurants', token),
    loadCollection('feed', token)
  ]);

  console.log('--- Inspecting Raw Data ---');
  restaurants.slice(0, 10).forEach(r => {
    console.log(`[Restaurant] name: ${r.name}, photoUrl: ${r.photoUrl ? r.photoUrl.slice(0, 40) : 'none'}, addr: ${r.address || r.mapLink || 'none'}`);
  });

  feed.slice(0, 10).forEach(f => {
    console.log(`[Feed] resName: ${f.restaurantName}, photoUrl: ${f.photoUrl ? f.photoUrl.slice(0, 40) : 'none'}, photos: ${Array.isArray(f.photos) ? f.photos.length : 0}`);
  });

  jiaPlaces.slice(0, 10).forEach(p => {
    console.log(`[jiaPlace] name: ${p.name}, photos: ${p.photos?.length || 0}, commPhotos: ${p.communityPhotos?.length || 0}, sourceIds: ${JSON.stringify(p.sourceIds || {})}`);
  });
})();
