/**
 * Jia-ben Community Place Data Service (Phase 3)
 * 負責：
 * 1. 使用者餐廳狀態 (userPlaceStates: wantToEat, ate, visitCount, lastVisitedAt)
 * 2. 社群資料貢獻 (placeContributions: address, phone, openingHours, category, averageSpend)
 * 3. 健壯統計與異常值過濾 (Robust Trimmed Mean / Median)
 * 4. 貢獻驗證與審核機制 (pending / accepted / rejected / audit trail)
 * 5. 資料完整度計算 (calculatePlaceCompleteness)
 * 6. 權限防護 (Canonical Direct Write Blocked)
 */
(function () {
    'use strict';

    // 料理分類字典 (Jia-ben Controlled Category Dictionary)
    const CATEGORY_DICTIONARY = [
        '台式料理', '台灣小吃', '日式料理', '拉麵', '日式燒肉', '壽司/日料', '居酒屋',
        '韓式料理', '韓式烤肉', '美式漢堡', '牛排', '義大利麵', '披薩', '泰式料理',
        '越式料理', '中式合菜', '港式飲茶', '火鍋/鍋物', '早餐/早午餐', '咖啡廳',
        '甜點/冰品', '手搖茶飲', '餐酒館/酒吧', '素食/蔬食', '便當/快餐', '麵食水餃'
    ];

    /**
     * 輸入文字與資料淨化 (Sanitization)
     */
    function sanitizeText(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')
            .trim();
    }

    /**
     * 台灣電話格式驗證與正規化 (市話: 02-xxxx-xxxx / 07-xxx-xxxx, 手機: 09xx-xxx-xxx)
     */
    function validateAndNormalizePhone(phoneStr) {
        if (!phoneStr) return { valid: false, message: '電話號碼不能為空' };
        const cleaned = String(phoneStr).replace(/[^\d+]/g, '');
        
        // 台灣手機 09xxxxxxxx (10碼)
        if (/^09\d{8}$/.test(cleaned)) {
            const formatted = `${cleaned.slice(0, 4)}-${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
            return { valid: true, normalized: formatted, type: 'mobile' };
        }
        
        // 台灣雙北/基隆市話 02xxxxxxxx (9-10碼)
        if (/^02\d{7,8}$/.test(cleaned)) {
            const formatted = `${cleaned.slice(0, 2)}-${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
            return { valid: true, normalized: formatted, type: 'landline' };
        }

        // 台灣台中 04xxxxxxxx, 高雄 07xxxxxxxx, 台南 06xxxxxxxx, 桃園 03xxxxxxxx, 屏東 08xxxxxxxx (9-10碼)
        if (/^0[3-8]\d{7,8}$/.test(cleaned)) {
            const formatted = `${cleaned.slice(0, 2)}-${cleaned.slice(2, 5)}-${cleaned.slice(5)}`;
            return { valid: true, normalized: formatted, type: 'landline' };
        }

        // 帶 +886 國碼
        if (/^\+886\d{8,9}$/.test(cleaned)) {
            return { valid: true, normalized: cleaned, type: 'international' };
        }

        return { valid: false, message: '請輸入有效的台灣市話或手機號碼 (例如: 07-1234567 或 0912-345-678)' };
    }

    /**
     * 台灣地址驗證 (至少含縣市+路/街/巷/夜市/攤位描述，禁止單一縣市名)
     */
    function validateAddress(addressStr) {
        if (!addressStr || typeof addressStr !== 'string') {
            return { valid: false, message: '地址不能為空' };
        }
        const trimmed = addressStr.trim();
        if (trimmed.length < 5) {
            return { valid: false, message: '地址過短，請填寫完整門牌或清楚位置描述 (例如: 屏東市民族路夜市第32號攤)' };
        }
        // 不能只包含單一縣市名
        const cityOnly = /^(台灣|台北市|新北市|桃園市|台中市|台南市|高雄市|基隆市|新竹市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義市|嘉義縣|屏東縣|宜蘭縣|花蓮縣|台東縣|澎湖縣|金門縣|連江縣)$/;
        if (cityOnly.test(trimmed)) {
            return { valid: false, message: '不能只填寫縣市名稱，請提供路名、門牌或攤位' };
        }
        return { valid: true, normalized: sanitizeText(trimmed) };
    }

    /**
     * 營業時間結構驗證 (Monday~Sunday 多區間支援)
     */
    function validateOpeningHoursSchema(hoursObj) {
        if (!hoursObj || typeof hoursObj !== 'object') {
            return { valid: false, message: '營業時間格式不正確' };
        }
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        const normalized = {};
        for (const day of days) {
            const intervals = Array.isArray(hoursObj[day]) ? hoursObj[day] : [];
            normalized[day] = [];
            for (const item of intervals) {
                if (!item.open || !item.close) continue;
                const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
                if (!timeRegex.test(item.open) || !timeRegex.test(item.close)) {
                    return { valid: false, message: `時段格式需為 HH:mm (例如: 11:30)，錯誤值: ${item.open}-${item.close}` };
                }
                normalized[day].push({ open: item.open, close: item.close });
            }
        }
        return { valid: true, normalized };
    }

    /**
     * 消費金額驗證 (每人平均消費 1 ~ 100,000 整數)
     */
    function validateSpend(spend) {
        const num = Number(spend);
        if (!Number.isInteger(num)) {
            return { valid: false, message: '消費金額必須為整數' };
        }
        if (num < 1 || num > 100000) {
            return { valid: false, message: '請確認輸入的是每人平均消費金額 (NT$1 ~ 100,000)' };
        }
        return { valid: true, value: num };
    }

    /**
     * 健壯平均消費計算 (Trimmed Mean / Outlier Protected Mean)
     * @param {Array<number>} spendList - 使用者填寫的消費陣列
     * @returns {{ averageSpend: number, count: number }}
     */
    function calculateRobustAverageSpend(spendList = []) {
        const validList = spendList
            .map(Number)
            .filter(n => Number.isFinite(n) && n >= 1 && n <= 100000)
            .sort((a, b) => a - b);

        if (validList.length === 0) {
            return { averageSpend: 0, count: 0 };
        }
        if (validList.length === 1) {
            return { averageSpend: Math.round(validList[0]), count: 1 };
        }
        if (validList.length === 2) {
            return { averageSpend: Math.round((validList[0] + validList[1]) / 2), count: 2 };
        }

        // 當 >= 4 筆時，修剪前後 10% 極端值以防止惡意輸入（如 99999）摧毀平均
        if (validList.length >= 4) {
            const trimCount = Math.floor(validList.length * 0.15) || 1;
            const trimmed = validList.slice(trimCount, validList.length - trimCount);
            const sum = trimmed.reduce((acc, v) => acc + v, 0);
            return {
                averageSpend: Math.round(sum / trimmed.length),
                count: validList.length
            };
        }

        const sum = validList.reduce((acc, v) => acc + v, 0);
        return {
            averageSpend: Math.round(sum / validList.length),
            count: validList.length
        };
    }

    /**
     * 店家資料完整度計算 (Place Completeness Score 0~100)
     */
    function calculatePlaceCompleteness(place = {}) {
        let score = 0;
        const details = {
            hasPhoto: false,
            hasAddress: false,
            hasPhone: false,
            hasOpeningHours: false,
            hasCategory: false,
            hasRating: false,
            hasSpend: false
        };

        // 1. 照片 (25分)
        if (place.coverPhoto || (Array.isArray(place.communityPhotos) && place.communityPhotos.length > 0)) {
            score += 25;
            details.hasPhoto = true;
        }

        // 2. 地址 (20分)
        if (place.address && place.address.length >= 6) {
            score += 20;
            details.hasAddress = true;
        }

        // 3. 電話 (15分)
        if (place.phone && place.phone.length >= 7) {
            score += 15;
            details.hasPhone = true;
        }

        // 4. 營業時間 (15分)
        if (place.openingHours && (typeof place.openingHours === 'object' || (typeof place.openingHours === 'string' && place.openingHours.length > 3))) {
            score += 15;
            details.hasOpeningHours = true;
        }

        // 5. 料理分類 (10分)
        if (Array.isArray(place.categories) && place.categories.length > 0 && place.categories[0] !== '未分類') {
            score += 10;
            details.hasCategory = true;
        }

        // 6. 社群評分 (10分)
        if (Number(place.communityStats?.ratingCount) > 0) {
            score += 10;
            details.hasRating = true;
        }

        // 7. 平均消費 (5分)
        if (Number(place.communityStats?.averageSpend) > 0) {
            score += 5;
            details.hasSpend = true;
        }

        // 產生給一般使用者的自然語言提示
        const missingTips = [];
        if (!details.hasPhoto) missingTips.push('成為第一個分享照片的人');
        if (!details.hasOpeningHours) missingTips.push('補充營業時間');
        if (!details.hasPhone) missingTips.push('補充店家電話');
        if (!details.hasAddress) missingTips.push('補充詳細地址');
        if (!details.hasSpend) missingTips.push('分享每人消費');

        return {
            score,
            details,
            missingTips,
            isComplete: score >= 80
        };
    }

    /**
     * 建立貢獻紀錄物件
     */
    function createContributionRecord({ jiaPlaceId, uid, userName, field, value, note = '' }) {
        if (!jiaPlaceId || !uid || !field) {
            throw new Error('缺少必填貢獻參數 (jiaPlaceId, uid, field)');
        }
        return {
            contributionId: `contrib_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            jiaPlaceId,
            uid,
            userName: sanitizeText(userName || '熱心吃貨'),
            field, // 'address' | 'phone' | 'openingHours' | 'category' | 'photo'
            value,
            note: sanitizeText(note),
            status: 'pending', // 'pending' | 'accepted' | 'rejected'
            confidence: 1.0,
            createdAt: new Date().toISOString(),
            reviewedAt: null,
            reviewedBy: null
        };
    }

    /**
     * 審核並產生套用至 jiaPlaces 的安全 Partial PATCH
     */
    function applyContributionToPlace(canonicalPlace, contribution, reviewerUid) {
        if (!canonicalPlace || !contribution) {
            throw new Error('無效的店家或審核資料');
        }
        if (contribution.status !== 'pending' && contribution.status !== 'accepted') {
            throw new Error('該貢獻已被處理或無效');
        }

        const field = contribution.field;
        const updatedPlace = JSON.parse(JSON.stringify(canonicalPlace));
        if (!updatedPlace.fieldSources) updatedPlace.fieldSources = {};

        if (field === 'address') {
            updatedPlace.address = contribution.value;
            updatedPlace.fieldSources.address = 'community_verified';
        } else if (field === 'phone') {
            updatedPlace.phone = contribution.value;
            updatedPlace.fieldSources.phone = 'community_verified';
        } else if (field === 'openingHours') {
            updatedPlace.openingHours = contribution.value;
            updatedPlace.fieldSources.openingHours = 'community_verified';
        } else if (field === 'category') {
            const cats = Array.isArray(contribution.value) ? contribution.value : [contribution.value];
            updatedPlace.categories = [...new Set([...(updatedPlace.categories || []), ...cats])].slice(0, 3);
            updatedPlace.fieldSources.categories = 'community_verified';
        } else if (field === 'photo') {
            if (!Array.isArray(updatedPlace.communityPhotos)) updatedPlace.communityPhotos = [];
            if (!updatedPlace.communityPhotos.includes(contribution.value)) {
                updatedPlace.communityPhotos.unshift(contribution.value);
            }
            if (!updatedPlace.coverPhoto) updatedPlace.coverPhoto = contribution.value;
            updatedPlace.fieldSources.coverPhoto = 'community_verified';
        }

        updatedPlace.updatedAt = new Date().toISOString();
        updatedPlace.lastVerifiedContributionId = contribution.contributionId;

        // 審核紀錄
        const auditedContribution = {
            ...contribution,
            status: 'accepted',
            reviewedAt: new Date().toISOString(),
            reviewedBy: reviewerUid || 'admin'
        };

        return {
            updatedPlace,
            auditedContribution
        };
    }

    const CommunityService = {
        CATEGORY_DICTIONARY,
        sanitizeText,
        validateAndNormalizePhone,
        validateAddress,
        validateOpeningHoursSchema,
        validateSpend,
        calculateRobustAverageSpend,
        calculatePlaceCompleteness,
        createContributionRecord,
        applyContributionToPlace
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = CommunityService;
    }
    if (typeof window !== 'undefined') {
        window.JiaCommunity = CommunityService;
    }
})();
