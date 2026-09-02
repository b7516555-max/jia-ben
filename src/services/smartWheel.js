(function () {
    'use strict';

    // 近期推薦歷史 (最多保留 10 筆，避免同 session 重複抽中)
    const recentHistory = [];
    const MAX_HISTORY = 10;

    function recordRecommendation(jiaPlaceId) {
        if (!jiaPlaceId) return;
        recentHistory.unshift(jiaPlaceId);
        if (recentHistory.length > MAX_HISTORY) {
            recentHistory.pop();
        }
    }

    function clearRecommendationHistory() {
        recentHistory.length = 0;
    }

    function calculateDistanceKm(lat1, lng1, lat2, lng2) {
        if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
        const rad = x => x * Math.PI / 180;
        const dLat = rad(lat2 - lat1);
        const dLng = rad(lng2 - lng1);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
        return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    /**
     * 計算店家之推薦權重
     * @param {Object} place - jiaPlace
     * @param {Object} context - { userLocation: {lat, lng}, maxDistanceKm, budgetRange, category, timeOfDay }
     * @returns {number} Final Recommendation Weight (> 0)
     */
    function calculateRecommendationWeight(place, context = {}) {
        let weight = 100.0; // 基礎基準分

        const pLat = Number(place.location?.lat);
        const pLng = Number(place.location?.lng);
        const userLoc = context.userLocation;
        let distKm = null;

        // 1. 距離因子 (Distance Factor)
        if (userLoc && Number.isFinite(userLoc.lat) && Number.isFinite(userLoc.lng) && Number.isFinite(pLat) && Number.isFinite(pLng)) {
            distKm = calculateDistanceKm(userLoc.lat, userLoc.lng, pLat, pLng);
            if (distKm != null) {
                const maxDist = context.maxDistanceKm ? Number(context.maxDistanceKm) : 10;
                if (distKm <= 1) {
                    weight *= 1.5; // 超近 (1km 內大幅加成)
                } else if (distKm <= 3) {
                    weight *= 1.25;
                } else if (distKm <= 5) {
                    weight *= 1.0;
                } else if (distKm <= maxDist) {
                    weight *= Math.max(0.3, 1.0 - (distKm / maxDist) * 0.5);
                } else {
                    weight *= 0.1; // 超過設定半徑給予嚴厲折損
                }
            }
        }

        // 2. 社群評分與評價數可信度 (Bayesian Confidence Rating)
        const stats = place.communityStats || {};
        const ratingAvg = Number(stats.ratingAverage || 0);
        const ratingCount = Number(stats.ratingCount || 0);

        if (ratingCount > 0 && ratingAvg > 0) {
            // 貝氏平滑：以 4.0 分為先驗基準，虛擬 2 則評價
            const bayesianRating = (ratingAvg * ratingCount + 4.0 * 2) / (ratingCount + 2);
            // 4.0 分為 1.0x，5.0 分為 1.4x，3.0 分為 0.7x
            const ratingMultiplier = Math.max(0.4, 0.2 + (bayesianRating / 4.0) * 0.8);
            weight *= ratingMultiplier;
        } else {
            // 無評價但提供探索加成 (冷啟動友善)
            weight *= 1.1; // 鼓勵探索未開箱店家
        }

        // 3. 預算契合度 (Budget Fit)
        if (context.budgetRange && context.budgetRange !== 'all') {
            const avgSpend = Number(stats.averageSpend || 0);
            if (avgSpend > 0) {
                if (context.budgetRange === 'under200' && avgSpend <= 200) weight *= 1.4;
                else if (context.budgetRange === '200to400' && avgSpend > 200 && avgSpend <= 400) weight *= 1.4;
                else if (context.budgetRange === '400to800' && avgSpend > 400 && avgSpend <= 800) weight *= 1.4;
                else if (context.budgetRange === 'above800' && avgSpend > 800) weight *= 1.4;
                else weight *= 0.3; // 不符合預算折損
            }
        }

        // 4. 分類契合度 (Category Fit)
        if (context.category && context.category !== 'all') {
            const categories = (place.categories || []).map(c => String(c).toLowerCase());
            const catTarget = String(context.category).toLowerCase();
            const matched = categories.some(c => c.includes(catTarget) || catTarget.includes(c)) || String(place.name).toLowerCase().includes(catTarget);
            if (matched) {
                weight *= 1.6;
            } else {
                weight *= 0.1; // 強制折損其他類別
            }
        }

        // 5. 避免連續推薦 (Recent Spin Penalty)
        const id = place.jiaPlaceId;
        const recentIndex = recentHistory.indexOf(id);
        if (recentIndex !== -1) {
            // 最近剛抽中過 (0: 上一次 -> 0.1x; 1: 上二次 -> 0.3x; 2: 上三次 -> 0.6x)
            const penalty = Math.min(0.8, 0.1 + recentIndex * 0.25);
            weight *= penalty;
        }

        return Math.max(0.1, weight);
    }

    /**
     * 依加權機率自候選名單中抽籤
     * @param {Array} candidates - Array of jiaPlaces
     * @param {Object} context - context
     * @returns {Object|null} Selected place
     */
    function selectWeightedWinner(candidates = [], context = {}) {
        if (!candidates || candidates.length === 0) return null;
        if (candidates.length === 1) return candidates[0];

        const weightedList = candidates.map(place => ({
            place,
            weight: calculateRecommendationWeight(place, context)
        }));

        const totalWeight = weightedList.reduce((sum, item) => sum + item.weight, 0);
        let randomVal = Math.random() * totalWeight;

        for (const item of weightedList) {
            randomVal -= item.weight;
            if (randomVal <= 0) {
                recordRecommendation(item.place.jiaPlaceId);
                return item.place;
            }
        }

        const fallback = weightedList[weightedList.length - 1].place;
        recordRecommendation(fallback.jiaPlaceId);
        return fallback;
    }

    /**
     * 取得輪盤候選店家 (最多 8 ~ 12 間)
     */
    function getWheelCandidates(places = [], context = {}) {
        if (!places || places.length === 0) return [];
        
        let filtered = [...places];

        // 距離篩選
        const userLoc = context.userLocation;
        if (userLoc && Number.isFinite(userLoc.lat) && Number.isFinite(userLoc.lng)) {
            filtered = filtered.map(p => {
                const dist = calculateDistanceKm(userLoc.lat, userLoc.lng, Number(p.location?.lat), Number(p.location?.lng));
                return { ...p, _distKm: dist };
            });

            if (context.maxDistanceKm && context.maxDistanceKm !== 'all') {
                const maxD = Number(context.maxDistanceKm);
                filtered = filtered.filter(p => p._distKm == null || p._distKm <= maxD);
            }
        }

        // 分類篩選
        if (context.category && context.category !== 'all') {
            const catTarget = String(context.category).toLowerCase();
            filtered = filtered.filter(p => {
                const categories = (p.categories || []).map(c => String(c).toLowerCase());
                return categories.some(c => c.includes(catTarget) || catTarget.includes(c)) || String(p.name).toLowerCase().includes(catTarget);
            });
        }

        // 預算篩選
        if (context.budgetRange && context.budgetRange !== 'all') {
            filtered = filtered.filter(p => {
                const avgSpend = Number(p.communityStats?.averageSpend || 0);
                if (avgSpend === 0) return true; // 保留尚未填寫預算店家
                if (context.budgetRange === 'under200') return avgSpend <= 200;
                if (context.budgetRange === '200to400') return avgSpend > 200 && avgSpend <= 400;
                if (context.budgetRange === '400to800') return avgSpend > 400 && avgSpend <= 800;
                if (context.budgetRange === 'above800') return avgSpend > 800;
                return true;
            });
        }

        if (filtered.length === 0) {
            filtered = [...places]; // 若過度嚴格則 fallback 全庫
        }

        // 計算各候選店家權重並由大到小取 top 10 ~ 12 間
        const scored = filtered.map(p => ({
            place: p,
            weight: calculateRecommendationWeight(p, context)
        }));

        scored.sort((a, b) => b.weight - a.weight);

        // 隨機在 Top 15 中選取 8~12 間增加輪盤豐富度
        const topPool = scored.slice(0, 16).map(s => s.place);
        // 洗牌取 8 ~ 12 間
        const shuffled = topPool.sort(() => 0.5 - Math.random());
        const count = Math.min(shuffled.length, 10);
        return shuffled.slice(0, count);
    }

    const SmartWheel = {
        calculateRecommendationWeight,
        selectWeightedWinner,
        getWheelCandidates,
        recordRecommendation,
        clearRecommendationHistory,
        calculateDistanceKm
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = SmartWheel;
    }
    if (typeof window !== 'undefined') {
        window.JiaSmartWheel = SmartWheel;
    }
})();
