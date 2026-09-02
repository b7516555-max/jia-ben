/**
 * Taiwan Secondary Physical-Place Verifier Service (src/services/taiwanSecondaryPlaceVerifier.js)
 * 
 * Jia-ben Taiwan Place Intelligence 6.0D
 * 
 * Intersects:
 * 1. Existing Jia-ben Canonical Place & Address/GPS Data
 * 2. MOEA GCIS Verified Open Registry Cache
 * 3. OpenStreetMap / Nominatim & Overpass Physical Evidence
 * 
 * Enforces strict rate limiting (1.1s delay for Nominatim), local caching,
 * multi-signal verification rules, conflict detection, and generic name safety.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const TaiwanAddressNormalizer = require('../utils/taiwanAddressNormalizer.js');

const OSM_CACHE_DIR = path.join(__dirname, '../../private_staging/osm');
const NOMINATIM_CACHE_FILE = path.join(OSM_CACHE_DIR, 'nominatim_cache.json');
const OVERPASS_CACHE_FILE = path.join(OSM_CACHE_DIR, 'overpass_cache.json');

const GENERIC_NAMES = [
  '大同', '早餐店', '老地方', '牛肉麵', '咖啡店', '小吃店', '食堂', '餐廳', '麵店', '壽司', '熱炒', '冰店', '飲料店', '鹽酥雞', '便當'
];

let nominatimCache = {};
let overpassCache = {};
let lastRequestTime = 0;
let requestStats = {
  nominatimNetworkCalls: 0,
  nominatimCacheHits: 0,
  overpassNetworkCalls: 0,
  overpassCacheHits: 0,
  errors: 0,
  rateLimitHits: 0
};

function initCaches() {
  if (!fs.existsSync(OSM_CACHE_DIR)) {
    fs.mkdirSync(OSM_CACHE_DIR, { recursive: true });
  }
  if (fs.existsSync(NOMINATIM_CACHE_FILE)) {
    try {
      nominatimCache = JSON.parse(fs.readFileSync(NOMINATIM_CACHE_FILE, 'utf-8'));
    } catch(e) {
      nominatimCache = {};
    }
  }
  if (fs.existsSync(OVERPASS_CACHE_FILE)) {
    try {
      overpassCache = JSON.parse(fs.readFileSync(OVERPASS_CACHE_FILE, 'utf-8'));
    } catch(e) {
      overpassCache = {};
    }
  }
}

function saveCaches() {
  if (!fs.existsSync(OSM_CACHE_DIR)) {
    fs.mkdirSync(OSM_CACHE_DIR, { recursive: true });
  }
  fs.writeFileSync(NOMINATIM_CACHE_FILE, JSON.stringify(nominatimCache, null, 2));
  fs.writeFileSync(OVERPASS_CACHE_FILE, JSON.stringify(overpassCache, null, 2));
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  if (!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) {
    return null;
  }
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function rateLimitedFetch(url, headers = {}) {
  const now = Date.now();
  const timeSinceLast = now - lastRequestTime;
  if (timeSinceLast < 1100) {
    await sleep(1100 - timeSinceLast);
  }
  lastRequestTime = Date.now();

  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 429) {
          requestStats.rateLimitHits++;
          return reject(new Error('HTTP_429_RATE_LIMIT'));
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch(e) {
            reject(new Error(`JSON_PARSE_ERROR: ${data.slice(0, 100)}`));
          }
        } else {
          requestStats.errors++;
          reject(new Error(`HTTP_ERROR_${res.statusCode}: ${data.slice(0, 100)}`));
        }
      });
    });
    req.on('error', (err) => {
      requestStats.errors++;
      reject(err);
    });
    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error('TIMEOUT'));
    });
  });
}

/**
 * Query Nominatim Search API
 */
