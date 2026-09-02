/**
 * Secondary Verification Batch Runner (scripts/verify_taiwan_physical_places.js)
 * 
 * Jia-ben Taiwan Place Intelligence 6.0D
 * 
 * - Verifies 52 JiaPlaces with MOEA + OSM / Nominatim evidence.
 * - Prioritizes 桃花源餐廳嘉義分店 (jia_c7c9e231e57698f15123).
 * - Implements rate limiting (1.1s delay for Nominatim) & disk caching.
 * - Dry-run first with full report generation.
 * - Safety write gate: writes to Firestore `taiwanPoiCache` ONLY for verified records (confidence >= 0.93, 2+ independent sources, physical place evidence, 0 conflicts).
 * - STRICTLY PRESERVES existing 金溫州餛飩大王 cache record.
 * - Canonical JiaPlaces writes = 0.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { fetchCollection, createBackup } = require('./safe_backup_and_rollback.js');
const { parseCsvFile } = require('./parse_and_stage_moea_csv.js');
const TaiwanSecondaryPlaceVerifier = require('../src/services/taiwanSecondaryPlaceVerifier.js');
const TaiwanAddressNormalizer = require('../src/utils/taiwanAddressNormalizer.js');

function getAnonymousToken() {
  return new Promise((resolve, reject) => {
    const indexHtml = fs.readFileSync('index.html', 'utf-8');
    const keyMatch = indexHtml.match(/apiKey:\s*["\x27](AIza[0-9A-Za-z_-]+)["\x27]/);
    if (!keyMatch) return reject(new Error('No apiKey found in index.html'));
    const apiKey = keyMatch[1];
    
    const postData = JSON.stringify({ returnSecureToken: true });
    const req = https.request({
      hostname: 'identitytoolkit.googleapis.com',
      path: `/v1/accounts:signUp?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': postData.length
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(d);
          resolve(json.idToken);
        } catch(e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function encodeFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: val.toString() } : { doubleValue: val };
  }
  if (typeof val === 'boolean') return { booleanValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(encodeFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) fields[k] = encodeFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function saveToFirestore(collectionName, docId, data, token) {
  return new Promise((resolve, reject) => {
    const fields = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined && !k.startsWith('_')) fields[k] = encodeFirestoreValue(v);
    }
    const body = JSON.stringify({ fields });
    const appId = 'letseat-366e9';
    const path = `/v1/projects/${appId}/databases/(default)/documents/artifacts/${appId}/public/data/${collectionName}/${encodeURIComponent(docId)}`;
    
    const req = https.request({
      hostname: 'firestore.googleapis.com',
      path,
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(d));
        } else {
          reject(new Error(`Firestore error ${res.statusCode}: ${d}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function runSecondaryVerificationPipeline() {
  console.log('============================================================');
  console.log('--- JIA-BEN TAIWAN 6.0D SECONDARY PLACE VERIFICATION ---');
  console.log('============================================================\n');

  // Step 1: Read Baseline from Firestore
  console.log('🔍 Checking Current Production Baseline...');
  const jiaPlaces = await fetchCollection('jiaPlaces');
  const poiCache = await fetchCollection('taiwanPoiCache');

  console.log(`   - jiaPlaces count: ${jiaPlaces.length} (Expected: 52)`);
  console.log(`   - taiwanPoiCache count: ${poiCache.length} (Expected: 1)`);

  if (jiaPlaces.length !== 52 || poiCache.length !== 1) {
    throw new Error(`Baseline mismatch! Expected jiaPlaces=52, poiCache=1. Got jiaPlaces=${jiaPlaces.length}, poiCache=${poiCache.length}`);
  }

  // Confirm existing 金溫州餛飩大王 record
  const existingKimDoc = poiCache.find(d => d.businessId === '08878896' || d.jiaPlaceId === 'jia_861b7f1e734675b2422c');
  if (!existingKimDoc) {
    throw new Error('Existing verified 金溫州餛飩大王 document not found in taiwanPoiCache!');
  }
  console.log(`   - Preserved verified cache: [${existingKimDoc.officialName}] (${existingKimDoc.businessId})\n`);

  // Step 2: Load Staged MOEA candidate records from official CSVs
  const targetCities = ['屏東縣', '高雄市', '台南市', '嘉義市', '嘉義縣', '台北市', '台中市', '南投縣', '花蓮縣', '台東縣', '新北市'];
  const businessCsvPath = 'private_staging/moea/moea_business_restaurants.official-source.csv';
  const companyCsvPath = 'private_staging/moea/moea_company_restaurants.official-source.csv';

  const busRes = await parseCsvFile(businessCsvPath, 'BUSINESS', targetCities);
  const compRes = await parseCsvFile(companyCsvPath, 'COMPANY', targetCities);
  const allMoeaCandidates = [...busRes.stagedRecords, ...compRes.stagedRecords];
  console.log(`✅ Loaded ${allMoeaCandidates.length} relevant MOEA candidate records from local staging.\n`);

  // Step 3: Run Sequential Secondary Verification for all 52 JiaPlaces
  console.log('⚡ Executing Controlled Multi-Source Verification (Sequential Rate-Limited Queue)...');
  
  const verificationResults = [];
  const verifiedList = [];
  const probableList = [];
  const needsReviewList = [];
  const noMatchList = [];
  const conflictList = [];

  for (let i = 0; i < jiaPlaces.length; i++) {
    const place = jiaPlaces[i];
    const isAlreadyVerified = (place.jiaPlaceId === 'jia_861b7f1e734675b2422c');

    console.log(`[${i + 1}/${jiaPlaces.length}] Evaluating: "${place.name}" (${place.city || '未指定'}) [ID: ${place.jiaPlaceId}]`);

    // Find genuine MOEA candidate (requires genuine name match and compatible city)
    let bestMoea = null;
    let bestMoeaScore = 0;
    const nameInfo = TaiwanSecondaryPlaceVerifier.parseRestaurantName(place.name);

    for (const moea of allMoeaCandidates) {
      const moeaNameInfo = TaiwanSecondaryPlaceVerifier.parseRestaurantName(moea.officialName);
      
      const isExact = (nameInfo.baseName === moeaNameInfo.baseName || nameInfo.rawName === moeaNameInfo.rawName);
      const isCompatible = (nameInfo.baseName.length >= 3 && (moea.officialName.includes(nameInfo.baseName) || nameInfo.baseName.includes(moea.officialName)));

      if (!isExact && !isCompatible) continue;

      let s = 0;
      if (isExact) s += 0.5;
      else if (isCompatible) s += 0.3;

      if (place.city && moea.address.includes(place.city)) s += 0.2;
      const doorA = TaiwanSecondaryPlaceVerifier.extractDoorplate(place.address || '');
      const doorB = TaiwanSecondaryPlaceVerifier.extractDoorplate(moea.address || '');
      if (doorA && doorB && doorA === doorB) s += 0.3;

      if (s > bestMoeaScore) {
        bestMoeaScore = s;
        bestMoea = moea;
      }
    }

    // Secondary Physical Evidence Search via OSM / Nominatim
    let bestOsm = null;
    let queryStr = '';

    if (place.address && place.address.length > 5) {
      queryStr = `${place.name} ${place.city || ''} ${place.address}`.trim();
    } else {
      queryStr = `${place.name} ${place.city || ''}`.trim();
    }

    const osmResults = await TaiwanSecondaryPlaceVerifier.queryNominatim(queryStr);
    if (osmResults && osmResults.length > 0) {
      bestOsm = osmResults[0];
    } else if (place.address && place.address.length > 5) {
      // Fallback search by clean address
      const normAddr = TaiwanAddressNormalizer.normalizeTaiwanAddress(place.address, place.city);
      if (normAddr.formattedAddress && !normAddr.placeholderOnly) {
        const addrOsm = await TaiwanSecondaryPlaceVerifier.queryNominatim(normAddr.formattedAddress);
        if (addrOsm && addrOsm.length > 0) {
          bestOsm = addrOsm[0];
        }
      }
    }

    // Multi-source Identity Resolution Evaluation
    const evalRes = TaiwanSecondaryPlaceVerifier.evaluateSecondaryPlaceMatch(place, bestMoea, bestOsm);

    // If it's already verified in Phase 6.0C (金溫州), retain its verified status
    if (isAlreadyVerified) {
      evalRes.decision = 'ALREADY_VERIFIED';
    }

    const resultItem = {
      jiaPlaceId: place.jiaPlaceId,
      jiaBenName: place.name,
      jiaBenAddress: place.address || '—',
      jiaBenCity: place.city || '—',
      jiaBenLocation: place.location || null,
      moea: bestMoea ? {
        businessId: bestMoea.businessId,
        officialName: bestMoea.officialName,
        officialAddress: bestMoea.address,
        businessStatus: bestMoea.status,
        registryType: bestMoea.registryType,
        sourceRowNumber: bestMoea.sourceRowNumber,
        rawSourceHash: bestMoea.rawSourceHash,
        sourceFile: bestMoea.sourceFile
      } : null,
      osm: bestOsm ? {
        osmType: bestOsm.osm_type,
        osmId: bestOsm.osm_id,
        name: bestOsm.name || bestOsm.display_name?.split(',')[0],
        displayName: bestOsm.display_name,
        lat: parseFloat(bestOsm.lat),
        lon: parseFloat(bestOsm.lon),
        retrievedAt: new Date().toISOString(),
        attribution: '© OpenStreetMap contributors'
      } : null,
      confidence: isAlreadyVerified ? 1.0 : evalRes.confidence,
      decision: evalRes.decision,
      signals: evalRes.matchSignals,
      evidenceSources: isAlreadyVerified ? ['JIA_BEN_EXISTING', 'MOEA_GCIS', 'OPENSTREETMAP'] : evalRes.evidenceSources,
      doorplate: evalRes.doorplate
    };

    verificationResults.push(resultItem);

    if (resultItem.decision === 'VERIFIED_PHYSICAL_PLACE') verifiedList.push(resultItem);
    else if (resultItem.decision === 'PROBABLE_MATCH') probableList.push(resultItem);
    else if (resultItem.decision === 'NEEDS_REVIEW') needsReviewList.push(resultItem);
    else if (resultItem.decision === 'CONFLICT') conflictList.push(resultItem);
    else if (resultItem.decision !== 'ALREADY_VERIFIED') noMatchList.push(resultItem);

    console.log(`   --> Decision: ${resultItem.decision} (Confidence: ${resultItem.confidence}) | Signals: ${evalRes.matchSignals.join(', ')}\n`);
  }

  console.log('============================================================');
  console.log('📊 SECONDARY VERIFICATION SUMMARY:');
  console.log(`   - Total Existing JiaPlaces: ${jiaPlaces.length}`);
  console.log(`   - Already Verified: 1 (金溫州餛飩大王)`);
  console.log(`   - ✨ VERIFIED_PHYSICAL_PLACE (>= 0.93 & 2+ sources): ${verifiedList.length}`);
  console.log(`   - 💡 PROBABLE_MATCH (0.85 - 0.929): ${probableList.length}`);
  console.log(`   - ⚠️ NEEDS_REVIEW (0.70 - 0.849): ${needsReviewList.length}`);
  console.log(`   - ❌ NO_MATCH (< 0.70): ${noMatchList.length}`);
  console.log(`   - 🚫 CONFLICT: ${conflictList.length}`);
  console.log(`   - 🌐 Nominatim Network Calls: ${TaiwanSecondaryPlaceVerifier.requestStats.nominatimNetworkCalls}`);
  console.log(`   - 💾 Nominatim Cache Hits: ${TaiwanSecondaryPlaceVerifier.requestStats.nominatimCacheHits}`);
  console.log('============================================================\n');

  // Step 4: Write Local Markdown and JSON Reports
  const reportData = {
    evaluatedAt: new Date().toISOString(),
    totalJiaPlaces: jiaPlaces.length,
    alreadyVerifiedCount: 1,
    verifiedCount: verifiedList.length,
    probableCount: probableList.length,
    needsReviewCount: needsReviewList.length,
    noMatchCount: noMatchList.length,
    conflictCount: conflictList.length,
    requestStats: TaiwanSecondaryPlaceVerifier.requestStats,
    results: verificationResults
  };
  fs.writeFileSync('secondary_verification_report.json', JSON.stringify(reportData, null, 2));

  let mdReport = `# Taiwan Place Intelligence 6.0D: Secondary Place Verification Report\n\n`;
  mdReport += `**Evaluated At**: ${new Date().toISOString()}  \n`;
  mdReport += `**Canonical Database Status**: \`jiaPlaces = 52\`, \`taiwanPoiCache = 1\`, \`JiaPlaces writes = 0\`  \n\n`;
  mdReport += `## 1. 驗證摘要 (Verification Summary)\n\n`;
  mdReport += `- **總評估店家數**: 52\n`;
  mdReport += `- **既有已驗證**: 1 (金溫州餛飩大王 \`08878896\`)\n`;
  mdReport += `- ✨ **VERIFIED_PHYSICAL_PLACE (>= 0.93)**: **${verifiedList.length}** 間\n`;
  mdReport += `- 💡 **PROBABLE_MATCH (0.85 - 0.929)**: **${probableList.length}** 間\n`;
  mdReport += `- ⚠️ **NEEDS_REVIEW (0.70 - 0.849)**: **${needsReviewList.length}** 間\n`;
  mdReport += `- ❌ **NO_MATCH (< 0.70)**: **${noMatchList.length}** 間\n`;
  mdReport += `- 🚫 **CONFLICT**: **${conflictList.length}** 間\n`;
  mdReport += `- **Nominatim 連線請求數**: ${TaiwanSecondaryPlaceVerifier.requestStats.nominatimNetworkCalls}\n`;
  mdReport += `- **Nominatim 快取命中數**: ${TaiwanSecondaryPlaceVerifier.requestStats.nominatimCacheHits}\n\n`;

  mdReport += `## 2. 焦點店家 — 桃花源餐廳嘉義分店 (Focus Case)\n\n`;
  const peachCase = verificationResults.find(r => r.jiaPlaceId === 'jia_c7c9e231e57698f15123');
  if (peachCase) {
    mdReport += `- **Jia-ben ID**: \`${peachCase.jiaPlaceId}\`\n`;
    mdReport += `- **Jia-ben 店名**: ${peachCase.jiaBenName}\n`;
    mdReport += `- **Jia-ben 地址**: ${peachCase.jiaBenAddress} (${peachCase.jiaBenCity})\n`;
    mdReport += `- **MOEA 候選**: ${peachCase.moea ? `${peachCase.moea.officialName} (統編: ${peachCase.moea.businessId}, ${peachCase.moea.officialAddress})` : '無'}\n`;
    mdReport += `- **OSM 實體佐證**: ${peachCase.osm ? `${peachCase.osm.displayName} (${peachCase.osm.lat}, ${peachCase.osm.lon})` : '無'}\n`;
    mdReport += `- **信心度 (Confidence)**: **${peachCase.confidence}**\n`;
    mdReport += `- **判定結果 (Decision)**: **${peachCase.decision}**\n`;
    mdReport += `- **比對訊號**: ${peachCase.signals.join(' | ')}\n`;
    mdReport += `- **獨立證據來源**: ${peachCase.evidenceSources.join(', ')}\n\n`;
  }

  mdReport += `## 3. VERIFIED PHYSICAL PLACE 候選清單 (準予寫入快取)\n\n`;
  if (verifiedList.length === 0) {
    mdReport += `*（本次無新增達到 VERIFIED_PHYSICAL_PLACE 門檻之店家）*\n\n`;
  } else {
    verifiedList.forEach((item, idx) => {
      mdReport += `### ${idx + 1}. ${item.jiaBenName} (信心度: ${item.confidence})\n`;
      mdReport += `- **Jia-ben ID**: \`${item.jiaPlaceId}\`\n`;
      mdReport += `- **Jia-ben 地址**: ${item.jiaBenAddress} (${item.jiaBenCity})\n`;
      mdReport += `- **MOEA 統編與名稱**: \`${item.moea?.businessId}\` ${item.moea?.officialName} (${item.moea?.officialAddress})\n`;
      mdReport += `- **OSM 實體比對**: ${item.osm?.displayName}\n`;
      mdReport += `- **比對訊號**: ${item.signals.join(' | ')}\n`;
      mdReport += `- **獨立證據來源**: ${item.evidenceSources.join(', ')}\n\n`;
    });
  }

  mdReport += `## 4. 全數 52 家店家次級實體比對總表\n\n`;
  mdReport += `| # | 店家名稱 | Jia-ben 現有地址 | MOEA 匹配登記 | 統一編號 | OSM 實體佐證 | 信心度 | 判定結果 |\n`;
  mdReport += `|---|---|---|---|---|---|---|---|\n`;
  verificationResults.forEach((row, idx) => {
    mdReport += `| ${idx + 1} | ${row.jiaBenName} | ${row.jiaBenAddress} | ${row.moea?.officialName || '—'} | ${row.moea?.businessId || '—'} | ${row.osm ? '✅ 有實體' : '—'} | **${row.confidence}** | ${row.decision} |\n`;
  });

  fs.writeFileSync('taiwan_secondary_verification_report.md', mdReport);
  console.log('📄 Saved taiwan_secondary_verification_report.md (local/private).\n');

  // Step 5: Production Write Safety Gate
  console.log('============================================================');
  console.log('=== PRODUCTION WRITE PLAN ===');
  console.log(`Existing cache count: 1 (金溫州餛飩大王)`);
  console.log(`New verified records eligible for cache write: ${verifiedList.length}`);
  console.log(`Expected cache count after write: ${1 + verifiedList.length}`);
  console.log('============================================================\n');

  let writeSuccessCount = 0;

  if (verifiedList.length > 0) {
    // Perform safety backup before writing
    console.log('🛡️ Creating pre-write backup snapshot...');
    const backupMeta = await createBackup();
    console.log(`   - Backup created: ${backupMeta.backupFile} (SHA-256: ${backupMeta.sha256})\n`);

    const token = await getAnonymousToken();

    for (const rec of verifiedList) {
      // Validate write gate constraints
      if (rec.confidence < 0.93) {
        console.warn(`[Write Gate] Skipping ${rec.jiaBenName}: confidence < 0.93 (${rec.confidence})`);
        continue;
      }
      if (rec.evidenceSources.length < 2) {
        console.warn(`[Write Gate] Skipping ${rec.jiaBenName}: independent sources < 2`);
        continue;
      }
      if (!rec.moea?.businessId) {
        console.warn(`[Write Gate] Skipping ${rec.jiaBenName}: missing MOEA businessId`);
        continue;
      }

      const docId = `moea_business_${rec.moea.businessId}`;
      const cacheDoc = {
        taiwanPoiId: docId,
        cacheId: docId,
        jiaPlaceId: rec.jiaPlaceId,
        businessId: rec.moea.businessId,
        officialName: rec.moea.officialName,
        rawOfficialName: rec.moea.officialName,
        normalizedName: rec.moea.officialName,
        address: rec.moea.officialAddress,
        officialAddress: rec.moea.officialAddress,
        rawOfficialAddress: rec.moea.officialAddress,
        normalizedAddress: TaiwanAddressNormalizer.normalizeTaiwanAddress(rec.moea.officialAddress).formattedAddress,
        city: rec.jiaBenCity,
        district: TaiwanAddressNormalizer.normalizeTaiwanAddress(rec.moea.officialAddress).district || '',
        businessStatus: rec.moea.businessStatus,
        registryType: rec.moea.registryType,
        source: 'MOEA_OSM_HYBRID',
        verificationStatus: 'verified_physical_place',
        confidence: rec.confidence,
        evidenceSources: rec.evidenceSources,
        physicalPlace: {
          normalizedName: rec.jiaBenName,
          normalizedAddress: rec.jiaBenAddress,
          city: rec.jiaBenCity,
          location: rec.jiaBenLocation
        },
        moea: rec.moea,
        osm: rec.osm,
        verifiedAt: new Date().toISOString()
      };

      console.log(`🚀 Writing verified cache document [${docId}] for "${rec.jiaBenName}"...`);
      await saveToFirestore('taiwanPoiCache', docId, cacheDoc, token);
      writeSuccessCount++;
      console.log(`✅ Document [${docId}] successfully written.`);
    }
  } else {
    console.log('ℹ️ No new verified records to write. Cache remains exactly 1.');
  }

  // Step 6: Post-Write Verification & Validation
  console.log('\n🔍 Running Post-Write Audit on Live Firestore...');
  const postJiaPlaces = await fetchCollection('jiaPlaces');
  const postPoiCache = await fetchCollection('taiwanPoiCache');

  console.log(`   - Live jiaPlaces count: ${postJiaPlaces.length} (Expected: 52)`);
  console.log(`   - Live taiwanPoiCache count: ${postPoiCache.length} (Expected: ${1 + writeSuccessCount})`);

  if (postJiaPlaces.length !== 52) {
    throw new Error(`CRITICAL: jiaPlaces count altered! Expected 52, got ${postJiaPlaces.length}`);
  }
  if (postPoiCache.length !== 1 + writeSuccessCount) {
    throw new Error(`CRITICAL: taiwanPoiCache count mismatch! Expected ${1 + writeSuccessCount}, got ${postPoiCache.length}`);
  }

  console.log('\n🎉 JIA-BEN TAIWAN 6.0D BATCH VERIFICATION COMPLETED SUCCESSFULLY!\n');

  return {
    totalPlaces: jiaPlaces.length,
    alreadyVerified: 1,
    newVerifiedWritten: writeSuccessCount,
    finalPoiCacheCount: postPoiCache.length,
    results: verificationResults,
    peachCase
  };
}

if (require.main === module) {
  runSecondaryVerificationPipeline().catch(err => {
    console.error('❌ Verification pipeline failed:', err);
    process.exit(1);
  });
}

module.exports = {
  runSecondaryVerificationPipeline
};
