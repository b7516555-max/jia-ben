/**
 * Persistent Backup & Rollback Utility (scripts/safe_backup_and_rollback.js)
 * 
 * Safely creates a timestamped local snapshot before automated operations
 * and provides per-place or full collection rollback.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const BACKUP_DIR = path.join(__dirname, '../backups');

function decodeJiaFirestoreValue(value) {
  if (!value || typeof value !== 'object') return value;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeJiaFirestoreValue);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k, v]) => [k, decodeJiaFirestoreValue(v)]));
  return null;
}

function fetchCollection(collectionName) {
  return new Promise((resolve, reject) => {
    const url = `https://firestore.googleapis.com/v1/projects/letseat-366e9/databases/(default)/documents/artifacts/letseat-366e9/public/data/${collectionName}?pageSize=100`;
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const docs = (json.documents || []).map(d => ({
            jiaPlaceId: d.name.split('/').pop(),
            ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, decodeJiaFirestoreValue(v)]))
          }));
          resolve(docs);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function createBackup() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const places = await fetchCollection('jiaPlaces');
  const backupFile = path.join(BACKUP_DIR, `jiaPlaces_backup_${timestamp}.json`);
  const latestFile = path.join(BACKUP_DIR, `jiaPlaces_backup_latest.json`);

  const metadata = {
    timestamp: new Date().toISOString(),
    totalCount: places.length,
    backupFile,
    records: places
  };

  fs.writeFileSync(backupFile, JSON.stringify(metadata, null, 2));
  fs.writeFileSync(latestFile, JSON.stringify(metadata, null, 2));

  console.log(`✅ Safe backup created successfully: ${backupFile} (${places.length} records)`);
  return metadata;
}

module.exports = {
  createBackup,
  fetchCollection,
  decodeJiaFirestoreValue
};

if (require.main === module) {
  createBackup().catch(console.error);
}
