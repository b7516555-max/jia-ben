/**
 * Taiwan Place Identity Resolver (src/services/taiwanPlaceIdentityResolver.js)
 * 
 * Determines whether candidate records from Taiwan Open Data (MOEA / TFDA), OSM,
 * Community contributions, or Official Web Sources represent the SAME physical restaurant.
 * 
 * Matching Signals:
 * - Normalized Name & Brand Core
 * - Exact Phone (Canonical Digits)
 * - Normalized Taiwan Address & City / District
 * - GPS Distance (meters)
 * - Business Registration ID (統一編號 / 商業登記)
 * - Food Registration ID (食品業者登錄字號)
 * - Official Website Domain
 * 
 * Confidence Thresholds:
 *   >= 0.93: AUTO MATCH
 *   0.85 - 0.929: REVIEW REQUIRED
 *   < 0.85: REJECT
 */
(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JiaTaiwanPlaceIdentityResolver = api;
})(typeof window !== 'undefined' ? window : null, function(root) {
  'use strict';

  // Common generic name keywords that MUST receive a heavy penalty if matched on name alone
  const GENERIC_NAMES = new Set([
    '大同', '老地方', '比薩屋', '小吃店', '麵店', '快餐', '便當', '早午餐', '牛肉麵', '火鍋',
    '咖啡店', '早餐店', '飲料店', '冰品店', '熱炒', '素食', '壽司', '日式料理', '居酒屋',
    '燒肉', '拉麵', '義大利麵', '甜點', '烘焙坊', '茶飲', '鹹酥雞', '滷味', '水餃'
  ]);

  function isGenericName(name) {
    if (!name) return true;
    const clean = String(name).trim().toLowerCase().replace(/[\s\-_・·,，.。()（）[\]【】]+/g, '').replace(/臺/g, '台');
    if (clean.length <= 2) return true;
    return GENERIC_NAMES.has(clean);
  }

  function extractDomain(url) {
    if (!url) return '';
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
      return parsed.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return '';
    }
  }

  function distanceMeters(a, b) {
    const lat1 = Number(a?.lat ?? a?.latitude ?? a?.location?.lat);
    const lng1 = Number(a?.lng ?? a?.longitude ?? a?.location?.lng);
    const lat2 = Number(b?.lat ?? b?.latitude ?? b?.location?.lat);
    const lng2 = Number(b?.lng ?? b?.longitude ?? b?.location?.lng);
    if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
    const r = x => (x * Math.PI) / 180;
    const dLat = r(lat2 - lat1);
    const dLng = r(lng2 - lng1);
    const q = Math.sin(dLat / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
  }

  /**
   * Extract branch indicator if present (e.g. "屏東店", "高雄建國店", "信義分店")
   */
  function extractBranchSuffix(name) {
    if (!name) return '';
    const match = String(name).match(/([^\s()（）]+(?:店|分店|門市|門營|旗艦店|壹號店|二號店))$/);
    return match ? match[1] : '';
  }

  /**
   * Evaluates match confidence between target place and candidate
   */
  function evaluateTaiwanMatch(target, candidate) {
    if (!target || !candidate) {
      return { confidence: 0, matchType: 'reject', acceptable: false, matchSignals: ['No data'] };
    }

    const addrNormalizer = root?.JiaTaiwanAddressNormalizer || require('../utils/taiwanAddressNormalizer.js');
    const phoneNormalizer = root?.JiaTaiwanPhoneNormalizer || require('../utils/taiwanPhoneNormalizer.js');

    const nameA = String(target.name || '').trim();
    const nameB = String(candidate.name || '').trim();
    const normA = addrNormalizer.standardizeChars(nameA).toLowerCase().replace(/[\s\-_・·,，.。()（）[\]【】:：]+/g, '');
    const normB = addrNormalizer.standardizeChars(nameB).toLowerCase().replace(/[\s\-_・·,，.。()（）[\]【】:：]+/g, '');

    // Branch separation check: If one has branch "屏東店" and other has "高雄店", strictly reject merge!
    const branchA = extractBranchSuffix(nameA);
    const branchB = extractBranchSuffix(nameB);
    if (branchA && branchB && branchA !== branchB) {
      return {
        confidence: 0.20,
        matchType: 'reject',
        acceptable: false,
        matchSignals: [`Different chain branches: "${branchA}" vs "${branchB}" (Physical places must remain separate)`]
      };
    }

    const matchSignals = [];
    let score = 0;

    // 1. Exact Business Registration ID (統一編號 / 商業登記)
    const bidA = String(target.businessId || target.taxId || target.sourceIds?.moea || '').trim();
    const bidB = String(candidate.businessId || candidate.taxId || candidate.sourceIds?.moea || '').trim();
    const hasExactBid = Boolean(bidA && bidB && bidA === bidB && bidA.length >= 8);
    if (hasExactBid) {
      score += 0.95;
      matchSignals.push(`Exact Business ID Match: ${bidA}`);
    }

    // 2. Exact Food Registration ID (食品業者登錄字號)
    const fidA = String(target.foodRegistrationId || target.sourceIds?.tfda || '').trim();
    const fidB = String(candidate.foodRegistrationId || candidate.sourceIds?.tfda || '').trim();
    const hasExactFid = Boolean(fidA && fidB && fidA === fidB && fidA.length >= 8);
    if (hasExactFid) {
      score += 0.95;
      matchSignals.push(`Exact Food Registration ID Match: ${fidA}`);
    }

    // 3. Exact Phone Match (Landline or Mobile)
    const phoneA = phoneNormalizer.normalizeTaiwanPhone(target.phone);
    const phoneB = phoneNormalizer.normalizeTaiwanPhone(candidate.phone);
    const hasExactPhone = Boolean(phoneA.valid && phoneB.valid && phoneA.canonical === phoneB.canonical);
    if (hasExactPhone) {
      score += 0.60;
      matchSignals.push(`Exact Phone Match: ${phoneA.formatted}`);
    }

    // 4. Exact Official Website Domain
    const domainA = extractDomain(target.website || target.officialWebsite);
    const domainB = extractDomain(candidate.website || candidate.url);
    const hasExactDomain = Boolean(domainA && domainB && domainA === domainB);
    if (hasExactDomain) {
      score += 0.40;
      matchSignals.push(`Exact Website Domain Match: ${domainA}`);
    }

    // 5. Name Similarity
    let nameSim = 0;
    if (normA && normB) {
      if (normA === normB) {
        nameSim = 1.0;
        score += 0.45;
        matchSignals.push('Exact Name Match');
      } else if (normA.includes(normB) || normB.includes(normA)) {
        const ratio = Math.min(normA.length, normB.length) / Math.max(normA.length, normB.length);
        nameSim = Math.max(ratio, 0.85);
        score += (0.45 * nameSim);
        matchSignals.push(`Partial Name Match (${(nameSim * 100).toFixed(0)}%)`);
      }
    }

    // 6. Address & Administrative Hierarchy
    const normAddrA = addrNormalizer.normalizeTaiwanAddress(target.address, target.city);
    const normAddrB = addrNormalizer.normalizeTaiwanAddress(candidate.address, candidate.city);
    
    let isSameCity = false;
    let isSameDistrict = false;
    if (normAddrA.city && normAddrB.city) {
      isSameCity = (normAddrA.city === normAddrB.city);
      if (isSameCity) {
        score += 0.10;
        matchSignals.push(`Same City: ${normAddrA.city}`);
      } else {
        // Different cities: apply severe penalty unless strong ID matches
        score -= 0.50;
        matchSignals.push(`Different Cities: ${normAddrA.city} vs ${normAddrB.city}`);
      }
    }

    if (normAddrA.district && normAddrB.district && isSameCity) {
      isSameDistrict = (normAddrA.district === normAddrB.district);
      if (isSameDistrict) {
        score += 0.15;
        matchSignals.push(`Same District: ${normAddrA.district}`);
      } else {
        score -= 0.25;
        matchSignals.push(`Different Districts: ${normAddrA.district} vs ${normAddrB.district}`);
      }
    }

    if (normAddrA.street && normAddrB.street && isSameDistrict) {
      const cleanStreetA = normAddrA.street.replace(/\s+/g, '');
      const cleanStreetB = normAddrB.street.replace(/\s+/g, '');
      if (cleanStreetA === cleanStreetB) {
        score += 0.35;
        matchSignals.push('Exact Street & Door Number Match');
      } else if (cleanStreetA.includes(cleanStreetB) || cleanStreetB.includes(cleanStreetA)) {
        score += 0.20;
        matchSignals.push('Partial Street Match');
      }
    }

    // 7. GPS Distance Signal
    const dist = distanceMeters(target, candidate);
    if (dist !== null) {
      if (dist <= 30) {
        score += 0.40;
        matchSignals.push(`Close GPS (${dist.toFixed(0)}m)`);
      } else if (dist <= 150) {
        score += 0.25;
        matchSignals.push(`Nearby GPS (${dist.toFixed(0)}m)`);
      } else if (dist > 1000) {
        // More than 1km away: severe penalty
        score -= 0.45;
        matchSignals.push(`Far GPS Distance (${(dist / 1000).toFixed(1)}km)`);
      }
    }

    // 8. Generic Name Penalty Guard
    if (isGenericName(nameA) || isGenericName(nameB)) {
      if (!hasExactBid && !hasExactFid && !hasExactPhone && (dist === null || dist > 100)) {
        score = Math.min(score, 0.65);
        matchSignals.push('Generic store name penalty applied (Requires exact phone/ID or close GPS to match)');
      }
    }

    // Cap confidence between 0 and 1.0
    const confidence = Number(Math.max(0, Math.min(1.0, score)).toFixed(3));

    let matchType = 'reject';
    let acceptable = false;

    if (confidence >= 0.93) {
      matchType = 'auto_match';
      acceptable = true;
    } else if (confidence >= 0.85) {
      matchType = 'review_required';
      acceptable = false;
    } else {
      matchType = 'reject';
      acceptable = false;
    }

    return {
      confidence,
      matchType,
      acceptable,
      distance: dist !== null ? Math.round(dist) : null,
      matchSignals
    };
  }

  return {
    GENERIC_NAMES,
    isGenericName,
    extractDomain,
    distanceMeters,
    extractBranchSuffix,
    evaluateTaiwanMatch
  };
});
