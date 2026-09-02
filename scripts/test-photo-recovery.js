const fs = require('fs');
const path = require('path');
const rootDir = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const apiKeyMatch = html.match(/apiKey:\s*['"]([^'"]+)['"]/);
const projectIdMatch = html.match(/projectId:\s*['"]([^'"]+)['"]/);
const apiKey = apiKeyMatch ? apiKeyMatch[1] : null;
const projectId = projectIdMatch ? projectIdMatch[1] : null;

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

  console.log('=== FUZZY & NORMALIZED PHOTO RECOVERY MATCHING ===');

  function normalize(name) {
    return String(name || '').normalize('NFKC').toLowerCase().replace(/[\s\r\n\t\-－_・·,，.。()（）【】\[\]]+/g, '').replace(/台灣|屏東縣|高雄市|台北市|台南市|嘉義市/g, '');
  }

  // Build feed photo map by normalized restaurantName
  const feedPhotoMap = new Map();
  feed.forEach(f => {
    const rName = f.restaurantName;
    if (rName) {
      const norm = normalize(rName);
      const photos = Array.isArray(f.photos) && f.photos.length > 0 ? f.photos : (f.photoUrl ? [f.photoUrl] : []);
      const validPhotos = photos.filter(p => p && !p.includes('googleapis.com') && !p.includes('staticmap') && !p.includes('placeholder'));
      if (validPhotos.length > 0) {
        if (!feedPhotoMap.has(norm)) feedPhotoMap.set(norm, []);
        feedPhotoMap.get(norm).push(...validPhotos);
      }
    }
  });

  console.log(`Unique normalized feed places with valid photos: ${feedPhotoMap.size}`);

  let newRecoverable = 0;
  jiaPlaces.forEach(p => {
    const currentComm = p.communityPhotos || [];
    const normP = normalize(p.name);
    
    // Check if matching in feed
    let matchedPhotos = [];
    for (const [normF, photos] of feedPhotoMap.entries()) {
      if (normP === normF || (normP.length > 3 && (normP.includes(normF) || normF.includes(normP)))) {
        matchedPhotos.push(...photos);
      }
    }
    matchedPhotos = [...new Set(matchedPhotos)];

    if (currentComm.length === 0 && matchedPhotos.length > 0) {
      newRecoverable++;
      console.log(`[Recoverable Photo] ${p.name} (norm: ${normP}) -> ${matchedPhotos.length} photos`);
    }
  });

  console.log(`Total jiaPlaces that can recover photos: ${newRecoverable}`);
})();
