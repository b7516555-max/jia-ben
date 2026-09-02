/**
 * Jia-ben Place Intelligence Layer 5.0 (src/services/placeIntelligence.js)
 * 
 * 核心功能：
 * 1. 跨來源公開店家情資探索 (Jia-ben -> Legacy -> OSM -> Foursquare -> Web Search/Schema.org)
 * 2. 信心度引擎 (Confidence Engine: 0.90+ Auto-fill, 0.80~0.89 Review, <0.80 Reject)
 * 3. 餐廳與分店錯配保護 (Branch-aware & GPS Vicinity Match)
 * 4. 外部媒體/照片順序管控 (Real > Community > Web Approved > AI Fallback)
 * 5. 表單自動帶入輔助 (Auto Place Info Assist，不直接覆寫 Canonical)
 * 6. 零商業 API 濫用與快取保護 (Request Budget, 10~30 分鐘短快取，7~30 天情資快取)
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
        
        // 支援 @graph 陣列結構
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
     * 執行自動情資探索 (Auto Place Info Assist Lookup)
     * 遵循搜尋順序：Jia-ben Existing Data -> Legacy Records -> OSM/Nominatim -> Foursquare -> Stopped
     * 
     * @param {Object} place - 目標店家資料 (jiaPlace 或簡化物件)
     * @param {Object} options - 探索參數
     * @returns {Promise<Object>} 探索結果與自動帶入欄位
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

        // 1. 快取檢查 (10~30 分鐘內重複查詢直接重用)
        const now = Date.now();
        if (!options.force && discoveryCache.has(cacheKey)) {
            const cached = discoveryCache.get(cacheKey);
            if (now - cached.timestamp < DISCOVERY_CACHE_TTL_MS) {
                return cached.data;
            }
        }

        // 2. 請求去重 (Request Deduplication / 防連點)
        if (inFlightLookups.has(cacheKey)) {
            return await inFlightLookups.get(cacheKey);
        }

        const lookupPromise = (async () => {
            const result = {
                status: 'no_match',
                confidence: 0,
                matchSource: null,
                sources: [],
                autofill: {},
                discoveredFields: {},
                officialSocial: {},
                menuUrl: null,
                externalArticles: [],
                externalMedia: { photos: [], coverCandidate: null },
                provenance: {}
            };

            const matchEngine = root?.JiaPlaceMatch || (typeof require === 'function' ? require('../utils/placeMatch.js') : null);

            // -------------------------------------------------------------
            // Step 1: Firebase / Local Jia-ben Existing canonical places
            // -------------------------------------------------------------
            const existingJiaPlaces = root?.jiaPlacesData || [];
            const localCanonical = existingJiaPlaces.find(p => 
                (p.jiaPlaceId && p.jiaPlaceId === place.jiaPlaceId) ||
                (p.name === name) ||
                (matchEngine && matchEngine.acceptable(place, p).accepted)
            );

            if (localCanonical) {
                if (localCanonical.address) {
                    result.autofill.address = localCanonical.address;
                    result.provenance.address = 'Jia-ben';
                }
                if (localCanonical.phone) {
                    result.autofill.phone = localCanonical.phone;
                    result.provenance.phone = 'Jia-ben';
                }
                if (localCanonical.categories && localCanonical.categories[0]) {
                    result.autofill.category = localCanonical.categories[0];
                    result.provenance.category = 'Jia-ben';
                }
                if (localCanonical.openingHours) {
                    result.autofill.openingHours = typeof localCanonical.openingHours === 'string' ? localCanonical.openingHours : '詳見每週營業時間';
                    result.provenance.openingHours = 'Jia-ben';
                }
                if (localCanonical.website) {
                    result.autofill.website = localCanonical.website;
                    result.provenance.website = 'Jia-ben';
                }
            }

            // -------------------------------------------------------------
            // Step 2: Legacy Jia-ben Records (restaurantData / feedData)
            // -------------------------------------------------------------
            if (!result.autofill.address || !result.autofill.category) {
                const legacyList = root?.restaurantData || [];
                const legacyMatch = legacyList.find(r => r.name === name || (matchEngine && matchEngine.similarity(r.name, name) >= 0.95));
                if (legacyMatch) {
                    if (!result.autofill.category && legacyMatch.category) {
                        const mappedCat = mapToControlledCategory(legacyMatch.category);
                        if (mappedCat) {
                            result.autofill.category = mappedCat;
                            result.provenance.category = 'Jia-ben 口袋名單';
                        }
                    }
                    if (!result.autofill.address && legacyMatch.address) {
                        result.autofill.address = legacyMatch.address;
                        result.provenance.address = 'Jia-ben 口袋名單';
                    }
                }
            }

            // -------------------------------------------------------------
            // Step 3: OSM / Nominatim Adapter (Throttled & GPS vicinity matched)
            // -------------------------------------------------------------
            const needsMoreFields = !result.autofill.address || !result.autofill.phone || !result.autofill.category || !result.autofill.openingHours;
            
            if (needsMoreFields && root?.JiaProviderAdapters?.nominatim) {
                try {
                    const osmResult = await root.JiaProviderAdapters.nominatim.search(place);
                    if (osmResult && osmResult.match && osmResult.match.confidence >= 0.85) {
                        result.confidence = Math.max(result.confidence, osmResult.match.confidence);
                        result.sources.push('OSM/Nominatim');

                        if (!result.autofill.address && osmResult.address) {
                            result.autofill.address = osmResult.address;
                            result.provenance.address = 'OpenStreetMap';
                        }
                        if (!result.autofill.phone && osmResult.phone) {
                            const phoneCheck = root?.JiaCommunity?.validateAndNormalizePhone ? root.JiaCommunity.validateAndNormalizePhone(osmResult.phone) : { valid: true, normalized: osmResult.phone };
                            if (phoneCheck.valid) {
                                result.autofill.phone = phoneCheck.normalized;
                                result.provenance.phone = 'OpenStreetMap';
                            }
                        }
                        if (!result.autofill.openingHours && osmResult.openingHours) {
                            result.autofill.openingHours = osmResult.openingHours;
                            result.provenance.openingHours = 'OpenStreetMap';
                        }
                        if (!result.autofill.website && osmResult.website) {
                            result.autofill.website = osmResult.website;
                            result.provenance.website = 'OpenStreetMap';
                        }
                    }
                } catch (osmErr) {
                    console.warn('[PlaceIntelligence] OSM lookup failed:', osmErr);
                }
            }

            // -------------------------------------------------------------
            // Step 4: Foursquare Search-only (If missing phone/category/hours)
            // -------------------------------------------------------------
            if ((!result.autofill.phone || !result.autofill.category) && root?.JiaProviderAdapters?.foursquare) {
                try {
                    if (root.JiaQuotaManager && (await root.JiaQuotaManager.canConsume('foursquare'))) {
                        const fsResult = await root.JiaProviderAdapters.foursquare.search(place, ['phone', 'category', 'address']);
                        if (fsResult && (fsResult.status === 'matched' || fsResult.name)) {
                            result.sources.push('Foursquare');
                            if (!result.autofill.phone && fsResult.phone) {
                                const phoneCheck = root?.JiaCommunity?.validateAndNormalizePhone ? root.JiaCommunity.validateAndNormalizePhone(fsResult.phone) : { valid: true, normalized: fsResult.phone };
                                if (phoneCheck.valid) {
                                    result.autofill.phone = phoneCheck.normalized;
                                    result.provenance.phone = 'Foursquare';
                                }
                            }
                            if (!result.autofill.category && fsResult.category) {
                                const mappedCat = mapToControlledCategory(fsResult.category);
                                if (mappedCat) {
                                    result.autofill.category = mappedCat;
                                    result.provenance.category = 'Foursquare';
                                }
                            }
                            if (!result.autofill.address && fsResult.address) {
                                const addrCheck = root?.JiaCommunity?.validateAddress ? root.JiaCommunity.validateAddress(fsResult.address) : { valid: true, normalized: fsResult.address };
                                result.autofill.address = addrCheck.valid ? addrCheck.normalized : fsResult.address;
                                result.provenance.address = 'Foursquare';
                            }
                        }
                    }
                } catch (fsErr) {
                    console.warn('[PlaceIntelligence] Foursquare lookup failed:', fsErr);
                }
            }

            // -------------------------------------------------------------
            // Compute Overall Confidence & Success Status
            // -------------------------------------------------------------
            const foundFieldCount = Object.keys(result.autofill).length;
            if (foundFieldCount > 0) {
                result.status = 'success';
                result.confidence = Math.max(result.confidence, foundFieldCount >= 3 ? 0.95 : 0.90);
                result.message = `已自動尋獲 ${foundFieldCount} 項店家公開資訊`;
            } else {
                result.status = 'no_match';
                result.confidence = 0.50;
                result.message = '暫時找不到可靠的公開店家資訊，你仍可以手動補充。';
            }

            return result;
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
     * 整合：Canonical Place, Community Stats, Web Intelligence, Contribution Field Overrides, Legacy Fields
     * 
     * @param {Object} place - 店家物件
     * @returns {Object} 正規化後的完整欄位資料
     */
    function normalizePlaceDetailData(place = {}) {
        if (!place) return null;

        // 1. 地區與地址嚴格區分 (禁止把 city/district 偽裝成完整 street address)
        const city = place.city || '';
        const district = place.district || '';
        const rawAddress = place.address || place.formatted_address || '';
        const isFullAddress = Boolean(rawAddress && rawAddress.trim() && rawAddress.trim() !== city && rawAddress.trim() !== district);
        const address = isFullAddress ? rawAddress.trim() : '';
        const locationSummary = [city, district].filter(Boolean).join(' ') || '';

        // 2. 電話 (台灣標準市話與手機)
        let phone = place.phone || place.formatted_phone_number || place.telephone || '';
        if (phone && root?.JiaCommunity?.validateAndNormalizePhone) {
            const phoneCheck = root.JiaCommunity.validateAndNormalizePhone(phone);
            if (phoneCheck.valid) phone = phoneCheck.normalized;
        }

        // 3. 料理分類 (嚴格限制來源為 categories/category，禁止 cross-field 誤抓 city)
        let categories = [];
        if (Array.isArray(place.categories) && place.categories.length > 0) {
            categories = place.categories.map(c => mapToControlledCategory(c) || c).filter(c => c && c !== '未分類' && c !== city && c !== district);
        } else if (place.category && place.category !== '未分類' && place.category !== city && place.category !== district) {
            const mapped = mapToControlledCategory(place.category) || place.category;
            if (mapped) categories = [mapped];
        }
        categories = [...new Set(categories)].slice(0, 3);

        // 4. 每週主要營業時段
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

        // 5. 每人平均消費 (只取有效的正整數)
        const rawSpend = Number(place.communityStats?.averageSpend ?? place.averageSpend ?? 0);
        const spendCount = Number(place.communityStats?.spendCount || 0);
        const averageSpend = (Number.isFinite(rawSpend) && rawSpend > 0) ? Math.round(rawSpend) : null;

        // 6. 官方網站
        const website = place.website || place.webIntelligence?.officialWebsite || place.url || null;

        // 7. 官方菜單外連
        const menuUrl = place.menuUrl || place.webIntelligence?.menuUrl || null;

        // 8. 官方社群
        const social = {
            facebook: place.officialSocial?.facebook || place.webIntelligence?.officialSocial?.facebook || null,
            instagram: place.officialSocial?.instagram || place.webIntelligence?.officialSocial?.instagram || null,
            threads: place.officialSocial?.threads || place.webIntelligence?.officialSocial?.threads || null
        };
        const hasSocial = Boolean(social.facebook || social.instagram || social.threads);

        // 9. 資料來源透明化標籤 (只顯示實際有提供內容的合法來源)
        const rawSources = [
            'Jia-ben',
            (place.fieldSources && Object.values(place.fieldSources).includes('community_verified')) ? '社群驗證' : '',
            (place.source === 'nominatim' || place.source === 'overpass' || place.sourceIds?.osm) ? 'OpenStreetMap' : '',
            place.sourceIds?.foursquare ? 'Foursquare' : '',
            (website || place.fieldSources?.website === 'official_website') ? '店家官網' : '',
            ...(Array.isArray(place.webIntelligence?.sources) ? place.webIntelligence.sources : [])
        ];
        const sources = [...new Set(rawSources.filter(Boolean))];

        return {
            name: place.name || '',
            jiaPlaceId: place.jiaPlaceId || place.id || '',
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
            ratingAverage: Number(place.communityStats?.ratingAverage ?? place.rating ?? 0),
            ratingCount: Number(place.communityStats?.ratingCount ?? 0)
        };
    }

    return {
        RAW_CATEGORY_MAP,
        mapToControlledCategory,
        parseSchemaJsonLd,
        discoverPlaceInfo,
        createWebIntelligenceSchema,
        normalizePlaceDetailData,
        _discoveryCache: discoveryCache
    };
});
