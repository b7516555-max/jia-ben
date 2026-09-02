(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.JiaPersonalization = api;
    }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    /**
     * Build an implicit taste profile from user interactions without tedious questionnaires.
     * @param {Object} options - { userStates, reviews, pocketList, parties, places }
     * @returns {Object} Taste profile
     */
    function buildUserTasteProfile(options = {}) {
        const userName = options.userName || '';
        const userStates = options.userPlaceStates || options.userStates || {}; // { [jiaPlaceId]: { wantToEat, ate, visitCount, lastVisitedAt } }
        const reviews = (options.feedData || options.reviews || []).filter(item => !userName || item.creator === userName); // user's personal reviews
        const pocketList = (options.restaurantData || options.pocketList || []).filter(item => !userName || item.creator === userName); // user's added restaurants
        const parties = options.partyData || options.parties || []; // parties joined/voted
        const places = options.placesData || options.places || []; // all canonical places for reference

        const placeMap = new Map();
        places.forEach(p => {
            if (p.jiaPlaceId) placeMap.set(p.jiaPlaceId, p);
            if (p.name) placeMap.set(p.name, p);
        });

        const categoryScores = {}; // category -> { totalWeight, count, positiveCount, negativeCount }
        const favoriteCategories = {}; // category -> totalScore
        const spendHistory = [];
        const wantToEatList = [];
        const visitedList = [];
        let totalInteractions = 0;

        // 1. Process User Place States (Want to eat & Ate)
        for (const [placeId, state] of Object.entries(userStates)) {
            const place = placeMap.get(placeId);
            if (!place) continue;

            const cats = Array.isArray(place.categories) && place.categories.length > 0 ? place.categories : (place.category ? [place.category] : []);
            
            // Want to eat (+1.5 weight per category)
            if (state.wantToEat) {
                totalInteractions += 1;
                wantToEatList.push({ placeId, place });
                cats.forEach(c => {
                    categoryScores[c] = categoryScores[c] || { score: 0, positiveCount: 0, negativeCount: 0, count: 0 };
                    categoryScores[c].score += 1.5;
                    categoryScores[c].positiveCount += 1;
                    categoryScores[c].count += 1;
                });
            }

            // Ate (+2.0 weight + visitCount factor)
            if (state.ate || state.visitCount > 0) {
                const visits = Math.min(10, Math.max(1, Number(state.visitCount || 1)));
                totalInteractions += visits;
                visitedList.push({ placeId, place, visits, lastVisitedAt: state.lastVisitedAt });
                cats.forEach(c => {
                    categoryScores[c] = categoryScores[c] || { score: 0, positiveCount: 0, negativeCount: 0, count: 0 };
                    categoryScores[c].score += 2.0 + (visits - 1) * 0.8;
                    categoryScores[c].positiveCount += visits;
                    categoryScores[c].count += visits;
                });
            }
        }

        // 2. Process Personal Reviews & Ratings
        reviews.forEach(rev => {
            const place = rev.jiaPlaceId ? placeMap.get(rev.jiaPlaceId) : (rev.restaurantName ? placeMap.get(rev.restaurantName) : null);
            const cats = place ? (Array.isArray(place.categories) && place.categories.length > 0 ? place.categories : [place.category || '未分類']) : [rev.category || '未分類'];
            
            totalInteractions += 1;
            const ratingNum = rev.ratingNumeric || ({ super: 5, good: 4.5, tasty: 4, nice: 3.5, fair: 3, poor: 2, awful: 1.5, bad: 1 })[rev.rating] || 3;
            
            if (rev.perPersonSpend && Number.isFinite(rev.perPersonSpend)) {
                spendHistory.push(rev.perPersonSpend);
            }

            cats.forEach(c => {
                if (!c || c === '未分類') return;
                categoryScores[c] = categoryScores[c] || { score: 0, positiveCount: 0, negativeCount: 0, count: 0 };
                categoryScores[c].count += 1;
                if (ratingNum >= 4) {
                    categoryScores[c].score += (ratingNum - 3) * 1.8;
                    categoryScores[c].positiveCount += 1;
                } else if (ratingNum <= 2.5) {
                    categoryScores[c].score -= (3 - ratingNum) * 1.5; // Negative signal, doesn't blacklist
                    categoryScores[c].negativeCount += 1;
                }
            });
        });

        // 3. Process Pocket List
        pocketList.forEach(item => {
            const cats = Array.isArray(item.categories) && item.categories.length > 0 ? item.categories : [item.category || '未分類'];
            totalInteractions += 1;
            cats.forEach(c => {
                if (!c || c === '未分類') return;
                categoryScores[c] = categoryScores[c] || { score: 0, positiveCount: 0, negativeCount: 0, count: 0 };
                categoryScores[c].score += 1.2;
                categoryScores[c].positiveCount += 1;
                categoryScores[c].count += 1;
            });
        });

        // 4. Calculate Budget Preference (Robust range from spend history)
        let typicalSpendRange = null;
        if (spendHistory.length > 0) {
            spendHistory.sort((a, b) => a - b);
            const q1 = spendHistory[Math.floor(spendHistory.length * 0.25)];
            const q3 = spendHistory[Math.floor(spendHistory.length * 0.75)];
            const median = spendHistory[Math.floor(spendHistory.length * 0.5)];
            typicalSpendRange = {
                min: Math.max(50, Math.round(q1 * 0.8)),
                max: Math.round(q3 * 1.25),
                median: Math.round(median),
                sampleCount: spendHistory.length
            };
        }

        // 5. Rank top categories and populate favoriteCategories dict
        Object.entries(categoryScores).forEach(([cat, data]) => {
            favoriteCategories[cat] = Math.max(0, Number(data.score.toFixed(2)));
        });

        const topCategories = Object.entries(categoryScores)
            .filter(([_, data]) => data.count >= 1 && data.score > 0)
            .sort((a, b) => b[1].score - a[1].score)
            .map(([cat, data]) => ({
                category: cat,
                score: Number(data.score.toFixed(2)),
                affinity: data.score >= 5 ? 'high' : (data.score >= 2 ? 'medium-high' : 'medium'),
                count: data.count
            }));

        const isColdStart = totalInteractions < 2;

        return {
            userName,
            isColdStart,
            totalInteractions,
            categoryScores,
            favoriteCategories,
            topCategories,
            topCategoryNames: topCategories.map(c => c.category).slice(0, 5),
            typicalSpendRange,
            wantToEatList,
            visitedList
        };
    }

    /**
     * Calculate Personal Recommendation Weight with exploration balance (75% preference + 25% exploration)
     * @param {Object} place - Candidate jiaPlace
     * @param {Object} tasteProfile - User Taste Profile
     * @param {Object} context - { userLocation, maxDistanceKm, userPlaceStates, enabledPersonalization, excludeIds }
     * @returns {Object} { weight, reasons, scores }
     */
    function calculatePersonalRecommendationWeight(place = {}, tasteProfile = null, context = {}) {
        if (!place) return { weight: 0.1, reasons: [], baseWeight: 1 };

        let weight = 1.0;
        const reasons = [];
        const enabled = context.enabledPersonalization !== false;

        // A. Base community rating weight
        const stats = place.communityStats || {};
        const rating = Number(stats.ratingAverage || place.rating || 4.2);
        const ratingCount = Number(stats.ratingCount || place.user_ratings_total || 1);
        const ratingWeight = Math.min(1.8, Math.max(0.6, (rating / 5) * (1 + Math.log10(Math.min(100, ratingCount + 1)) * 0.2)));
        weight *= ratingWeight;

        // B. Distance Weight
        if (context.userLocation && Number.isFinite(place.location?.lat) && Number.isFinite(place.location?.lng)) {
            const dLat = (place.location.lat - context.userLocation.lat) * Math.PI / 180;
            const dLng = (place.location.lng - context.userLocation.lng) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                      Math.cos(context.userLocation.lat * Math.PI / 180) * Math.cos(place.location.lat * Math.PI / 180) *
                      Math.sin(dLng / 2) * Math.sin(dLng / 2);
            const distKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            
            if (distKm <= 1.0) {
                weight *= 1.35;
                if (reasons.length < 2) reasons.push(`距離你約 ${Math.round(distKm * 1000)}m`);
            } else if (distKm <= 3.0) {
                weight *= 1.15;
                if (reasons.length < 2) reasons.push(`距離你約 ${distKm.toFixed(1)} km`);
            } else if (distKm <= 6.0) {
                weight *= 0.95;
            } else {
                weight *= 0.7;
            }
        }

        // If personalization is disabled or profile is empty -> return generic recommendation
        if (!enabled || !tasteProfile || tasteProfile.isColdStart) {
            if (reasons.length === 0 && rating >= 4.5) {
                reasons.push('高評分人氣精選');
            }
            return { weight: Math.max(0.1, weight), reasons: reasons.slice(0, 2), genericOnly: true };
        }

        // C. Personal Want to eat Bonus (1.45x)
        const id = place.jiaPlaceId || place.id;
        const userState = context.userPlaceStates ? context.userPlaceStates[id] : null;

        if (userState?.wantToEat) {
            weight *= 1.45;
            reasons.push('你在想吃清單中收藏過這家店');
        }

        // D. Recent visit penalty (7 days: 0.4x, 30 days: 0.7x)
        if (userState?.ate) {
            if (userState.lastVisitedAt) {
                const daysAgo = (Date.now() - new Date(userState.lastVisitedAt).getTime()) / (1000 * 60 * 60 * 24);
                if (daysAgo <= 7) {
                    weight *= 0.4;
                } else if (daysAgo <= 30) {
                    weight *= 0.7;
                } else {
                    weight *= 0.9;
                }
            } else {
                weight *= 0.8;
            }
        } else if (!userState?.wantToEat && reasons.length < 2) {
            // Exploration signal
            if (Math.random() < 0.25) {
                reasons.push('你還沒吃過這間好店');
            }
        }

        // E. Category Taste Match
        const cats = Array.isArray(place.categories) && place.categories.length > 0 ? place.categories : (place.category ? [place.category] : []);
        let bestCategoryScore = 0;
        let matchedCategory = null;

        cats.forEach(c => {
            const cData = tasteProfile.categoryScores ? tasteProfile.categoryScores[c] : null;
            if (cData && cData.score > bestCategoryScore) {
                bestCategoryScore = cData.score;
                matchedCategory = c;
            }
        });

        if (matchedCategory && bestCategoryScore > 0) {
            const catMultiplier = Math.min(1.8, 1.0 + Math.log10(bestCategoryScore + 1) * 0.45);
            weight *= catMultiplier;
            if (reasons.length < 2 && !reasons.some(r => r.includes(matchedCategory))) {
                reasons.push(`符合你常吃的「${matchedCategory}」偏好`);
            }
        }

        // F. Spend / Budget fit match
        const avgSpend = Number(stats.averageSpend || 0);
        if (avgSpend > 0 && tasteProfile.typicalSpendRange) {
            const tr = tasteProfile.typicalSpendRange;
            if (avgSpend >= tr.min && avgSpend <= tr.max) {
                weight *= 1.25;
                if (reasons.length < 2) {
                    reasons.push(`符合你常見的 NT$${tr.min}～${tr.max} 預算`);
                }
            }
        }

        // G. Exploration Injection (25% Exploration to avoid filter bubbles)
        const explorationBonus = 0.85 + Math.random() * 0.3; // 0.85 ~ 1.15
        weight *= explorationBonus;

        if (reasons.length === 0) {
            reasons.push('為你精選的口袋推薦');
        }

        return {
            weight: Math.max(0.1, weight),
            totalWeight: Math.max(0.1, weight),
            reasons: reasons.slice(0, 2),
            reason: reasons[0] || '為你精選的口袋推薦',
            genericOnly: false
        };
    }

    /**
     * Fair Group Preference Aggregator for Parties
     * Normalizes each participant's taste profile before combining to prevent heavy users from dominating.
     * @param {Array} participantProfiles - Array of user taste profiles
     * @param {Object} place - Candidate jiaPlace
     * @returns {Object} { groupWeight, reasons }
     */
    function calculateGroupRecommendationWeight(participantProfiles = [], place = {}) {
        if (!participantProfiles || participantProfiles.length === 0) {
            return { groupWeight: 1.0, reasons: [] };
        }

        let combinedScore = 0;
        const matchedCats = new Set();
        const validProfiles = participantProfiles.filter(p => p && !p.isColdStart);

        if (validProfiles.length === 0) {
            return { groupWeight: 1.0, reasons: ['大家探索新口味'] };
        }

        validProfiles.forEach(prof => {
            const cats = Array.isArray(place.categories) && place.categories.length > 0 ? place.categories : [place.category || ''];
            let maxUserScore = 0;
            cats.forEach(c => {
                const score = prof.categoryScores?.[c]?.score || 0;
                if (score > maxUserScore) {
                    maxUserScore = score;
                    if (score > 1.5) matchedCats.add(c);
                }
            });
            // Normalized score per user [0, 1.5]
            const normalized = Math.min(1.5, maxUserScore / 5.0);
            combinedScore += (1.0 + normalized);
        });

        const avgGroupWeight = combinedScore / validProfiles.length;
        const reasons = [];
        if (matchedCats.size > 0) {
            reasons.push(`大家共同喜歡的 ${Array.from(matchedCats).slice(0, 2).join('、')}`);
        } else {
            reasons.push('聚會熱門推薦');
        }

        return {
            groupWeight: Math.max(0.2, avgGroupWeight),
            reasons
        };
    }

    /**
     * Select personalized Top Recommendations ("For You" 4~6 places)
     * @param {Array} places - Array of all jiaPlaces
     * @param {Object} tasteProfile - User Taste Profile
     * @param {Object} context - options
     * @returns {Array} List of top recommended places with reasons
     */
    function getForYouRecommendations(places = [], tasteProfile = null, context = {}, limitParam = 6) {
        if (!places || places.length === 0) return [];
        const limit = typeof context === 'number' ? context : (context?.limit || limitParam || 6);

        const scored = places.map(place => {
            const result = calculatePersonalRecommendationWeight(place, tasteProfile, typeof context === 'object' ? context : {});
            return {
                place,
                weight: result.weight,
                reasons: result.reasons
            };
        });

        scored.sort((a, b) => b.weight - a.weight);
        return scored.slice(0, limit).map(item => ({
            ...item.place,
            _recommendationReason: item.reasons[0] || '為你推薦',
            _recommendationReasons: item.reasons,
            _recommendationWeight: item.weight
        }));
    }

    return {
        buildUserTasteProfile,
        calculatePersonalRecommendationWeight,
        calculateGroupRecommendationWeight,
        getForYouRecommendations
    };
});
