const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const apiKey = html.match(/apiKey:\s*["']([^"']+)["']/)?.[1];
const projectId = html.match(/projectId:\s*["']([^"']+)["']/)?.[1];
const gasUrl = html.match(/const GAS_API_URL = ["']([^"']+)["']/)?.[1];
if (!apiKey || !projectId) throw new Error('Firebase configuration not found');

function decodeValue(value) {
    if (!value || typeof value !== 'object') return value;
    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return value.doubleValue;
    if ('booleanValue' in value) return value.booleanValue;
    if ('timestampValue' in value) return value.timestampValue;
    if ('nullValue' in value) return null;
    if ('geoPointValue' in value) return value.geoPointValue;
    if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
    if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
    return null;
}

function decodeFields(fields) {
    return Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, decodeValue(value)]));
}

async function firebaseToken() {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true })
    });
    if (!response.ok) throw new Error(`Anonymous Firebase auth failed: ${response.status}`);
    return (await response.json()).idToken;
}

async function listCollection(token, collection) {
    const result = [];
    let pageToken = '';
    do {
        const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/${projectId}/public/data/${collection}`;
        const url = `${base}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (response.status === 404) return result;
        if (!response.ok) throw new Error(`Firestore ${collection} read failed: ${response.status}`);
        const payload = await response.json();
        for (const document of payload.documents || []) {
            result.push({ id: document.name.split('/').pop(), ...decodeFields(document.fields) });
        }
        pageToken = payload.nextPageToken || '';
    } while (pageToken);
    return result;
}

async function readSheet(sheetName) {
    if (!gasUrl) return [];
    const response = await fetch(`${gasUrl}?action=read&sheetName=${encodeURIComponent(sheetName)}`);
    if (!response.ok) throw new Error(`GAS ${sheetName} read failed: ${response.status}`);
    const payload = await response.json();
    return Array.isArray(payload) ? payload : [];
}

function text(value) { return String(value || '').trim(); }
function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
function normalizeName(value) {
    return text(value).normalize('NFKC').toLowerCase().replace(/[\s\-－_・·,，.。()（）【】\[\]]+/g, '');
}
function normalizePhone(value) { return text(value).replace(/[^\d+]/g, ''); }
function distanceMeters(a, b) {
    if (![a.lat, a.lng, b.lat, b.lng].every(Number.isFinite)) return Infinity;
    const rad = degree => degree * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const q = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}
function similarity(a, b) {
    a = normalizeName(a); b = normalizeName(b);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length);
    const left = new Set([...a]);
    const right = new Set([...b]);
    const intersection = [...left].filter(char => right.has(char)).length;
    return (2 * intersection) / (left.size + right.size || 1);
}
function meaningfulCity(value) {
    const city = text(value);
    return city && city !== '未分類' ? city : '';
}

function candidate(source, row, kind) {
    const name = text(row.name || row.restaurantName || row.restaurant || row.placeName);
    if (!name || /展示資料|今天吃什麼|附近好店/.test(name)) return null;
    const placeId = text(row.placeId || row.place_id || row.googlePlaceId || row.google_place_id);
    const lat = number(row.lat ?? row.latitude ?? row.location?.lat);
    const lng = number(row.lng ?? row.longitude ?? row.location?.lng);
    return {
        source, kind, sourceDocId: text(row.id), name, normalizedName: normalizeName(name),
        address: text(row.address || row.formatted_address || row.locationAddress), city: text(row.city),
        district: text(row.district), country: text(row.country || '台灣'), lat, lng,
        category: text(row.category), phone: text(row.phone || row.formatted_phone_number),
        website: text(row.website), openingHours: row.openingHours || row.hours || null,
        legacyGooglePlaceId: placeId && !placeId.startsWith('osm:') ? placeId : '',
        osmId: placeId.startsWith('osm:') ? placeId.slice(4) : '',
        mapLink: text(row.mapLink || row.url), rating: number(row.rating),
        photos: Array.isArray(row.photos) ? row.photos.filter(Boolean) : (row.photoUrl ? [row.photoUrl] : []),
        creator: text(row.creator), group: text(row.group), raw: row
    };
}

function matchReason(a, b) {
    if (a.legacyGooglePlaceId && a.legacyGooglePlaceId === b.legacyGooglePlaceId) return 'same_legacy_google_place_id';
    if (a.osmId && a.osmId === b.osmId) return 'same_osm_id';
    const phoneMatch = normalizePhone(a.phone) && normalizePhone(a.phone) === normalizePhone(b.phone);
    const nameScore = similarity(a.name, b.name);
    const distance = distanceMeters(a, b);
    if (phoneMatch && nameScore >= 0.55) return 'same_phone_and_similar_name';
    if (distance <= 100 && nameScore >= 0.72) return 'within_100m_and_similar_name';
    const cityA = meaningfulCity(a.city), cityB = meaningfulCity(b.city);
    if (nameScore >= 0.92 && cityA && cityB && cityA === cityB) return 'same_city_and_high_name_similarity';
    if (nameScore === 1 && (!cityA || !cityB)) return 'exact_name_with_missing_or_unclassified_city';
    return '';
}
function samePlace(a, b) { return Boolean(matchReason(a, b)); }

