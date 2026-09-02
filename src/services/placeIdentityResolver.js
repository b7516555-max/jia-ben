/**
 * Place Identity Resolver (src/services/placeIdentityResolver.js)
 * 
 * Core intelligence engine that determines whether candidate records from different providers
 * represent the SAME physical restaurant across TW, US, JP, and KR.
 * Evaluates: normalizedName, brandCore, address, city, district, GPS distance, phone, website domain.
 * Confidence Thresholds:
 *   >= 0.93: AUTO MATCH
 *   0.85 - 0.929: REVIEW REQUIRED
 *   < 0.85: REJECT
 */
(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JiaPlaceIdentityResolver = api;
})(typeof window !== 'undefined' ? window : null, function(root) {
  'use strict';

  // Generic names that must NEVER be matched on name alone
  const GENERIC_NAMES = new Set([
    '大同', '老地方', '比薩屋', '小吃店', '麵店', '快餐', '便當', '早午餐', '牛肉麵',
    'coffee', 'cafe', 'restaurant', 'bar', 'bakery', 'pizza', 'bbq', 'diner',
    'ラーメン', '居酒屋', 'カフェ', '焼肉', '食堂', 'うどん',
    '식당', '카페', '맛집', '분식', '고기집', '치킨'
  ]);

  function isGenericName(name) {
    if (!name) return true;
    const clean = String(name).trim().toLowerCase().replace(/[\s\-_・·,，.。()（）]+/g, '');
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
   * Evaluates match confidence between target place and a candidate provider result
   */
  function evaluateMatch(target, candidate, options = {}) {
    const country = options.country || target?.country || 'TW';
    const router = root?.JiaCountryRouter;
    const matchEngine = root?.JiaPlaceMatch;

    const nameA = target?.name || '';
    const nameB = candidate?.name || '';
    const normA = router ? router.normalizeNameByCountry(nameA, country) : nameA.toLowerCase();
    const normB = router ? router.normalizeNameByCountry(nameB, country) : nameB.toLowerCase();

    // 1. Name similarity
    let nameSim = 0;
    if (normA && normB) {
      if (normA === normB) {
        nameSim = 1.0;
      } else if (normA.includes(normB) || normB.includes(normA)) {
        nameSim = Math.min(normA.length, normB.length) / Math.max(normA.length, normB.length);
        nameSim = Math.max(nameSim, 0.88);
      } else if (matchEngine) {
        nameSim = matchEngine.similarity(nameA, nameB);
      }
    }

    // 2. Phone match signal
    const phoneA = target?.phone || '';
    const phoneB = candidate?.phone || '';
    const normPhoneA = router ? router.normalizePhoneByCountry(phoneA, country).normalized : phoneA;
    const normPhoneB = router ? router.normalizePhoneByCountry(phoneB, country).normalized : phoneB;
    const isPhoneExact = Boolean(normPhoneA && normPhoneB && normPhoneA === normPhoneB);

    // 3. Website domain match signal
    const domainA = extractDomain(target?.website || target?.officialWebsite);
    const domainB = extractDomain(candidate?.website || candidate?.url);
    const isDomainExact = Boolean(domainA && domainB && domainA === domainB);

    // 4. GPS distance
    const dist = distanceMeters(target, candidate);

    // 5. Address / City / District signal
    const addrA = router ? router.normalizeAddressByCountry(target?.address || '', country) : (target?.address || '');
    const addrB = router ? router.normalizeAddressByCountry(candidate?.address || '', country) : (candidate?.address || '');
    const hasAddressOverlap = Boolean(addrA && addrB && (addrA.includes(addrB) || addrB.includes(addrA) || (addrA.slice(0, 8) === addrB.slice(0, 8))));

    const generic = isGenericName(nameA) || isGenericName(nameB);

    // Calculate score
    let score = nameSim * 0.50;
    const matchSignals = [];

    if (nameSim >= 0.95) matchSignals.push('exact_name');
    else if (nameSim >= 0.85) matchSignals.push('similar_name');

    if (dist !== null) {
      if (dist <= 100) {
        score += 0.40;
        matchSignals.push('gps_very_close');
      } else if (dist <= 300) {
        score += 0.28;
        matchSignals.push('gps_vicinity');
      } else if (dist <= 1000) {
        score += 0.10;
        matchSignals.push('gps_area');
      } else {
        // > 1000m GPS distance -> strong negative penalty
        score -= 0.35;
        matchSignals.push('gps_distant');
      }
    } else {
      // Default neutral GPS if not provided
      score += 0.20;
    }

    if (isPhoneExact) {
      score += 0.30;
      matchSignals.push('phone_exact');
    }

    if (isDomainExact) {
      score += 0.25;
      matchSignals.push('domain_exact');
    }

    if (hasAddressOverlap) {
      score += 0.20;
      matchSignals.push('address_overlap');
    }

    // Safety guard for Generic Names (e.g. "大同", "Coffee")
    if (generic) {
      if (!isPhoneExact && !isDomainExact && !hasAddressOverlap && (dist === null || dist > 200)) {
        score = Math.min(score, 0.60); // Hard clamp for generic names without supporting signals
        matchSignals.push('generic_name_safety_clamp');
      }
    }

    // Distance rejection: > 1000m without exact phone or domain must be rejected
    if (dist !== null && dist > 1000 && !isPhoneExact && !isDomainExact) {
      score = Math.min(score, 0.65);
    }

    const confidence = Number(Math.min(1.0, Math.max(0.0, score)).toFixed(3));
    let matchType = 'reject';
    if (confidence >= 0.93) {
      matchType = 'auto_match';
    } else if (confidence >= 0.85) {
      matchType = 'review_required';
    }

    return {
      confidence,
      matchType,
      acceptable: confidence >= 0.85,
      canAutoMerge: confidence >= 0.93,
      distance: dist !== null ? Math.round(dist) : null,
      nameSimilarity: Number(nameSim.toFixed(3)),
      isPhoneExact,
      isDomainExact,
      isGenericName: generic,
      matchSignals
    };
  }

  /**
   * Merges multi-provider candidate records for the same physical identity
   */
  function mergeProviderCandidates(candidates = [], target = {}, options = {}) {
    const mergedResults = [];
    const country = options.country || target?.country || 'TW';

    for (const cand of candidates) {
      const match = evaluateMatch(target, cand, { country });
      if (match.acceptable) {
        mergedResults.push({
          candidate: cand,
          match
        });
      }
    }

    // Sort by confidence desc, then distance asc
    mergedResults.sort((a, b) => {
      if (b.match.confidence !== a.match.confidence) {
        return b.match.confidence - a.match.confidence;
      }
      return (a.match.distance || 9999) - (b.match.distance || 9999);
    });

    return mergedResults;
  }

  return {
    GENERIC_NAMES,
    isGenericName,
    distanceMeters,
    evaluateMatch,
    mergeProviderCandidates
  };
});
