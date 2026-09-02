/**
 * Jia-ben Place Intelligence Layer 5.2 (src/services/placeIntelligence.js)
 * TW / US / JP / KR Multi-Provider Place + Review Resolver Engine
 * 
 * 核心功能：
 * 1. 跨國多 Provider 智慧情資分派 (CountryProviderRouter: TW, US, JP, KR)
 * 2. 跨來源實體識別引擎 (PlaceIdentityResolver: Confidence >= 0.93 Auto-match, 0.85~0.929 Review, <0.85 Reject)
 * 3. 獨立評論模型與防錯配機制 (ReviewResolver: Jia-ben 評分獨立，第三方評論保留 Attribution)
 * 4. 食記與外部探索整合 (DiscoveryResolver: Naver Blog 食記, 官網, 社群, 菜單)
 * 5. 通用常規店名防偽安全守護 (Generic Name Guard: 避免 "大同"、"Cafe" 誤配)
 * 6. 零商業 API 濫用與快取保護 (Request Budget, QuotaManager, 0 Google Calls)
 */
(function(root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.JiaPlaceIntelligence = api;
})(typeof window !== 'undefined' ? window : null, function(root) {
    'use strict';

    // 料理分類對應字典 (Provider Raw Category -> Jia-ben Controlled Category)
    const RAW_CATEGORY_MAP = {
        'cafe': '咖啡廳',
        'coffee': '咖啡廳',
        'coffee shop': '咖啡廳',
        'tea': '手搖茶飲',
        'tea room': '手搖茶飲',
        'bubble tea': '手搖茶飲',
        'bakery': '甜點/冰品',
        'dessert': '甜點/冰品',
        'ice cream': '甜點/冰品',
        'ramen': '拉麵',
        'ramen restaurant': '拉麵',
        'noodle': '麵食水餃',
        'noodles': '麵食水餃',
        'dumpling': '麵食水餃',
        'taiwanese': '台式料理',
        'taiwanese restaurant': '台式料理',
        'street food': '台灣小吃',
        'snack': '台灣小吃',
        'japanese': '日式料理',
        'japanese restaurant': '日式料理',
        'sushi': '壽司/日料',
        'sushi restaurant': '壽司/日料',
        'yakiniku': '日式燒肉',
        'bbq': '日式燒肉',
        'izakaya': '居酒屋',
        'korean': '韓式料理',
        'korean restaurant': '韓式料理',
        'korean bbq': '韓式烤肉',
        'hot pot': '火鍋/鍋物',
        'hotpot': '火鍋/鍋物',
        'shabu shabu': '火鍋/鍋物',
        'burger': '美式漢堡',
        'burger joint': '美式漢堡',
        'steak': '牛排',
        'steakhouse': '牛排',
        'pasta': '義大利麵',
        'italian': '義大利麵',
        'pizza': '披薩',
        'pizzeria': '披薩',
        'thai': '泰式料理',
        'thai restaurant': '泰式料理',
        'vietnamese': '越式料理',
        'chinese': '中式合菜',
        'chinese restaurant': '中式合菜',
        'dim sum': '港式飲茶',
        'breakfast': '早餐/早午餐',
        'brunch': '早餐/早午餐',
        'bar': '餐酒館/酒吧',
        'bistro': '餐酒館/酒吧',
        'pub': '餐酒館/酒吧',
        'vegetarian': '素食/蔬食',
        'vegan': '素食/蔬食',
        'fast food': '便當/快餐',
        'bento': '便當/快餐'
    };

    // 快取機制 (Memory Cache for on-demand lookups: 20 min)
    const discoveryCache = new Map();
    const DISCOVERY_CACHE_TTL_MS = 20 * 60 * 1000;
    const inFlightLookups = new Map();

    /**
     * 正規化類別到 Jia-ben 標準受控詞庫
     */
    function mapToControlledCategory(rawCategory) {
        if (!rawCategory) return '';
        const clean = String(rawCategory).trim().toLowerCase();
        
        // 1. 直接命中對應表
        if (RAW_CATEGORY_MAP[clean]) return RAW_CATEGORY_MAP[clean];

        // 2. 字典包含字串檢驗
        for (const [key, mapped] of Object.entries(RAW_CATEGORY_MAP)) {
            if (clean.includes(key) || key.includes(clean)) {
                return mapped;
            }
        }

        // 3. 若為現有受控字典中的中文
        const dict = root?.JiaCommunity?.CATEGORY_DICTIONARY || [];
        for (const cat of dict) {
            if (clean.includes(cat) || cat.includes(clean)) {
                return cat;
            }
        }

        return '';
    }

    /**
     * 結構化資料 / Schema.org 解析器 (Restaurant, FoodEstablishment, LocalBusiness)
     */
    function parseSchemaJsonLd(jsonLd) {
        if (!jsonLd || typeof jsonLd !== 'object') return null;
        
        const entities = Array.isArray(jsonLd['@graph']) ? jsonLd['@graph'] : (Array.isArray(jsonLd) ? jsonLd : [jsonLd]);
        const foodEntity = entities.find(e => {
            const type = String(e?.['@type'] || '').toLowerCase();
            return type.includes('restaurant') || type.includes('foodestablishment') || type.includes('localbusiness') || type.includes('cafe');
        });

        if (!foodEntity) return null;

        let address = '';
        if (typeof foodEntity.address === 'string') {
            address = foodEntity.address;
        } else if (foodEntity.address && typeof foodEntity.address === 'object') {
            address = [
                foodEntity.address.addressCountry,
                foodEntity.address.addressRegion,
                foodEntity.address.addressLocality,
                foodEntity.address.streetAddress
            ].filter(Boolean).join('');
        }

        let phone = foodEntity.telephone || '';
        let website = foodEntity.url || '';
        let menuUrl = foodEntity.menu || foodEntity.hasMenu || '';
        let cuisine = foodEntity.servesCuisine || '';
        let openingHours = foodEntity.openingHours || '';

        let image = '';
        if (typeof foodEntity.image === 'string') {
            image = foodEntity.image;
        } else if (Array.isArray(foodEntity.image) && foodEntity.image.length > 0) {
            image = typeof foodEntity.image[0] === 'string' ? foodEntity.image[0] : foodEntity.image[0]?.url;
        } else if (foodEntity.image?.url) {
            image = foodEntity.image.url;
        }

        return {
            name: foodEntity.name || '',
            address,
            phone,
            website,
            menuUrl,
            cuisine,
            openingHours: Array.isArray(openingHours) ? openingHours.join(', ') : openingHours,
            image,
            rawType: foodEntity['@type']
        };
    }

    /**
     * 執行多 Provider 餐廳實體解析 (Multi-Provider Place + Review Resolver - Phase 5.2)
     * 
     * @param {Object} query - 查詢條件 { name, country, city, address, location }
     * @param {Object} options - 選項
     * @returns {Promise<Object>} 解析結果包含 candidates, matchedCanonical, trace
     */
    async function resolveMultiProviderPlace(query, options = {}) {
        if (!query || !query.name) {
            return {
                status: 'invalid_query',
                candidates: [],
                existingMatch: null,
                trace: []
            };
        }

        const countryRouter = root?.JiaCountryRouter;
        const idResolver = root?.JiaPlaceIdentityResolver;
        const reviewResolver = root?.JiaReviewResolver;
        const discoveryResolver = root?.JiaDiscoveryResolver;
        const quotaManager = root?.JiaQuotaManager;

        const country = countryRouter ? countryRouter.normalizeCountryCode(query.country) : 'TW';
        const name = String(query.name).trim();
        const trace = [];

        trace.push({ step: 'init', country, queryName: name });

        // 1. 優先檢查現有 Jia-ben 資料庫 (0 external call)
        const existingJiaPlaces = root?.jiaPlacesData || [];
        const existingMatchCandidate = existingJiaPlaces.find(p => {
            if (idResolver) {
                const evalRes = idResolver.evaluateMatch(query, p, { country });
                return evalRes.canAutoMerge || evalRes.acceptable;
            }
            return p.name === name;
        });

        if (existingMatchCandidate) {
            trace.push({
                provider: 'Jia-ben',
                result: 'high_confidence_match',
                jiaPlaceId: existingMatchCandidate.jiaPlaceId
            });
            return {
                status: 'existing_match',
                existingMatch: existingMatchCandidate,
                candidates: [{
                    name: existingMatchCandidate.name,
                    address: existingMatchCandidate.address,
                    phone: existingMatchCandidate.phone,
                    category: existingMatchCandidate.categories?.[0] || existingMatchCandidate.category || '',
                    sources: ['Jia-ben'],
                    sourceIds: existingMatchCandidate.sourceIds || {},
                    confidence: 0.99,
                    isExistingJiaPlace: true,
                    jiaPlaceId: existingMatchCandidate.jiaPlaceId
                }],
                trace
            };
        }

        trace.push({ provider: 'Jia-ben', result: 'no_match' });

        // 2. 取得國家專屬 Provider 流水線
        const pipeline = countryRouter ? countryRouter.getCountryPipeline(country) : [{ id: 'osm', status: 'enabled' }];
        const collectedCandidates = [];
        let resolvedReviews = reviewResolver ? reviewResolver.createReviewModel({}) : {};
        let resolvedDiscovery = discoveryResolver ? discoveryResolver.createDiscoveryModel({}) : {};
        const fieldSources = {};

        for (const stage of pipeline) {
            if (!stage.canExecute) {
                trace.push({ provider: stage.id, status: stage.status, action: 'skipped' });
                continue;
            }

            // Quota 檢查
            if (quotaManager && !(await quotaManager.canConsume(stage.id))) {
                trace.push({ provider: stage.id, status: 'quota_exhausted', action: 'skipped' });
                continue;
            }

            const adapter = root?.JiaProviderAdapters?.[stage.id] || root?.JiaProviderAdapters?.[stage.id === 'taiwan_open_data' ? 'taiwanOpenData' : (stage.id === 'kakao_local' ? 'kakaoLocal' : (stage.id === 'naver_local' ? 'naverLocal' : (stage.id === 'naver_blog' ? 'naverBlog' : stage.id)))];

            if (!adapter || typeof adapter.search !== 'function' && typeof adapter.searchArticles !== 'function') {
                trace.push({ provider: stage.id, status: 'adapter_not_ready' });
                continue;
            }

            try {
                if (stage.id === 'naver_blog' && typeof adapter.searchArticles === 'function') {
                    const blogRes = await adapter.searchArticles(query);
                    if (blogRes && blogRes.articles?.length > 0) {
                        blogRes.articles.forEach(art => {
                            if (discoveryResolver) discoveryResolver.addFoodArticle(resolvedDiscovery, art);
                        });
                        if (reviewResolver) {
                            reviewResolver.attachExternalReview(resolvedReviews, 'naver_blog', { articleCount: blogRes.totalCount }, 0.95);
                        }
                        trace.push({ provider: 'naver_blog', status: 'success', articles: blogRes.articles.length });
                    }
                    continue;
                }

                const res = await adapter.search(query);
                if (res && res.name) {
                    const matchEval = idResolver ? idResolver.evaluateMatch(query, res, { country }) : { confidence: 0.90, acceptable: true };
                    trace.push({
                        provider: stage.id,
                        status: 'matched',
                        confidence: matchEval.confidence,
                        signals: matchEval.matchSignals
                    });

                    if (matchEval.acceptable) {
                        collectedCandidates.push({
                            ...res,
                            match: matchEval
                        });
                    }
                } else {
                    trace.push({ provider: stage.id, status: 'no_result' });
                }
            } catch (err) {
                trace.push({ provider: stage.id, status: 'error', error: err.toString() });
            }
        }

        // 3. 合併多 Provider 候選清單
        const finalCandidates = [];
        if (collectedCandidates.length > 0) {
            // Group by physical identity
            const topCandidate = collectedCandidates[0];
            const sources = [...new Set(collectedCandidates.map(c => c.provider || c.source))];
            
            // Build canonical candidate
            const canonicalCandidate = {
                name: topCandidate.name || query.name,
                address: collectedCandidates.find(c => c.address)?.address || query.address || '',
                phone: collectedCandidates.find(c => c.phone)?.phone || '',
                category: mapToControlledCategory(collectedCandidates.find(c => c.category || c.genre)?.category || collectedCandidates.find(c => c.category || c.genre)?.genre) || '未分類',
                location: collectedCandidates.find(c => c.location && c.location.lat)?.location || query.location || null,
                country,
                sources,
                sourceIds: Object.fromEntries(collectedCandidates.filter(c => c.provider && c.sourceId).map(c => [c.provider, c.sourceId])),
                confidence: topCandidate.match?.confidence || 0.90,
                externalReviews: resolvedReviews,
                discovery: resolvedDiscovery,
                fieldSources: {
                    name: topCandidate.provider || 'input',
                    address: collectedCandidates.find(c => c.address)?.provider || 'input',
                    phone: collectedCandidates.find(c => c.phone)?.provider || 'input'
                }
            };
            finalCandidates.push(canonicalCandidate);
        }

        return {
            status: finalCandidates.length > 0 ? 'success' : 'no_match',
            candidates: finalCandidates,
            existingMatch: null,
            trace
        };
    }

    /**
     * 執行自動情資探索 (Auto Place Info Assist Lookup - Backward compatible with Layer 5.0)
     */
    async function discoverPlaceInfo(place, options = {}) {
        if (!place || !place.name) {
            return {
                status: 'invalid_place',
                confidence: 0,
                autofill: null,
                message: '店家資料無效'
            };
        }

        const name = String(place.name).trim();
        const jiaPlaceId = place.jiaPlaceId || place.id || name;
        const cacheKey = `disc_${jiaPlaceId}_${(place.city || '')}`;

        const now = Date.now();
        if (!options.force && discoveryCache.has(cacheKey)) {
            const cached = discoveryCache.get(cacheKey);
            if (now - cached.timestamp < DISCOVERY_CACHE_TTL_MS) {
                return cached.data;
            }
        }

        if (inFlightLookups.has(cacheKey)) {
            return await inFlightLookups.get(cacheKey);
        }

        const lookupPromise = (async () => {
            const multiRes = await resolveMultiProviderPlace(place, options);

            if (multiRes.status === 'existing_match' && multiRes.existingMatch) {
                const em = multiRes.existingMatch;
                return {
                    status: 'success',
                    confidence: 0.98,
                    sources: ['Jia-ben'],
                    autofill: {
                        address: em.address || '',
                        phone: em.phone || '',
                        category: em.categories?.[0] || em.category || '',
                        openingHours: em.openingHours || '',
                        website: em.website || ''
                    },
                    provenance: {
                        address: 'Jia-ben',
                        phone: 'Jia-ben',
                        category: 'Jia-ben'
                    },
                    message: '已從 Jia-ben 資料庫載入現有資料'
                };
            }

            if (multiRes.candidates.length > 0) {
                const cand = multiRes.candidates[0];
                return {
                    status: 'success',
                    confidence: cand.confidence,
                    sources: cand.sources,
                    autofill: {
                        address: cand.address || undefined,
                        phone: cand.phone || undefined,
                        category: cand.category || undefined,
                        location: cand.location || undefined
                    },
                    externalReviews: cand.externalReviews,
                    discovery: cand.discovery,
                    provenance: cand.fieldSources,
                    message: `已自動尋獲 ${Object.keys(cand.fieldSources).length} 項店家公開資訊`
                };
            }

            // Fallback to legacy discovery if needed
            const legacyList = root?.restaurantData || [];
            const legacyMatch = legacyList.find(r => r.name === name);
            if (legacyMatch) {
                return {
                    status: 'success',
                    confidence: 0.92,
                    sources: ['Jia-ben 口袋名單'],
                    autofill: {
                        address: legacyMatch.address || undefined,
                        category: mapToControlledCategory(legacyMatch.category) || undefined
                    },
                    provenance: {
                        address: 'Jia-ben 口袋名單',
                        category: 'Jia-ben 口袋名單'
                    },
                    message: '已從口袋名單載入資料'
                };
            }

            return {
                status: 'no_match',
                confidence: 0.50,
                autofill: {},
                sources: [],
                provenance: {},
                message: '暫時找不到可靠的公開店家資訊，你仍可以手動補充。'
            };
        })();

        inFlightLookups.set(cacheKey, lookupPromise);

        try {
            const finalResult = await lookupPromise;
            discoveryCache.set(cacheKey, { timestamp: Date.now(), data: finalResult });
            return finalResult;
        } finally {
            inFlightLookups.delete(cacheKey);
        }
    }

    /**
     * 產生標準 Web Intelligence 資料結構 (Canonical Place Schema Extension)
     */
    function createWebIntelligenceSchema(initData = {}) {
        return {
            officialWebsite: initData.officialWebsite || null,
            officialSocial: {
                facebook: initData.officialSocial?.facebook || null,
                instagram: initData.officialSocial?.instagram || null,
                threads: initData.officialSocial?.threads || null
            },
            menuUrl: initData.menuUrl || null,
            structuredData: initData.structuredData || {},
            externalArticles: Array.isArray(initData.externalArticles) ? initData.externalArticles.slice(0, 5) : [],
            externalMedia: {
                coverCandidate: initData.externalMedia?.coverCandidate || null,
                photos: Array.isArray(initData.externalMedia?.photos) ? initData.externalMedia.photos : []
            },
            discoveredFields: {
                address: initData.discoveredFields?.address || null,
                phone: initData.discoveredFields?.phone || null,
                openingHours: initData.discoveredFields?.openingHours || null,
                categories: Array.isArray(initData.discoveredFields?.categories) ? initData.discoveredFields.categories : []
            },
            lastCheckedAt: new Date().toISOString(),
            sources: Array.isArray(initData.sources) ? initData.sources : [],
            confidence: Number.isFinite(initData.confidence) ? initData.confidence : 0.90
        };
    }

    /**
     * 統一店家詳情資料正規化 (Single Source of Truth for Place Detail View)
     */
    function normalizePlaceDetailData(place = {}) {
        if (!place) return null;

        const city = place.city || '';
        const district = place.district || '';
        const rawAddress = place.address || place.formatted_address || '';
        const isFullAddress = Boolean(rawAddress && rawAddress.trim() && rawAddress.trim() !== city && rawAddress.trim() !== district);
        const address = isFullAddress ? rawAddress.trim() : '';
        const locationSummary = [city, district].filter(Boolean).join(' ') || '';

        let phone = place.phone || place.formatted_phone_number || place.telephone || '';
        if (phone && root?.JiaCountryRouter?.normalizePhoneByCountry) {
            const phoneCheck = root.JiaCountryRouter.normalizePhoneByCountry(phone, place.country || 'TW');
            if (phoneCheck.valid) phone = phoneCheck.normalized;
        } else if (phone && root?.JiaCommunity?.validateAndNormalizePhone) {
            const phoneCheck = root.JiaCommunity.validateAndNormalizePhone(phone);
            if (phoneCheck.valid) phone = phoneCheck.normalized;
        }

        let categories = [];
        if (Array.isArray(place.categories) && place.categories.length > 0) {
            categories = place.categories.map(c => mapToControlledCategory(c) || c).filter(c => c && c !== '未分類' && c !== city && c !== district);
        } else if (place.category && place.category !== '未分類' && place.category !== city && place.category !== district) {
            const mapped = mapToControlledCategory(place.category) || place.category;
            if (mapped) categories = [mapped];
        }
        categories = [...new Set(categories)].slice(0, 3);

        let openingHours = '';
        let weekdayText = [];
        if (typeof place.openingHours === 'string' && place.openingHours.trim()) {
            openingHours = place.openingHours.trim();
        } else if (place.openingHours && typeof place.openingHours === 'object') {
            if (Array.isArray(place.openingHours.weekday_text)) {
                weekdayText = place.openingHours.weekday_text;
                openingHours = weekdayText[0] || '詳見每週營業時間';
            } else if (place.openingHours.text) {
                openingHours = place.openingHours.text;
            }
        } else if (place.opening_hours) {
            if (Array.isArray(place.opening_hours.weekday_text)) {
                weekdayText = place.opening_hours.weekday_text;
                openingHours = weekdayText[0] || '詳見每週營業時間';
            }
        }

        const rawSpend = Number(place.communityStats?.averageSpend ?? place.averageSpend ?? 0);
        const spendCount = Number(place.communityStats?.spendCount || 0);
        const averageSpend = (Number.isFinite(rawSpend) && rawSpend > 0) ? Math.round(rawSpend) : null;

        const website = place.website || place.webIntelligence?.officialWebsite || place.url || null;
        const menuUrl = place.menuUrl || place.webIntelligence?.menuUrl || null;

        const social = {
            facebook: place.officialSocial?.facebook || place.webIntelligence?.officialSocial?.facebook || null,
            instagram: place.officialSocial?.instagram || place.webIntelligence?.officialSocial?.instagram || null,
            threads: place.officialSocial?.threads || place.webIntelligence?.officialSocial?.threads || null
        };
        const hasSocial = Boolean(social.facebook || social.instagram || social.threads);

        const rawSources = [
            'Jia-ben',
            (place.fieldSources && Object.values(place.fieldSources).includes('community_verified')) ? '社群驗證' : '',
            (place.source === 'nominatim' || place.source === 'overpass' || place.sourceIds?.osm) ? 'OpenStreetMap' : '',
            place.sourceIds?.taiwanOpenData || place.sourceIds?.taiwan_open_data ? 'Taiwan Open Data' : '',
            place.sourceIds?.foursquare ? 'Foursquare' : '',
            place.sourceIds?.hotpepper ? 'Hot Pepper' : '',
            place.sourceIds?.kakao ? 'Kakao Local' : '',
            place.sourceIds?.naver ? 'Naver Local' : '',
            place.externalReviews?.naverBlog?.enabled ? 'Naver Blog' : '',
            (website || place.fieldSources?.website === 'official_website') ? '店家官網' : '',
            ...(Array.isArray(place.webIntelligence?.sources) ? place.webIntelligence.sources : [])
        ];
        const sources = [...new Set(rawSources.filter(Boolean))];

        return {
            name: place.name || '',
            jiaPlaceId: place.jiaPlaceId || place.id || '',
            country: place.country || 'TW',
            address,
            city,
            district,
            locationSummary,
            phone,
            categories,
            primaryCategory: categories[0] || '',
            openingHours,
            weekdayText,
            averageSpend,
            spendCount,
            website,
            menuUrl,
            social,
            hasSocial,
            sources,
            fieldSources: place.fieldSources || {},
            externalReviews: place.externalReviews || {},
            discovery: place.discovery || place.webIntelligence || {},
            ratingAverage: Number(place.communityStats?.ratingAverage ?? place.rating ?? 0),
            ratingCount: Number(place.communityStats?.ratingCount ?? 0)
        };
    }

    return {
        RAW_CATEGORY_MAP,
        mapToControlledCategory,
        parseSchemaJsonLd,
        resolveMultiProviderPlace,
        discoverPlaceInfo,
        createWebIntelligenceSchema,
        normalizePlaceDetailData,
        _discoveryCache: discoveryCache
    };
});