function merge(target, incoming) {
    const fields = ['address', 'city', 'district', 'country', 'category', 'phone', 'website', 'openingHours', 'legacyGooglePlaceId', 'osmId', 'mapLink'];
    for (const field of fields) if (!target[field] && incoming[field]) target[field] = incoming[field];
    if (!Number.isFinite(target.lat) && Number.isFinite(incoming.lat)) target.lat = incoming.lat;
    if (!Number.isFinite(target.lng) && Number.isFinite(incoming.lng)) target.lng = incoming.lng;
    target.photos = [...new Set([...(target.photos || []), ...(incoming.photos || [])])];
    target.sources.push({ source: incoming.source, kind: incoming.kind, id: incoming.sourceDocId });
    target.reviewCount += incoming.kind === 'feed' ? 1 : 0;
    target.favoriteCount += incoming.kind === 'restaurant' ? 1 : 0;
    return target;
}

(async () => {
    const token = await firebaseToken();
    const collections = ['restaurants', 'feed', 'parties', 'chat', 'config'];
    const firebase = {};
    for (const name of collections) firebase[name] = await listCollection(token, name);
    const sheets = { Restaurants: await readSheet('Restaurants'), Feed: await readSheet('Feed') };

    const candidates = [];
    const pushRows = (source, kind, rows) => rows.forEach(row => {
        const item = candidate(source, row, kind);
        if (item) candidates.push(item);
    });
    pushRows('firebase', 'restaurant', firebase.restaurants);
    pushRows('firebase', 'feed', firebase.feed);
    pushRows('firebase', 'party', firebase.parties.map(item => ({ ...item, name: item.restaurantName || item.locationName || '' })));
    pushRows('gas_sheet', 'restaurant', sheets.Restaurants);
    pushRows('gas_sheet', 'feed', sheets.Feed);

    const merged = [];
    const mergeAudit = [];
    for (const item of candidates) {
        const existing = merged.find(place => samePlace(place, item));
        if (existing) {
            const reason = matchReason(existing, item);
            const before = JSON.parse(JSON.stringify(existing));
            merge(existing, item);
            mergeAudit.push({ name: existing.name, reason,
                canonicalSource: before.sources[0], incomingSource: { source: item.source, kind: item.kind, id: item.sourceDocId },
                originalRecords: [before, item].map(row => ({ source: row.sources?.[0] || { source: row.source, kind: row.kind, id: row.sourceDocId }, name: row.name, city: row.city, district: row.district, address: row.address, gps: Number.isFinite(row.lat) && Number.isFinite(row.lng) ? { lat: row.lat, lng: row.lng } : null, legacyGooglePlaceId: row.legacyGooglePlaceId || '' })),
                canonicalAfterMerge: { name: existing.name, city: existing.city, district: existing.district, address: existing.address, gps: Number.isFinite(existing.lat) && Number.isFinite(existing.lng) ? { lat: existing.lat, lng: existing.lng } : null, legacyGooglePlaceId: existing.legacyGooglePlaceId || '', sources: existing.sources },
                mergePolicy: 'Keep canonical record; fill missing scalars; union photos/source refs; accumulate counters.' });
        }
        else merged.push({ ...item, sources: [{ source: item.source, kind: item.kind, id: item.sourceDocId }], reviewCount: item.kind === 'feed' ? 1 : 0, favoriteCount: item.kind === 'restaurant' ? 1 : 0 });
    }

    const eligible = merged.filter(item => item.legacyGooglePlaceId || item.address || (Number.isFinite(item.lat) && Number.isFinite(item.lng)) || item.city);
    const report = {
        generatedAt: new Date().toISOString(), mode: 'dry-run', projectId,
        scanned: {
            firebase: Object.fromEntries(Object.entries(firebase).map(([key, value]) => [key, value.length])),
            gasSheets: Object.fromEntries(Object.entries(sheets).map(([key, value]) => [key, value.length])),
            totalRecords: Object.values(firebase).reduce((sum, rows) => sum + rows.length, 0) + Object.values(sheets).reduce((sum, rows) => sum + rows.length, 0)
        },
        candidates: candidates.length,
        withGooglePlaceId: candidates.filter(item => item.legacyGooglePlaceId).length,
        withGps: candidates.filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng)).length,
        nameOnly: candidates.filter(item => !item.legacyGooglePlaceId && !item.address && !item.city && !(Number.isFinite(item.lat) && Number.isFinite(item.lng))).length,
        duplicatesMerged: candidates.length - merged.length,
        uniquePlaces: merged.length,
        eligibleForMigration: eligible.length,
        notEligibleYet: merged.length - eligible.length,
        cityValues: Object.fromEntries([...new Set(eligible.map(item => item.city || '(blank)'))].sort().map(city => [city, eligible.filter(item => (item.city || '(blank)') === city).length])),
        auditMergeCount: mergeAudit.length,
        sample: eligible.slice(0, 20).map(item => ({ name: item.name, city: item.city, hasGps: Number.isFinite(item.lat) && Number.isFinite(item.lng), hasGooglePlaceId: Boolean(item.legacyGooglePlaceId), sources: item.sources }))
    };
    const outDir = path.join(root, 'reports');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'migration-dry-run.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(outDir, 'migration-plan.json'), JSON.stringify(eligible, null, 2));
    const correctedRows = mergeAudit.filter(item => item.reason === 'exact_name_with_missing_or_unclassified_city' && item.originalRecords.some(row => row.city === '未分類'));
    const correctedGroups = [...new Set(correctedRows.map(item => item.name))].map(name => ({ name, mergeEvents: correctedRows.filter(item => item.name === name) }));
    fs.writeFileSync(path.join(outDir, 'migration-audit.json'), JSON.stringify({ generatedAt: report.generatedAt, baseline: 52, allMerges: mergeAudit, correctedDuplicateGroupCount: correctedGroups.length, correctedDuplicateGroups: correctedGroups }, null, 2));
    console.log(JSON.stringify(report, null, 2));
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