async function queryNominatim(queryString, options = {}) {
  initCaches();
  const cacheKey = queryString.trim().toLowerCase();
  if (nominatimCache[cacheKey]) {
    requestStats.nominatimCacheHits++;
    return nominatimCache[cacheKey];
  }

  const encoded = encodeURIComponent(queryString.trim());
  const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&addressdetails=1&countrycodes=tw&limit=5`;
  const headers = {
    'User-Agent': 'JiaBenTaiwanPlaceVerifier/6.0D (contact: support@jia-ben.local)',
    'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8'
  };

  try {
    requestStats.nominatimNetworkCalls++;
    const results = await rateLimitedFetch(url, headers);
    nominatimCache[cacheKey] = results;
    saveCaches();
    return results;
  } catch (err) {
    console.warn(`[Nominatim] Query failed for "${queryString}":`, err.message);
    return [];
  }
}

/**
 * Extract clean doorplate number (e.g. 870號, 163巷1號)
 */
function extractDoorplate(addressStr) {
  if (!addressStr) return '';
  const clean = TaiwanAddressNormalizer.standardizeChars(addressStr)
    .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    .replace(/\s+/g, '');
  
  // Look for 巷弄號
  const match = clean.match(/((?:\d+巷)?(?:\d+弄)?\d+號(?:之\d+)?)/);
  return match ? match[1] : '';
}

const TAIWAN_LOCATIONS = [
  '台北', '新北', '基隆', '桃園', '新竹', '苗栗', '台中', '彰化', '南投', '雲林',
  '嘉義', '台南', '高雄', '屏東', '宜蘭', '花蓮', '台東', '澎湖', '金門', '連江',
  '和平', '三民', '苓雅', '鹽埕', '左營', '前金', '新興', '大安', '信義', '中山', '中正', '文山', '潮州', '東港', '里港'
];

/**
 * Extract clean base name without branch suffix
 */
function parseRestaurantName(rawName) {
  const norm = TaiwanAddressNormalizer.standardizeChars(rawName || '').trim();
  
  const m1 = norm.match(/^(.+?)[(（]([^\s()（）]+(?:分店|直營店|總店|旗艦店|門市|店))[)）]$/);
  if (m1) return { rawName: norm, baseName: m1[1].trim(), branchName: m1[2].trim(), hasBranchSuffix: true };

  const m2 = norm.match(/^(.+?)[\-_/／\s]+([^\s\-_/／]+(?:分店|直營店|總店|旗艦店|門市|店))$/);
  if (m2) return { rawName: norm, baseName: m2[1].trim(), branchName: m2[2].trim(), hasBranchSuffix: true };

  for (const loc of TAIWAN_LOCATIONS) {
    for (const suffix of ['分店', '直營店', '總店', '旗艦店', '門市', '店']) {
      const target = loc + suffix;
      if (norm.endsWith(target) && norm.length > target.length + 1) {
        return {
          rawName: norm,
          baseName: norm.slice(0, norm.length - target.length).trim(),
          branchName: target,
          hasBranchSuffix: true
        };
      }
    }
  }

  return {
    rawName: norm,
    baseName: norm,
    branchName: '',
    hasBranchSuffix: false
  };
}

/**
 * Core Evaluation: Combines JiaPlace, MOEA Candidate, and OSM Results
 */
function evaluateSecondaryPlaceMatch(jiaPlace, moeaCandidate, osmCandidate) {
  const matchSignals = [];
  const evidenceSources = ['JIA_BEN_EXISTING'];
  let confidence = 0.0;
  let isConflict = false;
  let conflictReason = '';

  const nameInfo = parseRestaurantName(jiaPlace.name);
  const jiaNormAddr = TaiwanAddressNormalizer.normalizeTaiwanAddress(jiaPlace.address, jiaPlace.city);
  const jiaDoorplate = extractDoorplate(jiaPlace.address || '');

  // 1. MOEA Signals
  let hasMoea = false;
  let moeaDoorplate = '';
  if (moeaCandidate) {
    hasMoea = true;
    evidenceSources.push('MOEA_GCIS');
    moeaDoorplate = extractDoorplate(moeaCandidate.address || '');
    
    // Check MOEA Name
    const moeaNameInfo = parseRestaurantName(moeaCandidate.officialName);
    const isExactName = (nameInfo.baseName === moeaNameInfo.baseName || nameInfo.rawName === moeaNameInfo.rawName);
    const isCompatibleName = isExactName || (nameInfo.baseName.length >= 3 && (moeaCandidate.officialName.includes(nameInfo.baseName) || nameInfo.baseName.includes(moeaCandidate.officialName)));

    if (isExactName) {
      confidence += 0.40;
      matchSignals.push(`MOEA Exact Name: ${moeaCandidate.officialName}`);
    } else if (isCompatibleName) {
      confidence += 0.30;
      matchSignals.push(`MOEA Compatible Name: ${moeaCandidate.officialName}`);
    } else {
      // Incompatible name
      confidence -= 0.30;
      matchSignals.push(`MOEA Incompatible Name: ${moeaCandidate.officialName} vs ${nameInfo.rawName}`);
    }

    // Check MOEA Address
    const moeaNormAddr = TaiwanAddressNormalizer.normalizeTaiwanAddress(moeaCandidate.address);
    if (jiaNormAddr.city && moeaNormAddr.city) {
      if (jiaNormAddr.city === moeaNormAddr.city) {
        confidence += 0.10;
        matchSignals.push(`MOEA Same City: ${jiaNormAddr.city}`);
      } else {
        isConflict = true;
        matchSignals.push(`CONFLICT: Different Cities (${jiaNormAddr.city} vs ${moeaNormAddr.city})`);
      }
    }
    if (jiaNormAddr.district && moeaNormAddr.district) {
      if (jiaNormAddr.district === moeaNormAddr.district) {
        confidence += 0.10;
        matchSignals.push(`MOEA Same District: ${jiaNormAddr.district}`);
      } else {
        // Different districts (e.g. 潮州鎮 vs 里港鄉)
        isConflict = true;
        matchSignals.push(`CONFLICT: Different Districts (${jiaNormAddr.district} vs ${moeaNormAddr.district})`);
      }
    }
    if (jiaDoorplate && moeaDoorplate && jiaDoorplate === moeaDoorplate) {
      confidence += 0.25;
      matchSignals.push(`MOEA Exact Doorplate: ${jiaDoorplate}`);
    }
  }

  // 2. OSM Signals
  let hasOsm = false;
  let osmDoorplate = '';
  let osmLat = null;
  let osmLon = null;

  if (osmCandidate) {
    hasOsm = true;
    evidenceSources.push('OPENSTREETMAP');
    osmLat = parseFloat(osmCandidate.lat);
    osmLon = parseFloat(osmCandidate.lon);
    const osmDisplay = osmCandidate.display_name || '';
    osmDoorplate = extractDoorplate(osmDisplay);

    const osmName = osmCandidate.name || osmCandidate.display_name?.split(',')[0] || '';
    const osmNameInfo = parseRestaurantName(osmName);

    if (nameInfo.baseName === osmNameInfo.baseName || nameInfo.rawName === osmNameInfo.rawName) {
      confidence += 0.25;
      matchSignals.push(`OSM Compatible Name: ${osmName}`);
    }

    if (jiaDoorplate && (osmDisplay.includes(jiaDoorplate) || (osmDoorplate && jiaDoorplate === osmDoorplate))) {
      confidence += 0.20;
      matchSignals.push(`OSM Verified Doorplate: ${jiaDoorplate}`);
    }

    // Check GPS Proximity
    if (jiaPlace.location && Number.isFinite(jiaPlace.location.lat) && Number.isFinite(jiaPlace.location.lng)) {
      const dist = distanceMeters(jiaPlace.location.lat, jiaPlace.location.lng, osmLat, osmLon);
      if (dist !== null) {
        if (dist <= 30) {
          confidence += 0.20;
          matchSignals.push(`OSM Very Close GPS (${dist.toFixed(0)}m <= 30m)`);
        } else if (dist <= 75) {
          confidence += 0.15;
          matchSignals.push(`OSM Strong GPS (${dist.toFixed(0)}m <= 75m)`);
        } else if (dist <= 150) {
          confidence += 0.08;
          matchSignals.push(`OSM Supporting GPS (${dist.toFixed(0)}m <= 150m)`);
        } else if (dist > 300) {
          isConflict = true;
          conflictReason = `OSM location is >300m away (${dist.toFixed(0)}m)`;
          matchSignals.push(`CONFLICT: GPS distance > 300m (${dist.toFixed(0)}m)`);
        }
      }
    }
  }

  // Generic name protection
  const isGeneric = GENERIC_NAMES.some(g => nameInfo.baseName === g || nameInfo.rawName === g);
  if (isGeneric && !jiaDoorplate) {
    confidence = Math.min(confidence, 0.60);
    matchSignals.push('GENERIC_NAME_GUARD: Name is generic and lacks exact doorplate');
  }

  // Cap confidence if only Name + City exists
  if (!jiaDoorplate && !hasOsm) {
    confidence = Math.min(confidence, 0.88);
  }

  confidence = Math.min(1.0, Math.round(confidence * 1000) / 1000);

  // Classification
  let decision = 'NO_MATCH';
  if (isConflict) {
    decision = 'CONFLICT';
  } else if (confidence >= 0.93 && evidenceSources.length >= 2) {
    decision = 'VERIFIED_PHYSICAL_PLACE';
  } else if (confidence >= 0.85) {
    decision = 'PROBABLE_MATCH';
  } else if (confidence >= 0.70) {
    decision = 'NEEDS_REVIEW';
  }

  return {
    confidence,
    decision,
    matchSignals,
    evidenceSources,
    isConflict,
    conflictReason,
    doorplate: jiaDoorplate || moeaDoorplate || osmDoorplate
  };
}

module.exports = {
  queryNominatim,
  distanceMeters,
  extractDoorplate,
  parseRestaurantName,
  evaluateSecondaryPlaceMatch,
  requestStats,
  initCaches,
  saveCaches,
  GENERIC_NAMES
};
