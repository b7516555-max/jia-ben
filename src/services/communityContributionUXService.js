/**
 * Community Contribution UX Service (src/services/communityContributionUXService.js)
 * 
 * Jia-ben 6.0J Phase 2A: Context-Aware Dynamic CTA, Structured Hours Helper, and Micro-Contribution State
 * 
 * Mandates:
 * 1. ZERO Production Firestore writes. Pure deterministic helper functions.
 * 2. Strict separation of fact fields (address, phone, openingHours, category) and experience fields (averageSpend, recommendedDishes, rating, reviews).
 * 3. Photo upload is strictly DEFERRED (no billing, no storage modification).
 * 4. Context-aware single CTA selection without hardcoded restaurant IDs.
 * 5. Respects existing conflicts (金溫州 phone, 手酒 openingHours) -> "回報最新資訊".
 * 6. User pending deduplication protection.
 * 7. Structured opening hours parsing, formatting, validation, and legacy compatibility.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else if (root) {
        root.JiaCommunityContributionUX = factory();
    }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const WEEKDAYS = [
        { key: 'monday', label: '週一', short: '一' },
        { key: 'tuesday', label: '週二', short: '二' },
        { key: 'wednesday', label: '週三', short: '三' },
        { key: 'thursday', label: '週四', short: '四' },
        { key: 'friday', label: '週五', short: '五' },
        { key: 'saturday', label: '週六', short: '六' },
        { key: 'sunday', label: '週日', short: '日' }
    ];

    /**
     * Known conflicting place records requiring "回報最新資訊" CTA
     */
    const KNOWN_CONFLICT_CONFIG = {
        'jia_4a0aa04dc144b9d537ca': ['openingHours'], // 手酒咖啡 (13:00~23:00 vs 11:00~23:00 / 全年無休)
        'jia_2b7a7cf3a453a4336bdb': ['phone']          // 金溫州餛飩大王 (07 551 1378 vs 07-521-1398)
    };

    /**
     * Checks if a field on a place has a known conflict
     */
    function hasFieldConflict(place = {}, field = '') {
        const placeId = place.jiaPlaceId || place.id || '';
        if (KNOWN_CONFLICT_CONFIG[placeId] && KNOWN_CONFLICT_CONFIG[placeId].includes(field)) {
            return true;
        }
        if (Array.isArray(place.conflicts) && place.conflicts.includes(field)) {
            return true;
        }
        return false;
    }

    /**
     * Checks if address is genuinely complete using street-level criteria
     */
    function isAddressComplete(addressStr = '') {
        if (!addressStr || typeof addressStr !== 'string') return false;
        const trimmed = addressStr.trim();
        if (trimmed.length < 5) return false;
        // City-only check
        const cityOnly = /^(台灣|台北市|新北市|桃園市|台中市|台南市|高雄市|基隆市|新竹市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義市|嘉義縣|屏東縣|宜蘭縣|花蓮縣|台東縣|澎湖縣|金門縣|連江縣)$/;
        if (cityOnly.test(trimmed)) return false;
        // Postal code only or missing street/door number
        if (/^[^\d號]*\d{3,5}$/.test(trimmed)) return false;
        // Street/road/lane/alley/number check
        return /(路|街|道|巷|弄|村|里|號|攤|號之\d+)/.test(trimmed);
    }

    /**
     * Checks if phone is complete and valid Taiwan format
     */
    function isPhoneComplete(phoneStr = '') {
        if (!phoneStr || typeof phoneStr !== 'string') return false;
        const cleaned = phoneStr.replace(/[^\d+]/g, '');
        if (cleaned.length < 8) return false;
        if (/^09\d{8}$/.test(cleaned)) return true; // Mobile
        if (/^0[2-8]\d{7,8}$/.test(cleaned)) return true; // Landline
        if (/^\+886\d{8,9}$/.test(cleaned)) return true; // International
        return false;
    }

    /**
     * Checks if openingHours is genuinely present and populated
     */
    function isHoursComplete(hours) {
        if (!hours) return false;
        if (typeof hours === 'string') {
            const trimmed = hours.trim();
            if (trimmed.length <= 3) return false;
            if (trimmed === '未提供' || trimmed === '未知') return false;
            return true;
        }
        if (typeof hours === 'object') {
            const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
            for (const d of days) {
                if (Array.isArray(hours[d]) && hours[d].length > 0) return true;
                if (hours[d] && (hours[d].open || hours[d].closed)) return true;
            }
        }
        return false;
    }

    /**
     * Determines user pending contribution state for a place & field
     */
    function getUserPendingContribution(place = {}, field = '', userContributions = [], currentUid = '') {
        if (!Array.isArray(userContributions) || !currentUid) return null;
        const placeId = place.jiaPlaceId || place.id || '';
        const placeName = place.name || '';

        return userContributions.find(c => {
            const matchPlace = (c.jiaPlaceId && c.jiaPlaceId === placeId) || (c.placeName && c.placeName === placeName);
            const matchUser = c.uid === currentUid;
            const matchField = c.field === field;
            const isPending = c.status === 'pending';
            return matchPlace && matchUser && matchField && isPending;
        }) || null;
    }

    /**
     * Evaluates Primary Contribution CTA for a restaurant
     * 
     * Priority (Phase 2A without Photo upload):
     * 1. openingHours (Missing -> "回報營業時間", Conflict -> "回報最新營業時間")
     * 2. address (Missing -> "補詳細地址", Conflict -> "回報最新地址")
     * 3. phone (Missing -> "補上店家電話", Conflict -> "回報最新電話")
     * 4. recommendedDishes (Empty -> "推薦招牌菜色")
     * 5. averageSpend (Missing/0 -> "這餐花多少？")
     * 
     * @param {Object} place - Canonical or view-model place
     * @param {Object} options - { currentUid, userContributions, stats }
     * @returns {Object} CTA model
     */
    function getPrimaryContributionCTA(place = {}, options = {}) {
        const { currentUid = '', userContributions = [] } = options;

        // Check each field candidate in strict priority
        const candidates = [
            { field: 'openingHours', checkComplete: () => isHoursComplete(place.openingHours), missingLabel: '回報營業時間', conflictLabel: '回報最新營業時間', icon: 'fa-clock' },
            { field: 'address', checkComplete: () => isAddressComplete(place.address || place.formatted_address), missingLabel: '補詳細地址', conflictLabel: '回報最新地址', icon: 'fa-location-dot' },
            { field: 'phone', checkComplete: () => isPhoneComplete(place.phone), missingLabel: '補上店家電話', conflictLabel: '回報最新電話', icon: 'fa-phone' },
            {
                field: 'recommendedDishes',
                checkComplete: () => {
                    const stats = place.communityStats || {};
                    const dishes = stats.recommendedDishes || place.recommendedDishes || [];
                    return Array.isArray(dishes) && dishes.length > 0;
                },
                missingLabel: '推薦必吃菜色',
                conflictLabel: '推薦必吃菜色',
                icon: 'fa-utensils'
            },
            {
                field: 'averageSpend',
                checkComplete: () => {
                    const stats = place.communityStats || {};
                    return Number(stats.averageSpend || place.averageSpend || 0) > 0;
                },
                missingLabel: '這餐花多少？',
                conflictLabel: '這餐花多少？',
                icon: 'fa-coins'
            }
        ];

        for (const cand of candidates) {
            const hasConflict = hasFieldConflict(place, cand.field);
            const isComplete = cand.checkComplete();

            // If field is missing OR has an unresolved conflict
            if (!isComplete || hasConflict) {
                const pendingSub = getUserPendingContribution(place, cand.field, userContributions, currentUid);

                if (pendingSub) {
                    return {
                        field: cand.field,
                        label: '已回報確認中',
                        icon: 'fa-circle-check',
                        state: 'USER_PENDING',
                        disabled: true,
                        tooltip: `你已回報過${cand.missingLabel}，管理員確認後將自動更新。`
                    };
                }

                if (hasConflict) {
                    return {
                        field: cand.field,
                        label: cand.conflictLabel,
                        icon: cand.icon,
                        state: 'CONFLICT',
                        disabled: false,
                        tooltip: `店家既有${cand.missingLabel}可能有異動，歡迎回報最新現況。`
                    };
                }

                return {
                    field: cand.field,
                    label: cand.missingLabel,
                    icon: cand.icon,
                    state: 'MISSING',
                    disabled: false,
                    tooltip: `店家尚缺少${cand.missingLabel}，歡迎協助補充！`
                };
            }
        }

        // Place is complete on all core community fields
        return {
            field: 'complete',
            label: '資料完整好棒',
            icon: 'fa-circle-check',
            state: 'COMPLETE',
            disabled: true,
            tooltip: '這間店的基本資訊與社群回饋都很齊全囉！'
        };
    }

    /**
     * Creates default empty structured hours object
     */
    function createEmptyStructuredHours() {
        const obj = {};
        for (const day of WEEKDAYS) {
            obj[day.key] = [{ open: '', close: '', closed: false }];
        }
        return obj;
    }

    /**
     * Parses opening hours value (supporting structured object or legacy string)
     */
    function parseOpeningHours(input) {
        if (!input) {
            return {
                isStructured: false,
                hasStructure: false,
                confidence: 'LOWER_STRUCTURE_CONFIDENCE',
                structured: createEmptyStructuredHours(),
                rawText: ''
            };
        }

        if (typeof input === 'object' && !Array.isArray(input)) {
            const structured = {};
            let hasAnyValid = false;
            for (const day of WEEKDAYS) {
                const val = input[day.key];
                if (Array.isArray(val)) {
                    structured[day.key] = val.map(shift => ({
                        open: shift.open || shift.start || '',
                        close: shift.close || shift.end || '',
                        closed: Boolean(shift.closed || shift.isClosed)
                    }));
                    if (structured[day.key].length > 0) hasAnyValid = true;
                } else if (val && typeof val === 'object') {
                    structured[day.key] = [{
                        open: val.open || val.start || '',
                        close: val.close || val.end || '',
                        closed: Boolean(val.closed)
                    }];
                    hasAnyValid = true;
                } else {
                    structured[day.key] = [];
                }
            }
            return {
                isStructured: hasAnyValid,
                hasStructure: hasAnyValid,
                confidence: hasAnyValid ? 'HIGH_STRUCTURE_CONFIDENCE' : 'LOWER_STRUCTURE_CONFIDENCE',
                structured,
                rawText: formatStructuredHoursForDisplay(structured)
            };
        }

        // Legacy string
        const str = String(input).trim();
        const timeMatch = str.match(/(\d{1,2}:\d{2})\s*[-~至到]\s*(\d{1,2}:\d{2})/);
        if (timeMatch && (str.includes('週') || str.includes('每天') || str.includes('星期'))) {
            const open = timeMatch[1].padStart(5, '0');
            const close = timeMatch[2].padStart(5, '0');
            const structured = {};
            for (const day of WEEKDAYS) {
                structured[day.key] = [{ open, close, closed: false }];
            }
            return {
                isStructured: true,
                hasStructure: true,
                confidence: 'HIGH_STRUCTURE_CONFIDENCE',
                structured,
                rawText: str
            };
        }

        return {
            isStructured: false,
            hasStructure: false,
            confidence: 'LOWER_STRUCTURE_CONFIDENCE',
            structured: createEmptyStructuredHours(),
            rawText: str
        };
    }


    /**
     * Strict validation of structured opening hours
     */
    function validateStructuredOpeningHours(hoursObj) {
        if (!hoursObj || typeof hoursObj !== 'object') {
            return { valid: false, message: '營業時間必須為物件格式' };
        }

        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        const normalized = {};
        let activeDayCount = 0;

        for (const day of WEEKDAYS) {
            const shifts = Array.isArray(hoursObj[day.key]) ? hoursObj[day.key] : [];
            normalized[day.key] = [];

            if (shifts.length > 2) {
                return { valid: false, message: `${day.label} 最多僅支援 2 個營業時段` };
            }

            for (const s of shifts) {
                if (s.closed) {
                    normalized[day.key].push({ closed: true });
                    activeDayCount++;
                    continue;
                }

                const open = String(s.open || s.start || '').trim();
                const close = String(s.close || s.end || '').trim();

                if (!open && !close) continue;

                if (!timeRegex.test(open) || !timeRegex.test(close)) {
                    return { valid: false, message: `${day.label} 時段格式需為 HH:mm (例如: 11:30)，錯誤值: ${open} ~ ${close}` };
                }

                if (open === close) {
                    return { valid: false, message: `${day.label} 開始與結束時間不能相同 (${open})` };
                }

                normalized[day.key].push({ open, close, closed: false });
                activeDayCount++;
            }
        }

        if (activeDayCount === 0) {
            return { valid: false, message: '請至少設定一天的營業時間或標記公休' };
        }

        return { valid: true, normalized };
    }

    /**
     * Formats structured opening hours into natural language Taiwan display (e.g. for Admin or card)
     */
    function formatStructuredHoursForDisplay(hoursObj) {
        if (!hoursObj || typeof hoursObj !== 'object') return '';
        const lines = [];

        for (const day of WEEKDAYS) {
            const shifts = hoursObj[day.key] || [];
            if (shifts.length === 0) {
                lines.push(`${day.label}: 休息`);
                continue;
            }

            const isAllClosed = shifts.every(s => s.closed);
            if (isAllClosed) {
                lines.push(`${day.label}: 休息`);
                continue;
            }

            const activeShifts = shifts.filter(s => !s.closed && s.open && s.close);
            if (activeShifts.length === 0) {
                lines.push(`${day.label}: 休息`);
            } else {
                const shiftTexts = activeShifts.map(s => `${s.open}~${s.close}`);
                lines.push(`${day.label}: ${shiftTexts.join(' / ')}`);
            }
        }

        return lines.join(', ');
    }

    /**
     * Formats average spend display with single contributor safety
     */
    function formatAverageSpendDisplay(averageSpend = 0, spendCount = 0) {
        const num = Number(averageSpend);
        const count = Number(spendCount);
        if (!num || num <= 0) return '';
        if (count === 1) {
            return `1 位吃貨回報，人均約 NT$${Math.round(num)}`;
        }
        if (count >= 2) {
            return `社群回報人均約 NT$${Math.round(num)}`;
        }
        return `約 NT$${Math.round(num)} / 人`;
    }


    /**
     * Normalizes list of recommended dishes input (1-3 dishes)
     */
    function cleanRecommendedDishesInput(input) {
        let list = [];
        if (Array.isArray(input)) {
            list = input;
        } else if (typeof input === 'string') {
            list = input.split(/[,，、\n]+/);
        }
        const cleaned = list
            .map(s => String(s || '').trim().replace(/\s+/g, ' '))
            .filter(s => s.length >= 1 && s.length <= 30);
        return [...new Set(cleaned)].slice(0, 3);
    }

    return {
        WEEKDAYS,
        hasFieldConflict,
        isAddressComplete,
        isPhoneComplete,
        isHoursComplete,
        getUserPendingContribution,
        getPrimaryContributionCTA,
        createEmptyStructuredHours,
        parseOpeningHours,
        validateStructuredOpeningHours,
        formatStructuredHoursForDisplay,
        formatAverageSpendDisplay,
        cleanRecommendedDishesInput
    };
});


