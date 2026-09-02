(function () {
    'use strict';

    // 繁體中文餐飲與同義詞對照典
    const SYNONYM_MAP = {
        '拉麵': ['拉麵', 'ramen', '日式拉麵', '叉燒麵', '豚骨'],
        '咖啡': ['咖啡', 'coffee', 'cafe', '珈琲', '拿鐵', '美式', '甜點', '下午茶'],
        '燒肉': ['燒肉', 'yakiniku', '烤肉', '日式燒肉', '韓式烤肉', '炭火燒肉'],
        '火鍋': ['火鍋', 'hotpot', '鍋物', '涮涮鍋', '麻辣鍋', '小火鍋'],
        '早餐': ['早餐', '早午餐', 'brunch', 'breakfast', '蛋餅', '吐司'],
        '早午餐': ['早午餐', 'brunch', '早餐', 'breakfast'],
        '壽司': ['壽司', 'sushi', '生魚片', '日料', '握壽司', '日式料理'],
        '甜點': ['甜點', 'dessert', '蛋糕', '下午茶', '冰品', '飲料', '烘焙'],
        '義大利麵': ['義大利麵', 'pasta', '義式', 'spaghetti'],
        '披薩': ['披薩', 'pizza', '比薩'],
        '牛排': ['牛排', 'steak'],
        '漢堡': ['漢堡', 'burger', '美式漢堡']
    };

    function normalizeText(value) {
        return String(value || '')
            .normalize('NFKC')
            .toLowerCase()
            .replace(/[\s\-－_・·,，.。()（）【】\[\]]+/g, '');
    }

    function extractBrandCore(name) {
        if (!name) return '';
        let clean = String(name).normalize('NFKC').trim();
        clean = clean.replace(/[(（\[【][^)）\]】]*[)）\]】]/g, '');
        const suffixes = [
            '旗艦總店', '旗艦店', '創始總店', '創始店', '概念店', '總店',
            '分店', '一店', '二店', '三店', '門市',
            '站前店', '站前門市', '車站店', '高鐵店', '捷運店',
            '信義店', '敦南店', '忠孝店', '復興店', '中山店', '西門店',
            '三民店', '光復店', '中正店', '民族店', '民權店', '民生店',
            '成功店', '青年店', '大順店', '自由店', '博愛店', '裕誠店',
            '巨蛋店', '遠百店', 'SOGO店', '夢時代店', '義享店',
            '台北店', '台中店', '台南店', '高雄店', '屏東店', '新竹店', '桃園店'
        ];
        for (const s of suffixes) {
            if (clean.endsWith(s) && clean.length > s.length + 1) {
                clean = clean.slice(0, -s.length).trim();
                break;
            }
        }
        return normalizeText(clean);
    }

    function calculateDistanceKm(lat1, lng1, lat2, lng2) {
        if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
        const rad = x => x * Math.PI / 180;
        const dLat = rad(lat2 - lat1);
        const dLng = rad(lng2 - lng1);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
        return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function formatDistance(distanceKm) {
        if (distanceKm == null || !Number.isFinite(distanceKm)) return '';
        if (distanceKm < 1) {
            return `${Math.round(distanceKm * 1000)} m`;
        }
        return `${distanceKm.toFixed(1)} km`;
    }

    function expandSynonyms(query) {
        const normQ = normalizeText(query);
        const tokens = new Set([normQ]);
        for (const [key, synList] of Object.entries(SYNONYM_MAP)) {
            const normKey = normalizeText(key);
            const matchesKey = normQ.includes(normKey) || normKey.includes(normQ);
            const matchesSyn = synList.some(s => {
                const ns = normalizeText(s);
                return normQ.includes(ns) || ns.includes(normQ);
            });
            if (matchesKey || matchesSyn) {
                tokens.add(normKey);
                synList.forEach(s => tokens.add(normalizeText(s)));
            }
        }
        return Array.from(tokens).filter(Boolean);
    }

    function scorePlace(place, queryTokens, rawQuery, userLoc) {
        const nameNorm = normalizeText(place.name || '');
        const brandCore = extractBrandCore(place.name || '');
        const rawQNorm = normalizeText(rawQuery);
        const categories = (place.categories || []).map(normalizeText);
        const categoryStr = categories.join(' ');
        const address = normalizeText(place.address || '');
        const city = normalizeText(place.city || '');
        const district = normalizeText(place.district || '');

        let matchType = null;
        let score = 0;

        // 1. 完全相符 (Exact Name Match)
        if (nameNorm && nameNorm === rawQNorm) {
            score = 1000;
            matchType = 'exact';
        }
        // 2. 前綴相符 (Prefix Match)
        else if (nameNorm && rawQNorm && nameNorm.startsWith(rawQNorm)) {
            score = 800;
            matchType = 'prefix';
        }
        // 3. 正規化名稱相符或包含 (Normalized Containment)
        else if (nameNorm && rawQNorm && (nameNorm.includes(rawQNorm) || rawQNorm.includes(nameNorm))) {
            score = 600;
            matchType = 'normalized_name';
        }
        // 4. 品牌核心詞相符 (BrandCore Match)
        else if (brandCore && rawQNorm && (brandCore === rawQNorm || brandCore.includes(rawQNorm) || rawQNorm.includes(brandCore))) {
            score = 500;
            matchType = 'brand_core';
        }
        // 5. 分類/同義詞命中 (Category / Synonym Match)
        else {
            const hasCategoryOrSynMatch = queryTokens.some(token => {
                return categories.some(cat => cat.includes(token) || token.includes(cat)) || categoryStr.includes(token);
            });
            if (hasCategoryOrSynMatch) {
                score = 400;
                matchType = 'category_synonym';
            }
            // 6. 部分字詞/地址/地區命中 (Partial Match)
            else {
                const hasPartialMatch = queryTokens.some(token => {
                    return nameNorm.includes(token) || address.includes(token) || city.includes(token) || district.includes(token);
                });
                if (hasPartialMatch) {
                    score = 200;
                    matchType = 'partial';
                }
            }
        }

        if (!matchType && rawQuery) {
            return null; // 無任何關聯不列入
        }

        // 距離加權計算
        let distKm = null;
        if (userLoc && Number.isFinite(userLoc.lat) && Number.isFinite(userLoc.lng)) {
            const pLat = Number(place.location?.lat);
            const pLng = Number(place.location?.lng);
            distKm = calculateDistanceKm(userLoc.lat, userLoc.lng, pLat, pLng);
            if (distKm != null) {
                // 距離越近加權越高 (3km 內最高 +50，遞減)
                if (distKm <= 1) score += 50;
                else if (distKm <= 3) score += 35;
                else if (distKm <= 10) score += 20;
                else if (distKm <= 30) score += 10;
            }
        }

        // Jia-ben 社群評分加成 (若有)
        const ratingAvg = Number(place.communityStats?.ratingAverage || 0);
        const ratingCount = Number(place.communityStats?.ratingCount || 0);
        if (ratingAvg > 0 && ratingCount > 0) {
            score += Math.min(30, ratingAvg * 5 + Math.min(10, ratingCount));
        }

        return {
            place,
            score,
            matchType: matchType || 'default',
            distanceKm: distKm,
            distanceText: formatDistance(distKm)
        };
    }

    /**
     * Smart Search on Firebase Places
     * @param {Array} places - Array of jiaPlaces
     * @param {Object} options - { query, userLocation: {lat, lng}, country, city, minPrice, maxPrice, limit }
     * @returns {Array} Scored & ranked results
     */
    function search(places = [], options = {}) {
        const query = String(options.query || options.input || '').trim();
        const userLoc = options.userLocation || (Number.isFinite(options.lat) && Number.isFinite(options.lng) ? { lat: Number(options.lat), lng: Number(options.lng) } : null);
        const country = options.country && options.country !== 'all' ? options.country : null;
        const city = options.city && options.city !== 'all' && !options.city.startsWith('不限') ? options.city : null;
        const limit = Number(options.limit || 20);

        const queryTokens = query ? expandSynonyms(query) : [];

        let candidates = places;

        // 地區過濾
        if (country) {
            candidates = candidates.filter(p => (p.country || '台灣') === country);
        }
        if (city) {
            candidates = candidates.filter(p => (p.city || '') === city);
        }

        // 價位過濾 (若有設定)
        if (options.minPrice != null || options.maxPrice != null) {
            const minP = options.minPrice != null ? Number(options.minPrice) : 0;
            const maxP = options.maxPrice != null ? Number(options.maxPrice) : Infinity;
            candidates = candidates.filter(p => {
                const avgSpend = Number(p.communityStats?.averageSpend || 0);
                if (avgSpend > 0) {
                    return avgSpend >= minP && avgSpend <= maxP;
                }
                return true; // 尚無消費記錄則寬鬆保留
            });
        }

        const scoredResults = [];
        for (const place of candidates) {
            if (!query) {
                // 無關鍵字時提供基底清單
                let distKm = null;
                if (userLoc) {
                    distKm = calculateDistanceKm(userLoc.lat, userLoc.lng, Number(place.location?.lat), Number(place.location?.lng));
                }
                scoredResults.push({
                    place,
                    score: distKm != null ? Math.max(0, 500 - distKm * 10) : 100,
                    matchType: 'default',
                    distanceKm: distKm,
                    distanceText: formatDistance(distKm)
                });
            } else {
                const result = scorePlace(place, queryTokens, query, userLoc);
                if (result) scoredResults.push(result);
            }
        }

        // 排序：分數最高者優先；同分者距離近者優先
        scoredResults.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
            return 0;
        });

        return scoredResults.slice(0, limit);
    }

    const SmartSearch = {
        search,
        scorePlace,
        expandSynonyms,
        calculateDistanceKm,
        formatDistance,
        extractBrandCore,
        normalizeText,
        SYNONYM_MAP
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = SmartSearch;
    }
    if (typeof window !== 'undefined') {
        window.JiaSmartSearch = SmartSearch;
    }
})();
