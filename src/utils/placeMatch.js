(function(root,factory){
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JiaPlaceMatch = api;
})(typeof window !== 'undefined' ? window : null, function() {

  // Suffixes commonly found in Taiwan branch/store names
  const TAIWAN_STORE_SUFFIXES = [
    '總店', '本店', '分店', '旗艦店', '門市', '創始店', '創始總店', '概念店', '概念門市',
    '一店', '二店', '三店', '1店', '2店', '3店',
    '高雄店', '台南店', '屏東店', '嘉義店', '台北店', '新北店', '桃園店', '台中店', '新竹店', '花蓮店', '台東店',
    '南門總店', '南門店', '和平店', '大雅店', '苓雅總店', '苓雅店', '垂楊店', '屏東直營店', '直營店',
    '黃車', '白車'
  ];

  function normalizeName(value) {
    return String(value || '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\s\-－_・·,，.。()（）【】\[\]「」『』]+/g, '');
  }

  function getBrandCoreName(value) {
    let norm = normalizeName(value);
    if (!norm) return '';
    const sortedSuffixes = [...TAIWAN_STORE_SUFFIXES].sort((a, b) => b.length - a.length);
    for (const suffix of sortedSuffixes) {
      const cleanSuffix = normalizeName(suffix);
      if (norm.length > cleanSuffix.length && norm.endsWith(cleanSuffix)) {
        norm = norm.slice(0, -cleanSuffix.length);
      }
    }
    return norm;
  }

  function similarity(a, b) {
    const normA = normalizeName(a);
    const normB = normalizeName(b);
    if (!normA || !normB) return 0;
    if (normA === normB) return 1.0;

    const coreA = getBrandCoreName(a);
    const coreB = getBrandCoreName(b);
    if (coreA && coreB && coreA === coreB) {
      return 0.95; // Core brand exact match
    }

    if (normA.includes(normB) || normB.includes(normA)) {
      const ratio = Math.min(normA.length, normB.length) / Math.max(normA.length, normB.length);
      if (coreA && coreB && (normA.startsWith(coreB) || normB.startsWith(coreA))) {
        return Math.max(ratio, 0.90);
      }
      return ratio;
    }

    const x = new Set(normA), y = new Set(normB);
    const n = [...x].filter(c => y.has(c)).length;
    return (2 * n) / (x.size + y.size || 1);
  }

  function distanceMeters(a, b) {
    const lat1 = Number(a?.lat ?? a?.latitude);
    const lng1 = Number(a?.lng ?? a?.longitude);
    const lat2 = Number(b?.lat ?? b?.latitude);
    const lng2 = Number(b?.lng ?? b?.longitude);
    if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
    const r = x => (x * Math.PI) / 180;
    const dLat = r(lat2 - lat1);
    const dLng = r(lng2 - lng1);
    const q = Math.sin(dLat / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
  }

  function scoreMatch(place, candidate) {
    const nameSim = similarity(place?.name, candidate?.name);
    const rawDist = distanceMeters(place?.location || place, candidate?.location || candidate);
    // If distance cannot be computed (e.g. proxy did not expose raw coordinates), default to nominal 20m
    const dist = rawDist !== null ? rawDist : 20;

    const coreA = getBrandCoreName(place?.name);
    const coreB = getBrandCoreName(candidate?.name);
    const isBrandCoreExact = Boolean(coreA && coreB && coreA === coreB);

    let distScore = 0;
    if (dist <= 100) distScore = 1.0;
    else if (dist <= 300) distScore = 0.8;
    else if (dist <= 500) distScore = 0.5;
    else distScore = 0.1;

    let confidence = Number((nameSim * 0.55 + distScore * 0.45).toFixed(2));
    if (isBrandCoreExact && dist <= 100) {
      confidence = Math.max(confidence, 0.96);
    }

    // Hard safety guards:
    // 1. If distance > 1000m -> reject
    // 2. If nameSim < 0.60 -> reject
    if (dist > 1000 || nameSim < 0.60) {
      confidence = Math.min(confidence, 0.65);
    }

    return {
      nameSimilarity: Number(nameSim.toFixed(3)),
      brandCoreA: coreA,
      brandCoreB: coreB,
      isBrandCoreExact,
      distance: Math.round(dist),
      confidence,
      acceptable: confidence >= 0.88,
      canAutoWrite: confidence >= 0.90 && dist <= 300
    };
  }

  function acceptable(place, candidate) {
    const res = scoreMatch(place, candidate);
    return {
      nameSimilarity: res.nameSimilarity,
      distance: res.distance,
      confidence: res.confidence,
      accepted: res.acceptable,
      canAutoWrite: res.canAutoWrite
    };
  }

  return {
    normalizeName,
    getBrandCoreName,
    similarity,
    distanceMeters,
    scoreMatch,
    acceptable
  };
});
