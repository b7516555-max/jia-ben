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

    return {
      taiwanPoiId,
      source: raw.source || 'taiwan_open_data',
      businessId,
      foodRegistrationId,
      officialName,
      normalizedName,
      address: rawAddress,
      normalizedAddress: normAddr.formattedAddress,
      city: normAddr.city || raw.city || '',
      district: normAddr.district || raw.district || '',
      location: (raw.location && Number.isFinite(raw.location.lat) && Number.isFinite(raw.location.lng)) ? raw.location : null,
      phone: normPhone.formatted || rawPhone || '',
      openingHours: raw.openingHours || '',
      website: raw.website || '',
      menuUrl: raw.menuUrl || '',
      businessStatus: raw.businessStatus || '營業中',
      categories: Array.isArray(raw.categories) ? raw.categories : (raw.category ? [raw.category] : ['餐飲業']),
      sourceMetadata: {
        sourceName: raw.sourceMetadata?.sourceName || raw.source || 'Taiwan Open Data',
        sourceRecordId: raw.sourceMetadata?.sourceRecordId || businessId || foodRegistrationId || '',
        importedAt: raw.sourceMetadata?.importedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      identity: {
        phone: normPhone.canonical || '',
        formattedPhone: normPhone.formatted || '',
        businessId,
        addressHash: normAddr.formattedAddress
      }
    };
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
      if (!record.officialName) {
        skipped++;
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
    searchPoiCache,
    ingestGovernmentRecords,
    _memoryCache: memoryCache
  };
});
