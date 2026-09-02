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

function ev(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === 'boolean') return { booleanValue: val };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(ev) } };
  if (typeof val === 'object') {
    return { mapValue: { fields: Object.fromEntries(Object.entries(val).map(([k, v]) => [k, ev(v)])) } };
  }
  return { stringValue: String(val) };
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

function normalize(name) {
  return String(name || '').normalize('NFKC').toLowerCase().replace(/[\s\r\n\t\-－_・·,，.。()（）【】\[\]]+/g, '').replace(/台灣|屏東縣|高雄市|台北市|台南市|嘉義市/g, '');
}

(async () => {
  const token = await getAuthToken();
  const [jiaPlaces, feed] = await Promise.all([
    loadCollection('jiaPlaces', token),
    loadCollection('feed', token)
  ]);

  console.log('=== RUNNING HIGH-CONFIDENCE PHOTO ASSOCIATION WRITEBACK ===');
  const feedPhotoMap = new Map();
  feed.forEach(f => {
    const rName = f.restaurantName;
    if (rName) {
      const norm = normalize(rName);
      const photos = Array.isArray(f.photos) && f.photos.length > 0 ? f.photos : (f.photoUrl ? [f.photoUrl] : []);
      const validPhotos = photos.filter(p => p && (p.includes('googleusercontent.com') || (!p.includes('googleapis.com') && !p.includes('staticmap') && !p.includes('placeholder'))));
      if (validPhotos.length > 0) {
        if (!feedPhotoMap.has(norm)) feedPhotoMap.set(norm, []);
        feedPhotoMap.get(norm).push(...validPhotos);
      }
    }
  });

  let recoveredCount = 0;
  for (const p of jiaPlaces) {
    const currentComm = p.communityPhotos || [];
    const normP = normalize(p.name);
    
    // Find exact or high-confidence match
    let matchedPhotos = [];
    if (feedPhotoMap.has(normP)) {
      matchedPhotos = feedPhotoMap.get(normP);
    } else {
      for (const [normF, photos] of feedPhotoMap.entries()) {
        if (normP.length >= 4 && (normP === normF || normP.startsWith(normF) || normF.startsWith(normP))) {
          matchedPhotos.push(...photos);
        }
      }
    }
    matchedPhotos = [...new Set(matchedPhotos)];

    if (currentComm.length === 0 && matchedPhotos.length > 0) {
      console.log(`[Updating communityPhotos] ${p.name} -> +${matchedPhotos.length} photos`);
      const updatePayload = {
        fields: {
          communityPhotos: ev(matchedPhotos),
          updatedAt: ev(new Date().toISOString())
        }
      };

      const patchUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/${projectId}/public/data/jiaPlaces/${p.id}?updateMask.fieldPaths=communityPhotos&updateMask.fieldPaths=updatedAt`;
      const patchRes = await fetch(patchUrl, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token
        },
        body: JSON.stringify(updatePayload)
      });
      if (patchRes.ok) {
        recoveredCount++;
        console.log(`✅ Success for ${p.name}`);
      } else {
        console.error(`❌ Error updating ${p.name}: ${await patchRes.text()}`);
      }
      await new Promise(r => setTimeout(r, 300));
    }
  }

  console.log(`\n=== PHOTO RECOVERY COMPLETED: ${recoveredCount} places updated ===`);
})();
