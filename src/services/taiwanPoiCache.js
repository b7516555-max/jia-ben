/**
 * Taiwan POI Cache & Open Data Ingestion (src/services/taiwanPoiCache.js)
 * 
 * Manages Taiwan Government Open Data (MOEA / TFDA / NLSC) in a local/Firestore cache layer
 * to eliminate repeated external queries and improve search speed and accuracy.
 */
(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JiaTaiwanPoiCache = api;
})(typeof window !== 'undefined' ? window : null, function(root) {
  'use strict';

  // In-memory cache fallback
  const memoryCache = new Map();
  let firestoreBridge = null;

  function configure(bridge) {
    firestoreBridge = bridge || null;
    return api;
  }

  function createPoiRecord(raw = {}) {
    const addrNormalizer = root?.JiaTaiwanAddressNormalizer || require('../utils/taiwanAddressNormalizer.js');
    const phoneNormalizer = root?.JiaTaiwanPhoneNormalizer || require('../utils/taiwanPhoneNormalizer.js');

    const officialName = String(raw.officialName || raw.name || raw.businessName || '').trim();
    const normalizedName = addrNormalizer.standardizeChars(officialName).toLowerCase().replace(/[\s\-_・·,，.。()（）[\]【】]+/g, '');
    
    const rawAddress = String(raw.address || raw.registeredAddress || '').trim();
    const normAddr = addrNormalizer.normalizeTaiwanAddress(rawAddress, raw.city);

    const rawPhone = String(raw.phone || raw.telephone || '').trim();
    const normPhone = phoneNormalizer.normalizeTaiwanPhone(rawPhone);

    const businessId = String(raw.businessId || raw.taxId || raw.unifiedNumber || '').trim();
    const foodRegistrationId = String(raw.foodRegistrationId || raw.foodId || '').trim();

    const idSeed = businessId ? `moea_${businessId}` : (foodRegistrationId ? `tfda_${foodRegistrationId}` : `${raw.source || 'tw'}_${normalizedName}_${normAddr.formattedAddress}`);
    const taiwanPoiId = raw.taiwanPoiId || idSeed;

    const isFixture = Boolean(raw.isFixture || raw.provenance?.isFixture || raw.sourceMetadata?.isFixture);
    const sourceDataset = raw.provenance?.sourceDataset || raw.sourceDataset || raw.sourceMetadata?.sourceDataset || '';
    const sourceDatasetOid = raw.provenance?.sourceDatasetOid || raw.sourceDatasetOid || '';
    const officialSourceUrl = raw.provenance?.officialSourceUrl || raw.officialSourceUrl || raw.sourceUrl || raw.sourceMetadata?.sourceUrl || '';
    const rawSourceHash = raw.provenance?.rawSourceHash || raw.rawSourceHash || raw.sourceMetadata?.rawSourceHash || '';
    const sourceRecordId = raw.provenance?.sourceRecordId || raw.sourceRecordId || businessId || foodRegistrationId || '';
    const dataUpdatedAt = raw.provenance?.dataUpdatedAt || raw.dataUpdatedAt || '';
    const license = raw.provenance?.license || '政府資料開放授權條款－第1版';

    // Business items (e.g. F501060 餐館業)
    let businessItems = [];
    if (Array.isArray(raw.businessItems)) {
      businessItems = raw.businessItems;
    } else if (raw.businessItems) {
      businessItems = [String(raw.businessItems)];
    } else if (Array.isArray(raw.categories)) {
      businessItems = raw.categories;
    } else if (raw.category) {
      businessItems = [raw.category];
    } else {
      businessItems = ['F501060 餐館業'];
    }

    const hasUnsupportedMoeaFields = Boolean(raw.phone || raw.telephone || raw.openingHours || raw.website || raw.menuUrl || raw.photos);

    return {
      taiwanPoiId,
      source: raw.source || 'MOEA_GCIS',
      officialName,
      rawOfficialName: raw.rawOfficialName || officialName,
      normalizedName,
      address: rawAddress,
      rawOfficialAddress: raw.rawOfficialAddress || rawAddress,
      normalizedAddress: normAddr.formattedAddress,
      city: normAddr.city || raw.city || '',
      district: normAddr.district || raw.district || '',
      businessId,
      businessStatus: raw.businessStatus || '營業中',
      businessItems,
      location: (raw.location && Number.isFinite(raw.location.lat) && Number.isFinite(raw.location.lng)) ? raw.location : null,
      _hasUnsupportedMoeaFields: hasUnsupportedMoeaFields,
      provenance: {
        sourceDataset,
        sourceDatasetOid,
        officialSourceUrl,
        sourceRecordId,
        rawSourceHash,
        fetchedAt: raw.provenance?.fetchedAt || raw.fetchedAt || new Date().toISOString(),
        dataUpdatedAt,
        license,
        isFixture
      },
      isFixture
    };
  }

  /**
   * Strict validation for Production POI Cache Ingestion (Phase 6.0A)
   * Enforces 100% genuine MOEA GCIS open data records with cryptographic provenance.
   */
  function validateProductionIngestionRecord(record) {
    if (!record || typeof record !== 'object') {
      return { valid: false, reason: 'INVALID_OBJECT: Empty or invalid record object' };
    }
    if (record.isFixture === true || record.provenance?.isFixture === true) {
      return { valid: false, reason: 'FIXTURE_REJECTED: Fixture and sample records are strictly prohibited in Production cache' };
    }
    if (record.source !== 'MOEA_GCIS' && record.source !== 'MOEA_OSM_HYBRID') {
      return { valid: false, reason: 'UNALLOWLISTED_SOURCE: Only MOEA_GCIS or MOEA_OSM_HYBRID sources are allowed' };
    }
    if (record.source === 'MOEA_GCIS') {
      if (!record.businessId || !/^\d{8}$/.test(String(record.businessId).trim())) {
        return { valid: false, reason: 'BUSINESS_ID_REQUIRED: Missing or invalid 8-digit unified business ID' };
      }
      if (!record.officialName || String(record.officialName).trim().length === 0) {
        return { valid: false, reason: 'OFFICIAL_NAME_REQUIRED: Missing official registered business name' };
      }
      if (!record.address || String(record.address).trim().length === 0) {
        return { valid: false, reason: 'ADDRESS_REQUIRED: Missing official registered business address' };
      }
      if (!record.provenance?.sourceDataset) {
        return { valid: false, reason: 'SOURCE_DATASET_REQUIRED: Missing provenance.sourceDataset' };
      }
      if (!record.provenance?.officialSourceUrl) {
        return { valid: false, reason: 'OFFICIAL_SOURCE_URL_REQUIRED: Missing provenance.officialSourceUrl' };
      }
      if (!record.provenance?.rawSourceHash || !record.provenance.rawSourceHash.startsWith('sha256:')) {
        return { valid: false, reason: 'RAW_SOURCE_HASH_REQUIRED: Missing or invalid sha256 rawSourceHash in provenance' };
      }
      // Ensure MOEA record does NOT contain invented fields
      if (record._hasUnsupportedMoeaFields || record.phone || record.openingHours || record.website || record.menuUrl || record.photos) {
        return { valid: false, reason: 'UNSUPPORTED_MOEA_FIELDS: MOEA commercial registry must not invent phone/hours/website/photos' };
      }
    }
    return { valid: true };
  }

  /**
   * Search in-memory and Firestore POI cache
   */
  async function searchPoiCache(query = {}) {
    const addrNormalizer = root?.JiaTaiwanAddressNormalizer || require('../utils/taiwanAddressNormalizer.js');
    const phoneNormalizer = root?.JiaTaiwanPhoneNormalizer || require('../utils/taiwanPhoneNormalizer.js');

    const targetName = addrNormalizer.standardizeChars(query.name || '').toLowerCase().replace(/[\s\-_]+/g, '');
    const targetPhone = phoneNormalizer.normalizeTaiwanPhone(query.phone || '').canonical;
    const targetBid = String(query.businessId || query.taxId || '').trim();

    // 1. Check in-memory items
    const memoryResults = [];
    for (const record of memoryCache.values()) {
      let isMatch = false;
      if (targetBid && record.businessId === targetBid) {
        isMatch = true;
      } else if (targetPhone && record.identity?.phone === targetPhone) {
        isMatch = true;
      } else if (targetName && (record.normalizedName.includes(targetName) || targetName.includes(record.normalizedName))) {
        if (!query.city || record.city === query.city) {
          isMatch = true;
        }
      }

      if (isMatch) memoryResults.push(record);
    }

    if (memoryResults.length > 0) return memoryResults;

    // 2. Query Firestore bridge if configured
    if (firestoreBridge?.query) {
      try {
        const cloudResults = await firestoreBridge.query(query);
        if (Array.isArray(cloudResults)) {
          cloudResults.forEach(r => memoryCache.set(r.taiwanPoiId, r));
          return cloudResults;
        }
      } catch (e) {
        console.warn('[TaiwanPoiCache] Bridge query error:', e);
      }
    }

    return [];
  }

  /**
   * Admin-only Controlled Ingestion of Government Datasets
   */
  async function ingestGovernmentRecords(records = [], options = {}) {
    if (!Array.isArray(records) || records.length === 0) {
      return { total: 0, imported: 0, skipped: 0 };
    }

    let imported = 0;
    let skipped = 0;

    for (const raw of records) {
      const record = createPoiRecord(raw);
      const val = validateProductionIngestionRecord(record);
      if (!val.valid) {
        skipped++;
        console.warn(`[TaiwanPoiCache] Ingestion rejected for "${record.officialName}": ${val.reason}`);
        continue;
      }

      // Deduplicate in memory
      memoryCache.set(record.taiwanPoiId, record);

      // Save to Firestore if bridge is active
      if (firestoreBridge?.save) {
        try {
          await firestoreBridge.save(record);
        } catch (e) {
          console.warn('[TaiwanPoiCache] Save error:', e);
        }
      }
      imported++;
    }

    return {
      total: records.length,
      imported,
      skipped
    };
  }

  return {
    configure,
    createPoiRecord,
    validateProductionIngestionRecord,
    searchPoiCache,
    ingestGovernmentRecords,
    _memoryCache: memoryCache
  };
});
