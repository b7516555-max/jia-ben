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
  const [jiaPlaces, restaurants, feed, parties] = await Promise.all([
    loadCollection('jiaPlaces', token),
    loadCollection('restaurants', token),
    loadCollection('feed', token),
    loadCollection('party', token)
  ]);

  console.log('=== INTERNAL DATA & PHOTO AUDIT ===');
  console.log(`jiaPlaces count: ${jiaPlaces.length}`);
  console.log(`restaurants count: ${restaurants.length}`);
  console.log(`feed count: ${feed.length}`);
  console.log(`parties count: ${parties.length}`);

  // 1. Audit photos
  let placesWithCover = 0;
  let placesWithCommunityPhotos = 0;
  let placesWithNoPhoto = 0;

  jiaPlaces.forEach(p => {
    if (p.coverPhoto) placesWithCover++;
    if (p.communityPhotos && p.communityPhotos.length > 0) placesWithCommunityPhotos++;
    if (!p.coverPhoto && (!p.communityPhotos || p.communityPhotos.length === 0)) placesWithNoPhoto++;
  });

  console.log(`\njiaPlaces current photo state:`);
  console.log(`- coverPhoto: ${placesWithCover}/52`);
  console.log(`- communityPhotos: ${placesWithCommunityPhotos}/52`);
  console.log(`- No real photo (showing placeholder): ${placesWithNoPhoto}/52`);

  // Check recoverable photos in restaurants / feed
  const nameToRestaurantMap = new Map();
  restaurants.forEach(r => {
    if (r.name && r.photoUrl) {
      if (!nameToRestaurantMap.has(r.name)) nameToRestaurantMap.set(r.name, []);
      nameToRestaurantMap.get(r.name).push(r.photoUrl);
    }
  });

  const nameToFeedMap = new Map();
  feed.forEach(f => {
    const rName = f.restaurantName;
    if (rName) {
      const photos = Array.isArray(f.photos) && f.photos.length > 0 ? f.photos : (f.photoUrl ? [f.photoUrl] : []);
      if (photos.length > 0) {
        if (!nameToFeedMap.has(rName)) nameToFeedMap.set(rName, []);
        nameToFeedMap.get(rName).push(...photos);
      }
    }
  });

  console.log('\n--- Recoverable Photos Analysis ---');
  let recoverableCount = 0;
  jiaPlaces.forEach(p => {
    const hasPhoto = p.coverPhoto || (p.communityPhotos && p.communityPhotos.length > 0);
    const rPhotos = nameToRestaurantMap.get(p.name) || [];
    const fPhotos = nameToFeedMap.get(p.name) || [];
    const allFound = [...new Set([...rPhotos, ...fPhotos])].filter(url => {
      return url && !url.includes('googleapis.com') && !url.includes('staticmap') && !url.includes('place-placeholder');
    });

    if (!hasPhoto && allFound.length > 0) {
      recoverableCount++;
      console.log(`[Recoverable Photo] ${p.name} -> found ${allFound.length} photos: ${allFound[0].slice(0, 50)}...`);
    }
  });
  console.log(`Total jiaPlaces without photo that can recover from legacy/feed: ${recoverableCount}`);

  // 2. Audit place data (address, phone, website, openingHours)
  let addrCount = 0, phoneCount = 0, webCount = 0, hoursCount = 0;
  jiaPlaces.forEach(p => {
    if (p.address) addrCount++;
    if (p.phone) phoneCount++;
    if (p.website) webCount++;
    if (p.openingHours) hoursCount++;
  });

  console.log(`\njiaPlaces current field coverage:`);
  console.log(`- address: ${addrCount}/52`);
  console.log(`- phone: ${phoneCount}/52`);
  console.log(`- website: ${webCount}/52`);
  console.log(`- openingHours: ${hoursCount}/52`);

  // Check recoverable fields in legacy restaurants collection
  let recoverableAddr = 0, recoverablePhone = 0, recoverableWeb = 0, recoverableHours = 0;
  jiaPlaces.forEach(p => {
    const matchedR = restaurants.filter(r => r.name === p.name || r.jiaPlaceId === p.jiaPlaceId);
    if (matchedR.length > 0) {
      const r = matchedR[0];
      if (!p.address && (r.address || (r.mapLink && !r.mapLink.startsWith('http')))) {
        recoverableAddr++;
        console.log(`[Recoverable Address] ${p.name} -> ${r.address || r.mapLink}`);
      }
      if (!p.phone && r.phone) {
        recoverablePhone++;
        console.log(`[Recoverable Phone] ${p.name} -> ${r.phone}`);
      }
      if (!p.website && r.website) {
        recoverableWeb++;
      }
      if (!p.openingHours && (r.hours || r.openingHours)) {
        recoverableHours++;
        console.log(`[Recoverable Hours] ${p.name} -> ${r.hours || r.openingHours}`);
      }
    }
  });

  console.log(`\nRecoverable from legacy restaurants:`);
  console.log(`- address: +${recoverableAddr}`);
  console.log(`- phone: +${recoverablePhone}`);
  console.log(`- website: +${recoverableWeb}`);
  console.log(`- openingHours: +${recoverableHours}`);
})();
