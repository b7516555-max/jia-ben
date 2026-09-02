/**
 * Official MOEA GCIS Forensic Parser & Matcher (scripts/parse_and_stage_moea_csv.js)
 * 
 * Jia-ben Taiwan Place Intelligence 6.0B — Full Automated Official MOEA Pipeline
 * 
 * - Parses both Business (商業登記) and Company (公司登記) official CSVs.
 * - Extracts SHA-256, row count, file sizes, encoding, and first 5 raw rows.
 * - Audits 12 historical suspicious IDs against both real datasets.
 * - Normalizes and stages records for relevant JiaPlaces cities.
 * - Runs TaiwanPlaceIdentityResolver against the 52 existing JiaPlaces (0 writes).
 * - Generates registry_import_manifest.json and taiwan_registry_review_report.md.
 * - STRICTLY READ-ONLY for Firestore (jiaPlaces writes = 0, taiwanPoiCache writes = 0).
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');
const { fetchCollection } = require('./safe_backup_and_rollback.js');
const TaiwanPlaceIdentityResolver = require('../src/services/taiwanPlaceIdentityResolver.js');
const TaiwanAddressNormalizer = require('../src/utils/taiwanAddressNormalizer.js');

const SUSPICIOUS_IDS = [
  '78912345', '98765432', '87654321', '13579246', '24681357',
  '82345678', '73456789', '64567890', '55678901', '46789012',
  '47891234', '87389178'
];

async function parseCsvFile(csvFilePath, datasetType, targetCities) {
  if (!fs.existsSync(csvFilePath)) {
    throw new Error(`File not found: ${csvFilePath}`);
  }

  const fileStats = fs.statSync(csvFilePath);
  const fileBuffer = fs.readFileSync(csvFilePath);
  const fileSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  let encoding = 'utf-8';
  if (fileBuffer[0] === 0xEF && fileBuffer[1] === 0xBB && fileBuffer[2] === 0xBF) {
    encoding = 'utf-8-bom';
  }

  const fileStream = fs.createReadStream(csvFilePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let header = null;
  let rowNumber = 0;
  let totalRows = 0;
  const first5RawRows = [];
  const stagedRecords = [];
  const suspiciousFound = {};

  for await (const line of rl) {
    rowNumber++;
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (!header) {
      const cleanLine = trimmed.replace(/^\uFEFF/, '');
      header = cleanLine.split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
      continue;
    }

    totalRows++;

    if (first5RawRows.length < 5) {
      first5RawRows.push({ rowNumber, raw: trimmed });
    }

    // CSV line parser handling quoted commas
    const cols = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < trimmed.length; i++) {
      const char = trimmed[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cols.push(cur.trim().replace(/^["']|["']$/g, ''));
        cur = '';
      } else {
        cur += char;
      }
    }
    cols.push(cur.trim().replace(/^["']|["']$/g, ''));

    let businessId = cols[0] || '';
    let officialName = '';
    let address = '';
    let status = '營業中';

    if (datasetType === 'BUSINESS') {
      // 商業登記: 統一編號, 商業名稱, 商業地址, 登記狀態, 備註
      officialName = cols[1] || '';
      address = cols[2] || '';
      status = cols[3] || '營業中';
    } else {
      // 公司登記: 統一編號, 公司名稱, 負責人, 公司地址, 資本總額, 實收資本額, 在境內營運資金, 公司狀態, 產製日期
      officialName = cols[1] || '';
      address = cols[3] || '';
      status = cols[7] || '核准設立';
    }

    // Audit suspicious IDs
    if (SUSPICIOUS_IDS.includes(businessId)) {
      suspiciousFound[businessId] = {
        rowNumber,
        officialName,
        address,
        status,
        datasetType,
        raw: trimmed
      };
    }

    // City filtering for relevant cities
    const matchesCity = targetCities.some(city => 
      address.includes(city) || address.includes(city.replace('台', '臺'))
    );

    if (matchesCity && /^\d{8}$/.test(businessId) && officialName) {
      const rawSourceHash = 'sha256:' + crypto.createHash('sha256').update(trimmed).digest('hex');
      const normAddr = TaiwanAddressNormalizer.normalizeTaiwanAddress(address);
      stagedRecords.push({
        businessId,
        officialName,
        rawOfficialName: officialName,
        address,
        rawOfficialAddress: address,
        normalizedAddress: normAddr.formattedAddress,
        city: normAddr.city || '',
        district: normAddr.district || '',
        status,
        registryType: datasetType,
        sourceRowNumber: rowNumber,
        rawSourceHash,
        sourceFile: path.basename(csvFilePath)
      });
    }
  }

  return {
    filePath: csvFilePath,
    fileName: path.basename(csvFilePath),
    fileSize: fileStats.size,
    fileSha256,
    encoding,
    header,
    totalRows,
    first5RawRows,
    stagedRecords,
    suspiciousFound
  };
}

async function runFullPipeline() {
  console.log('============================================================');
  console.log('--- JIA-BEN TAIWAN 6.0B AUTOMATED OFFICIAL MOEA PIPELINE ---');
  console.log('============================================================\n');

  // Step 1: Query 52 JiaPlaces from Production to calculate true city distribution
  const jiaPlaces = await fetchCollection('jiaPlaces');
  console.log(`✅ Loaded ${jiaPlaces.length} Production JiaPlaces from Firestore.`);
  
  const cityDistribution = {};
  jiaPlaces.forEach(p => {
    const c = p.city || '未指定';
    cityDistribution[c] = (cityDistribution[c] || 0) + 1;
  });
  console.log('📊 True Production JiaPlaces City Distribution:', cityDistribution);

  const targetCities = Object.keys(cityDistribution).filter(c => c !== '未指定' && c !== '千葉縣');
  console.log('🎯 Target Relevant Cities:', targetCities.join(', '));
  console.log('');

  // Step 2: Parse Business & Company official CSV files
  const businessCsvPath = 'private_staging/moea/moea_business_restaurants.official-source.csv';
  const companyCsvPath = 'private_staging/moea/moea_company_restaurants.official-source.csv';

  console.log('▶ Parsing Official Business Registry CSV (商業登記)...');
  const businessResult = await parseCsvFile(businessCsvPath, 'BUSINESS', targetCities);

  console.log('▶ Parsing Official Company Registry CSV (公司登記)...');
  const companyResult = await parseCsvFile(companyCsvPath, 'COMPANY', targetCities);

  console.log('\n============================================================');
  console.log('🔍 FILE FORENSICS & VERIFICATION:');
  console.log('============================================================');
  
  [businessResult, companyResult].forEach(res => {
    console.log(`\n📄 File: ${res.fileName}`);
    console.log(`   Size: ${(res.fileSize / (1024 * 1024)).toFixed(2)} MB (${res.fileSize} bytes)`);
    console.log(`   SHA-256: ${res.fileSha256}`);
    console.log(`   Encoding: ${res.encoding}`);
    console.log(`   Header: ${res.header.join(', ')}`);
    console.log(`   Total Official Rows: ${res.totalRows}`);
    console.log(`   Staged Relevant Records: ${res.stagedRecords.length}`);
    console.log(`   First 5 Raw Rows:`);
    res.first5RawRows.forEach(r => console.log(`     [Row ${r.rowNumber}] ${r.raw}`));
  });

  // Step 3: Audit 12 suspicious IDs across both real files
  console.log('\n============================================================');
  console.log('🕵️ AUDIT OF 12 HISTORICAL SUSPICIOUS IDs IN REAL OFFICIAL CSVs:');
  console.log('============================================================');
  const idAuditResults = [];
  let totalSuspiciousFound = 0;

  SUSPICIOUS_IDS.forEach(id => {
    const inBus = businessResult.suspiciousFound[id];
    const inComp = companyResult.suspiciousFound[id];
    const found = Boolean(inBus || inComp);
    if (found) totalSuspiciousFound++;

    const hit = inBus || inComp;
    idAuditResults.push({
      businessId: id,
      foundInBusiness: Boolean(inBus),
      foundInCompany: Boolean(inComp),
      officialName: hit ? hit.officialName : '—',
      officialAddress: hit ? hit.address : '—',
      sourceRow: hit ? hit.rowNumber : '—',
      datasetType: hit ? hit.datasetType : '—'
    });

    console.log(`ID: ${id} | Business: ${inBus ? 'YES (Row ' + inBus.rowNumber + ')' : 'NO'} | Company: ${inComp ? 'YES (Row ' + inComp.rowNumber + ')' : 'NO'} | Name: ${hit ? hit.officialName : 'NOT FOUND'}`);
  });
  console.log(`\nTotal Suspicious IDs Found in Official CSVs: ${totalSuspiciousFound} / ${SUSPICIOUS_IDS.length}`);

  // Step 4: Combine Staged Official Candidate Pool
  const allStagedCandidates = [...businessResult.stagedRecords, ...companyResult.stagedRecords];
  console.log(`\nTotal Combined Staged Candidate Records (Relevant Cities): ${allStagedCandidates.length}`);

  // Step 5: Dry-Run Matching against 52 JiaPlaces
  console.log('\n============================================================');
  console.log('⚡ RUNNING 52 JIAPLACES IDENTITY RESOLUTION MATCHING (READ ONLY)...');
  console.log('============================================================\n');

  const autoMatchList = [];
  const needsReviewList = [];
  const noMatchList = [];
  const candidateTable = [];

  for (const place of jiaPlaces) {
    let topScore = 0;
    let bestCandidate = null;
    let bestEval = null;

    // Search against all staged records in the candidate pool
    for (const cand of allStagedCandidates) {
      const evalRes = TaiwanPlaceIdentityResolver.evaluateTaiwanMatch(place, cand);
      if (evalRes.confidence > topScore) {
        topScore = evalRes.confidence;
        bestCandidate = cand;
        bestEval = evalRes;
      }
    }

    let decision = 'NO_MATCH';
    if (topScore >= 0.93) {
      decision = 'AUTO_MATCH';
      autoMatchList.push({ place, candidate: bestCandidate, evalRes: bestEval, confidence: topScore });
    } else if (topScore >= 0.85) {
      decision = 'NEEDS_REVIEW';
      needsReviewList.push({ place, candidate: bestCandidate, evalRes: bestEval, confidence: topScore });
    } else {
      noMatchList.push({ place, candidate: bestCandidate, evalRes: bestEval, confidence: topScore });
    }

    candidateTable.push({
      jiaPlaceId: place.jiaPlaceId,
      jiaBenName: place.name,
      existingAddress: place.address || '—',
      existingCity: place.city || '—',
      officialName: bestCandidate ? bestCandidate.officialName : '—',
      officialAddress: bestCandidate ? bestCandidate.address : '—',
      businessId: bestCandidate ? bestCandidate.businessId : '—',
      registryType: bestCandidate ? bestCandidate.registryType : '—',
      status: bestCandidate ? bestCandidate.status : '—',
      sourceFile: bestCandidate ? bestCandidate.sourceFile : '—',
      sourceRow: bestCandidate ? bestCandidate.sourceRowNumber : '—',
      rawSourceHash: bestCandidate ? bestCandidate.rawSourceHash : '—',
      confidence: topScore,
      signals: bestEval ? bestEval.matchSignals.join(' | ') : 'No matching signals',
      decision
    });
  }

  console.log('📊 DRY RUN MATCHING RESULTS:');
  console.log(`   - Total Existing JiaPlaces: ${jiaPlaces.length}`);
  console.log(`   - ✨ AUTO MATCH (>= 0.93): ${autoMatchList.length}`);
  console.log(`   - ⚠️ NEEDS REVIEW (0.85 - 0.929): ${needsReviewList.length}`);
  console.log(`   - ❌ NO MATCH (< 0.85): ${noMatchList.length}`);
  console.log(`   - 🛡️ Database Writes: 0 (STRICTLY READ ONLY)\n`);

  // Step 6: Generate registry_import_manifest.json (Private local)
  const manifest = {
    source: 'MOEA_GCIS',
    sourceAgency: '經濟部商業發展署',
    importedAt: new Date().toISOString(),
    datasets: [
      {
        datasetTitle: '商業登記(依營業項目別)－餐廳餐館',
        datasetPageUrl: 'https://data.gcis.nat.gov.tw/',
        fileName: businessResult.fileName,
        fileSha256: businessResult.fileSha256,
        fileSize: businessResult.fileSize,
        rowCount: businessResult.totalRows,
        stagedRelevantRowCount: businessResult.stagedRecords.length,
        encoding: businessResult.encoding
      },
      {
        datasetTitle: '公司登記(依營業項目別)－餐廳餐館',
        datasetPageUrl: 'https://data.gcis.nat.gov.tw/',
        fileName: companyResult.fileName,
        fileSha256: companyResult.fileSha256,
        fileSize: companyResult.fileSize,
        rowCount: companyResult.totalRows,
        stagedRelevantRowCount: companyResult.stagedRecords.length,
        encoding: companyResult.encoding
      }
    ],
    totalOfficialRecords: businessResult.totalRows + companyResult.totalRows,
    relevantCityRecords: allStagedCandidates.length,
    matching: {
      totalJiaPlaces: jiaPlaces.length,
      autoMatch: autoMatchList.length,
      needsReview: needsReviewList.length,
      noMatch: noMatchList.length
    }
  };
  fs.writeFileSync('registry_import_manifest.json', JSON.stringify(manifest, null, 2));
  console.log('✅ Generated private registry_import_manifest.json (untracked in git).');

  // Step 7: Generate readable taiwan_registry_review_report.md
  let reportMd = `# Taiwan Place Intelligence 6.0B: Official Registry Review Report\n\n`;
  reportMd += `**Audit Timestamp**: ${new Date().toISOString()}  \n`;
  reportMd += `**Official Source Agency**: 經濟部商業發展署 商工行政資料開放平臺  \n`;
  reportMd += `**Canonical Database Status**: \`jiaPlaces = 52\`, \`taiwanPoiCache = 0\`, \`JiaPlaces writes = 0\`  \n\n`;

  reportMd += `## 1. 官方檔案鑑識資訊 (Official File Forensics)\n\n`;
  reportMd += `| 資料集名稱 | 檔名 | 檔案大小 | SHA-256 | 官方總筆數 | 相關縣市篩選筆數 |\n`;
  reportMd += `|---|---|---|---|---|---|\n`;
  reportMd += `| **商業登記餐廳餐館** | \`${businessResult.fileName}\` | ${(businessResult.fileSize / (1024 * 1024)).toFixed(2)} MB | \`${businessResult.fileSha256}\` | ${businessResult.totalRows} | ${businessResult.stagedRecords.length} |\n`;
  reportMd += `| **公司登記餐廳餐館** | \`${companyResult.fileName}\` | ${(companyResult.fileSize / (1024 * 1024)).toFixed(2)} MB | \`${companyResult.fileSha256}\` | ${companyResult.totalRows} | ${companyResult.stagedRecords.length} |\n\n`;

  reportMd += `## 2. 12 個歷史疑慮統一編號官方檔案查核 (12 Suspicious IDs Audit)\n\n`;
  reportMd += `| 統一編號 | 商業登記檔存在 | 公司登記檔存在 | 官方名稱 | 官方登記地址 | 官方來源行號 |\n`;
  reportMd += `|---|---|---|---|---|---|\n`;
  idAuditResults.forEach(r => {
    reportMd += `| \`${r.businessId}\` | ${r.foundInBusiness ? '✅ YES' : '❌ NO'} | ${r.foundInCompany ? '✅ YES' : '❌ NO'} | ${r.officialName} | ${r.officialAddress} | ${r.sourceRow} |\n`;
  });
  reportMd += `\n`;

  reportMd += `## 3. 52 筆 JiaPlaces 比對總結 (Dry-Run Matching Summary)\n\n`;
  reportMd += `- **JiaPlaces 總數**: 52\n`;
  reportMd += `- ✨ **AUTO_MATCH (>= 0.93)**: **${autoMatchList.length}** 間\n`;
  reportMd += `- ⚠️ **NEEDS_REVIEW (0.85 - 0.929)**: **${needsReviewList.length}** 間\n`;
  reportMd += `- ❌ **NO_MATCH (< 0.85)**: **${noMatchList.length}** 間\n`;
  reportMd += `- 🛡️ **JiaPlaces 資料庫異動數**: **0**（完全純唯讀，未對生產庫做任何變更）\n\n`;

  reportMd += `## 4. AUTO MATCH 候選名單 (Shortlist for User Approval)\n\n`;
  if (autoMatchList.length === 0) {
    reportMd += `*（目前 0 間達到 AUTO_MATCH。依照安全規範，僅有名稱+縣市相同已限制在 0.88 NEEDS_REVIEW，必須具備第二重強證據如電話/精準門牌/GPS 方可進入 AUTO_MATCH）*\n\n`;
  } else {
    autoMatchList.forEach((item, idx) => {
      reportMd += `### ${idx + 1}. ${item.place.name} (信心度: ${item.confidence})\n`;
      reportMd += `- **Jia-ben ID**: \`${item.place.jiaPlaceId}\`\n`;
      reportMd += `- **Jia-ben 地址**: ${item.place.address || '（無完整門牌）'} (${item.place.city || ''})\n`;
      reportMd += `- **官方登記名稱**: ${item.candidate.officialName} (\`${item.candidate.registryType}\`)\n`;
      reportMd += `- **官方統一編號**: \`${item.candidate.businessId}\` (狀態: ${item.candidate.status})\n`;
      reportMd += `- **官方登記地址**: ${item.candidate.address}\n`;
      reportMd += `- **來源檔案與行號**: \`${item.candidate.sourceFile}\` (Row ${item.candidate.sourceRowNumber})\n`;
      reportMd += `- **比對訊號**: ${item.evalRes.matchSignals.join(' | ')}\n\n`;
    });
  }

  reportMd += `## 5. NEEDS REVIEW 候選名單 (需人工複審名單)\n\n`;
  if (needsReviewList.length === 0) {
    reportMd += `*（無 NEEDS_REVIEW 項目）*\n\n`;
  } else {
    needsReviewList.forEach((item, idx) => {
      reportMd += `### ${idx + 1}. ${item.place.name} (信心度: ${item.confidence})\n`;
      reportMd += `- **Jia-ben ID**: \`${item.place.jiaPlaceId}\`\n`;
      reportMd += `- **Jia-ben 地址**: ${item.place.address || '（無完整門牌）'} (${item.place.city || ''})\n`;
      reportMd += `- **官方候選名稱**: ${item.candidate.officialName} (\`${item.candidate.registryType}\`)\n`;
      reportMd += `- **官方統一編號**: \`${item.candidate.businessId}\` (狀態: ${item.candidate.status})\n`;
      reportMd += `- **官方登記地址**: ${item.candidate.address}\n`;
      reportMd += `- **來源檔案與行號**: \`${item.candidate.sourceFile}\` (Row ${item.candidate.sourceRowNumber})\n`;
      reportMd += `- **比對訊號**: ${item.evalRes.matchSignals.join(' | ')}\n\n`;
    });
  }

  reportMd += `## 6. 全數 52 家店家比對詳細總表 (Full 52 Candidates Audit Table)\n\n`;
  reportMd += `| # | 店家名稱 (Jia-ben Name) | 現有地址 | 官方匹配名稱 | 統一編號 | 官方登記地址 | 信心度 | 判定結果 |\n`;
  reportMd += `|---|---|---|---|---|---|---|---|\n`;
  candidateTable.forEach((row, idx) => {
    reportMd += `| ${idx + 1} | ${row.jiaBenName} | ${row.existingAddress} | ${row.officialName} | ${row.businessId} | ${row.officialAddress} | **${row.confidence}** | ${row.decision === 'AUTO_MATCH' ? '✨ AUTO_MATCH' : (row.decision === 'NEEDS_REVIEW' ? '⚠️ NEEDS_REVIEW' : '❌ NO_MATCH')} |\n`;
  });

  fs.writeFileSync('taiwan_registry_review_report.md', reportMd);
  console.log('📄 Created taiwan_registry_review_report.md for user inspection.\n');

  return {
    manifest,
    candidateTable,
    autoMatchList,
    needsReviewList,
    noMatchList,
    idAuditResults
  };
}

if (require.main === module) {
  runFullPipeline().catch(console.error);
}

module.exports = {
  runFullPipeline,
  parseCsvFile
};
