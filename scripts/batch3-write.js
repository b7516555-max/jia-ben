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

function encodeValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(encodeValue) } };
  }
  if (typeof v === 'object') {
    return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, val]) => [k, encodeValue(val)])) } };
  }
  return { stringValue: String(v) };
}

async function authToken() {
  const res = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true })
  });
  return (await res.json()).idToken;
}

(async () => {
  const token = await authToken();
  const diffReport = JSON.parse(fs.readFileSync(path.join(rootDir, 'reports', 'batch3-proposed-diff.json'), 'utf8'));
  
  console.log('=== STARTING BATCH 3 FIRESTORE WRITE (PARTIAL UPDATE ONLY) ===');
  const results = [];

  for (const item of diffReport) {
    const docId = item.jiaPlaceId;
    const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/${projectId}/public/data/jiaPlaces/${docId}`;
    
    // 1. Fetch current doc to ensure merge safety
    const curRes = await fetch(docUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!curRes.ok) {
      console.error(`Failed to fetch place ${docId}:`, curRes.status);
      continue;
    }
    const curDoc = await curRes.json();
    const curData = Object.fromEntries(Object.entries(curDoc.fields || {}).map(([k, v]) => [k, dv(v)]));

    const updateMaskFields = [];
    const fieldsToUpdate = {};

    if (item.action === 'AUTO_WRITE' || item.action === 'MATCHED_NO_NEW_FIELDS') {
      const sourceIds = { ...(curData.sourceIds || {}) };
      if (item.foursquareRaw?.sourceId) {
        sourceIds.foursquare = item.foursquareRaw.sourceId;
        fieldsToUpdate.sourceIds = sourceIds;
        updateMaskFields.push('sourceIds');
      }

      if (!curData.address && item.proposedUpdates.address) {
        fieldsToUpdate.address = item.proposedUpdates.address;
        updateMaskFields.push('address');
      }
      if (!curData.phone && item.proposedUpdates.phone) {
        fieldsToUpdate.phone = item.proposedUpdates.phone;
        updateMaskFields.push('phone');
      }
    }

    // Remaining missing fields
    const newMissingFields = ['address', 'phone', 'website', 'openingHours'].filter(k => {
      const v = fieldsToUpdate[k] !== undefined ? fieldsToUpdate[k] : curData[k];
      return !v || String(v).trim() === '';
    });

    const sourcesUsed = item.action === 'AUTO_WRITE' || item.action === 'MATCHED_NO_NEW_FIELDS'
      ? [...new Set([...(curData.enrichment?.sourcesUsed || []), 'foursquare'])]
      : (curData.enrichment?.sourcesUsed || []);

    const enrichment = {
      ...(curData.enrichment || {}),
      lastCheckedAt: new Date().toISOString(),
      missingFields: newMissingFields,
      sourcesUsed: sourcesUsed,
      version: 1
    };
    fieldsToUpdate.enrichment = enrichment;
    updateMaskFields.push('enrichment');

    fieldsToUpdate.updatedAt = new Date().toISOString();
    updateMaskFields.push('updatedAt');

    // Send patch request with updateMask
    const maskParams = updateMaskFields.map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
    const patchUrl = `${docUrl}?${maskParams}`;
    
    const patchRes = await fetch(patchUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: Object.fromEntries(Object.entries(fieldsToUpdate).map(([k, v]) => [k, encodeValue(v)]))
      })
    });

    if (!patchRes.ok) {
      const errText = await patchRes.text();
      console.error(`Error updating [${item.name}]:`, patchRes.status, errText);
      results.push({ name: item.name, status: 'error', error: errText });
    } else {
      console.log(`Successfully updated [${item.name}] (${item.jiaPlaceId}) - Action: ${item.action} - Fields: ${Object.keys(fieldsToUpdate).join(', ')}`);
      results.push({ name: item.name, jiaPlaceId: item.jiaPlaceId, action: item.action, updatedFields: Object.keys(fieldsToUpdate) });
    }
  }

  console.log('\n=== BATCH 3 FIRESTORE WRITE COMPLETE ===');
  console.log(JSON.stringify(results, null, 2));
})();
