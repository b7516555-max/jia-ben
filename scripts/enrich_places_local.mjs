#!/usr/bin/env node
/**
 * Jia-ben local, one-shot place enrichment.
 *
 * Safety rules:
 * - dry-run is the default and never writes place data, Firestore, or the CSVs.
 * - --apply writes only a reviewable JSON sync file; it never writes Firestore.
 * - existing address / phone / openingHours values are never overwritten.
 * - verified places are skipped so missing fields remain a human/admin decision.
 *
 * Usage:
 *   node scripts/enrich_places_local.mjs --dry-run
 *   node scripts/enrich_places_local.mjs --dry-run --input path/to/places.json
 *   node scripts/enrich_places_local.mjs --apply --input path/to/places.json --output reports/jia_places_enrichment_sync.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSV_FILES = {
  business: '商業登記(依營業項目別)－餐廳餐館.csv',
  company: '公司登記(依營業項目別)－餐館業.csv'
};
const FIRESTORE_PROJECT = 'letseat-366e9';
const FIRESTORE_COLLECTION = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/artifacts/${FIRESTORE_PROJECT}/public/data/jiaPlaces?pageSize=300`;
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];
const waitMs = 1000;
const OVERPASS_BATCH_SIZE = 12;
let overpassRateLimited = false;
let overpassUnavailable = false;

const args = process.argv.slice(2);
const hasFlag = flag => args.includes(flag);
const argValue = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : ''; };
const mode = hasFlag('--apply') ? 'apply' : 'dry-run';
const inputPath = argValue('--input');
const outputPath = argValue('--output') || path.join(ROOT, 'reports', 'jia_places_enrichment_sync.json');
const maxPlaces = Number(argValue('--max-places') || 0);
const skipOverpass = hasFlag('--skip-overpass');

function clean(value) { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function compact(value) { return clean(value).replace(/[\u3000\s\-‐‑–—_,.．·・、，。/\\()[\]【】「」『』〈〉《》]/g, '').toLowerCase(); }
function normalName(value) {
  return compact(value)
    .replace(/\([^)]*\)|（[^）]*）/g, '')
    .replace(/分店|門市|旗艦店|本店|店$/g, '');
}
function normalizeField(value) {
  return clean(value).replace(/(?<=\d)\s+(?=\d|巷|弄|號|樓|:)/g, '');
}
function isMissing(value) { return value == null || clean(value) === ''; }
function isVerified(place) { return Boolean(place?.isVerified || place?.verifiedOwner || place?.ownerVerified); }
function first(...values) { return values.find(value => !isMissing(value)) || ''; }

function decodeBuffer(buffer) {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  const replacementCount = (utf8.match(/�/g) || []).length;
  if (replacementCount === 0) return { text: utf8.replace(/^\uFEFF/, ''), encoding: 'UTF-8' };
  try { return { text: new TextDecoder('big5', { fatal: false }).decode(buffer), encoding: 'Big5' }; }
  catch (_) { return { text: utf8.replace(/^\uFEFF/, ''), encoding: 'UTF-8 (fallback)' }; }
}

function parseCsvLine(line) {
  const cells = [];
  let cell = '', quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"' && quoted) { cell += '"'; i += 1; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === ',' && !quoted) { cells.push(clean(cell)); cell = ''; continue; }
    cell += ch;
  }
  cells.push(clean(cell));
  return cells;
}

function parseCsv(filePath, kind) {
  const decoded = decodeBuffer(fs.readFileSync(filePath));
  const lines = decoded.text.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines.shift() || '');
  const records = [];
  for (const line of lines) {
    const cells = parseCsvLine(line);
    const row = Object.fromEntries(header.map((key, i) => [key, cells[i] || '']));
    const name = kind === 'business' ? row['商業名稱'] : row['公司名稱'];
    const address = kind === 'business' ? row['商業地址'] : row['公司地址'];
    if (!clean(name) || !clean(address)) continue;
    records.push({
      name: clean(name), address: normalizeField(address),
      businessId: first(row['統一編號']), status: first(row['登記狀態'], row['公司狀態']),
      source: '商工登記開放資料', sourceFile: path.basename(filePath), encoding: decoded.encoding
    });
  }
  return { records, encoding: decoded.encoding, rowCount: records.length };
}

function cityDistrict(place) {
  const text = `${place?.city || ''} ${place?.district || ''} ${place?.address || ''}`;
  const city = (text.match(/(臺北市|台北市|新北市|桃園市|臺中市|台中市|臺南市|台南市|高雄市|基隆市|新竹市|嘉義市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義縣|屏東縣|宜蘭縣|花蓮縣|臺東縣|台東縣|澎湖縣|金門縣|連江縣)/) || [clean(place?.city)])[1] || '';
  const afterCity = city ? text.slice(text.indexOf(city) + city.length) : text;
  const district = (afterCity.match(/^[^縣市]{1,4}(?:區|鄉|鎮|市)/) || [clean(place?.district)])[0] || '';
  return { city: city.replace('臺', '台'), district };
}

function scoreMatch(place, record) {
  const pn = normalName(place?.name || place?.normalizedName);
  const rn = normalName(record.name);
  if (!pn || !rn) return 0;
  let score = pn === rn ? 0.92 : (pn.includes(rn) || rn.includes(pn) ? 0.76 : 0);
  const location = cityDistrict(place);
  if (location.city && record.address.includes(location.city.replace('台', '臺'))) score += 0.05;
  if (location.district && record.address.includes(location.district)) score += 0.04;
  return Math.min(0.99, score);
}

function bestCsvMatch(place, records) {
  return records.map(record => ({ record, score: scoreMatch(place, record) }))
    .filter(item => item.score >= 0.88)
    .sort((a, b) => b.score - a.score)[0] || null;
}

function firestoreValue(value) {
  if (!value) return null;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(firestoreValue);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k, v]) => [k, firestoreValue(v)]));
  return null;
}

async function loadPlaces() {
  if (inputPath) {
    const source = JSON.parse(fs.readFileSync(path.resolve(ROOT, inputPath), 'utf8'));
    const places = Array.isArray(source) ? source : (source.jiaPlaces || source.places || []);
    return { places, source: path.resolve(ROOT, inputPath) };
  }
  const response = await fetch(FIRESTORE_COLLECTION, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Firestore jiaPlaces read failed: HTTP ${response.status}`);
  const payload = await response.json();
  const places = (payload.documents || []).map(document => ({
    jiaPlaceId: document.name.split('/').pop(),
    ...Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => [key, firestoreValue(value)]))
  }));
  return { places, source: `Firestore read-only REST: ${FIRESTORE_COLLECTION}` };
}

function coordinates(place) {
  const location = place?.location || place?.geometry?.location || {};
  const lat = location.lat ?? place?.latitude ?? place?.lat;
  const lng = location.lng ?? place?.longitude ?? place?.lng;
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) ? { lat: Number(lat), lng: Number(lng) } : null;
}

function osmAddress(tags = {}) {
  return normalizeField([tags['addr:city'], tags['addr:district'], tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(''));
}
function nameSimilarity(a, b) {
  const left = normalName(a), right = normalName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.82;
  const shared = [...new Set(left.split(''))].filter(ch => right.includes(ch)).length;
  return shared / Math.max(new Set(left.split('')).size, new Set(right.split('')).size);
}

function elementPoint(element) {
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) ? { lat: Number(lat), lng: Number(lng) } : null;
}
function distanceMeters(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
function buildOverpassQuery(batch) {
  const clauses = batch.map(place => {
    const point = coordinates(place);
    return point ? `nwr(around:120,${point.lat},${point.lng})[amenity~"restaurant|cafe|fast_food|food_court|bar"];` : '';
  }).join('');
  return `[out:json][timeout:45];(${clauses});out center tags;`;
}
function matchOsmCandidate(place, elements) {
  const point = coordinates(place);
  return elements.map(element => {
    const tags = element.tags || {};
    const elementPointValue = elementPoint(element);
    const distance = point && elementPointValue ? distanceMeters(point, elementPointValue) : Infinity;
    return { candidate: { ...tags, _element: element }, score: nameSimilarity(place.name, tags.name), distance };
  }).filter(item => item.candidate.name && item.score >= 0.72 && item.distance <= 150)
    .sort((a, b) => (b.score - a.score) || (a.distance - b.distance))[0] || null;
}
async function fetchOverpassBatch(batch, batchNumber) {
  const query = buildOverpassQuery(batch);
  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await fetch(endpoint, { method: 'POST', body: new URLSearchParams({ data: query }), headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(45_000) });
        if (response.status === 429) { overpassRateLimited = true; console.warn(`⚠️ Overpass ${endpoint} 回應 429，切換備援節點。`); break; }
        if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`);
        const payload = await response.json();
        return payload.elements || [];
      } catch (error) {
        if (attempt === 2) console.warn(`⚠️ Overpass batch ${batchNumber} 在 ${endpoint} 失敗：${error.message}`);
        else await sleep(500 * attempt);
      }
    }
  }
  overpassUnavailable = true;
  return [];
}
async function fetchOverpassMatches(places) {
  const matches = new Map();
  for (let i = 0; i < places.length; i += OVERPASS_BATCH_SIZE) {
    const batch = places.slice(i, i + OVERPASS_BATCH_SIZE);
    const elements = await fetchOverpassBatch(batch, Math.floor(i / OVERPASS_BATCH_SIZE) + 1);
    for (const place of batch) {
      const match = matchOsmCandidate(place, elements);
      if (match) matches.set(place.jiaPlaceId || place.id, match);
    }
    if (overpassUnavailable) break;
    if (i + OVERPASS_BATCH_SIZE < places.length) await sleep(waitMs);
  }
  return matches;
}

function applyCandidate(place, candidate, source, changes) {
  if (!candidate) return;
  const updates = {};
  const address = source === 'OpenStreetMap' ? osmAddress(candidate) : candidate.address;
  const phone = source === 'OpenStreetMap' ? first(candidate.phone, candidate['contact:phone']) : '';
  const hours = source === 'OpenStreetMap' ? candidate.opening_hours : '';
  const website = source === 'OpenStreetMap' ? first(candidate.website, candidate['contact:website']) : '';
  if (isMissing(place.address) && !isMissing(address)) updates.address = normalizeField(address);
  if (source === '商工登記開放資料' && !isMissing(address)) {
    const location = cityDistrict({ address });
    if (isMissing(place.city) && location.city) updates.city = location.city;
    if (isMissing(place.district) && location.district) updates.district = location.district;
  }
  if (isMissing(place.phone) && !isMissing(phone)) updates.phone = normalizeField(phone);
  if (isMissing(place.openingHours) && isMissing(place.opening_hours) && !isMissing(hours)) updates.openingHours = normalizeField(hours);
  if (isMissing(place.website) && !isMissing(website)) updates.website = clean(website);
  if (Object.keys(updates).length) {
    changes.push({ fieldUpdates: updates, source, sourceName: candidate.name || undefined });
    for (const [key, value] of Object.entries(updates)) place[`_enriched_${key}`] = value;
  }
}

async function main() {
  console.log(`Mode: ${mode} (CSV files and Firestore are read-only)`);
  const businessPath = path.join(ROOT, CSV_FILES.business);
  const companyPath = path.join(ROOT, CSV_FILES.company);
  for (const filePath of [businessPath, companyPath]) if (!fs.existsSync(filePath)) throw new Error(`Missing required CSV: ${filePath}`);
  const business = parseCsv(businessPath, 'business');
  const company = parseCsv(companyPath, 'company');
  const loaded = await loadPlaces();
  const places = (maxPlaces > 0 ? loaded.places.slice(0, maxPlaces) : loaded.places).map(place => ({ ...place }));
  const allRegistry = [...business.records, ...company.records];
  const results = [];
  const stats = { totalPlaces: places.length, skippedVerified: 0, csvMatches: 0, overpassQueries: 0, overpassRateLimited: false, overpassUnavailable: false, addressFilled: 0, phoneFilled: 0, openingHoursFilled: 0, websiteFilled: 0, noMatch: 0 };
  const overpassTargets = places.filter(place => !isVerified(place)
    && (isMissing(place.phone) || (isMissing(place.openingHours) && isMissing(place.opening_hours)))
    && coordinates(place));
  let overpassMatches = new Map();
  if (!skipOverpass && overpassTargets.length) {
    console.log(`Querying Overpass in batches of ${OVERPASS_BATCH_SIZE}: ${overpassTargets.length} places`);
    overpassMatches = await fetchOverpassMatches(overpassTargets);
    stats.overpassQueries = Math.ceil(overpassTargets.length / OVERPASS_BATCH_SIZE);
  }
  for (const [index, place] of places.entries()) {
    const missingBefore = { address: isMissing(place.address), phone: isMissing(place.phone), openingHours: isMissing(place.openingHours) && isMissing(place.opening_hours) };
    if (!missingBefore.address && !missingBefore.phone && !missingBefore.openingHours) continue;
    if (isVerified(place)) { stats.skippedVerified += 1; results.push({ id: place.jiaPlaceId || place.id, name: place.name, status: 'SKIPPED_VERIFIED' }); continue; }
    const changes = [];
    const csvMatch = bestCsvMatch(place, allRegistry);
    if (csvMatch) { stats.csvMatches += 1; applyCandidate(place, csvMatch.record, '商工登記開放資料', changes); }
    const osmMatch = overpassMatches.get(place.jiaPlaceId || place.id);
    if (osmMatch) applyCandidate(place, osmMatch.candidate, 'OpenStreetMap', changes);
    const counts = { address: 0, phone: 0, openingHours: 0 };
    for (const change of changes) for (const field of Object.keys(change.fieldUpdates)) if (field in counts) counts[field] += 1;
    stats.addressFilled += counts.address; stats.phoneFilled += counts.phone; stats.openingHoursFilled += counts.openingHours; stats.websiteFilled += changes.reduce((n, c) => n + (c.fieldUpdates.website ? 1 : 0), 0);
    if (changes.length) results.push({ id: place.jiaPlaceId || place.id, name: place.name, changes, before: { address: place.address || '', phone: place.phone || '', openingHours: place.openingHours || place.opening_hours || '' } });
    else stats.noMatch += 1;
    console.log(`[${index + 1}/${places.length}] ${place.name || '(未命名)'}: ${changes.flatMap(change => Object.keys(change.fieldUpdates)).join(', ') || '無安全匹配'}`);
  }
  const report = { generatedAt: new Date().toISOString(), mode, source: loaded.source, csv: { business: { rows: business.rowCount, encoding: business.encoding }, company: { rows: company.rowCount, encoding: company.encoding } }, stats, results };
  stats.overpassRateLimited = overpassRateLimited;
  stats.overpassUnavailable = overpassUnavailable;
  console.log('\n=== Enrichment summary ===');
  console.log(JSON.stringify(stats, null, 2));
  console.log(`CSV files changed: 0 | Firestore writes: 0 | Overpass writes: 0`);
  if (results.length) console.log('\nPreview:');
  for (const result of results.slice(0, 20)) console.log(JSON.stringify(result, null, 2));
  if (mode === 'apply') {
    fs.mkdirSync(path.dirname(path.resolve(ROOT, outputPath)), { recursive: true });
    const resolvedOutput = path.resolve(ROOT, outputPath);
    if (resolvedOutput.endsWith('.js')) {
      const updates = Object.fromEntries(results.filter(result => result.changes?.length).map(result => [result.id, {
        name: result.name,
        fields: Object.assign({}, ...result.changes.map(change => change.fieldUpdates)),
        sources: [...new Set(result.changes.map(change => change.source).filter(Boolean))]
      }]));
      const payload = { generatedAt: report.generatedAt, mode, updates };
      fs.writeFileSync(resolvedOutput, `(function(root){root.JIA_LOCAL_PLACE_ENRICHMENT=${JSON.stringify(payload)};root.applyLocalPlaceEnrichment=function(place){const id=place?.jiaPlaceId||place?.id;const item=root.JIA_LOCAL_PLACE_ENRICHMENT.updates[id];if(!item)return place;return {...place,...item.fields,enrichment:{...(place.enrichment||{}),localBackfill:{fields:Object.keys(item.fields),sources:item.sources,appliedAt:root.JIA_LOCAL_ENRICHMENT_GENERATED_AT||'${report.generatedAt}'}}};};})(typeof window!=='undefined'?window:globalThis);\n`, 'utf8');
    } else {
      fs.writeFileSync(resolvedOutput, JSON.stringify(report, null, 2), 'utf8');
    }
    console.log(`\nWrote reviewable sync file: ${resolvedOutput}`);
  }
}

main().catch(error => { console.error(`❌ ${error.stack || error.message || error}`); process.exitCode = 1; });
