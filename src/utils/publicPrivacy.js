(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(null);
    else if (root) root.JiaPublicPrivacy = factory(root);
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
    'use strict';

    const PRIVATE_GROUP_PATTERNS = /(玉泉|老服|社發|工作|公司|單位|機關|社區|住戶|同事|家族|部門|學校|班級|內部|私人)/i;
    const PUBLIC_GROUPS = Object.freeze({
        '屏東': '📍 屏東吃貨圈',
        '高雄': '📍 高雄美食圈',
        '台北': '📍 台北美食圈',
        '主揪': '🍽️ 呷奔吃貨團',
        '公開吃貨圈': '🍽️ 呷奔吃貨團'
    });
    const KNOWN_PUBLIC_NICKNAMES = new Set(['小雯', '小華', '阿凱', '小美']);

    function rawName(record) {
        if (typeof record === 'string') return record.trim();
        return String(record?.publicNickname || record?.name || record?.creator || record?.userName || '').trim();
    }
    function hash(value) {
        return Array.from(String(value || '')).reduce((n, ch) => ((n * 31) + ch.charCodeAt(0)) >>> 0, 7);
    }
    function isPrivateGroup(group) {
        return PRIVATE_GROUP_PATTERNS.test(String(group || '').trim());
    }
    function canSeePrivateGroup(group, context = {}) {
        if (!isPrivateGroup(group)) return true;
        if (context.isAdmin || root?.isAdminUnlocked === true) return true;
        const memberships = [].concat(context.privateGroups || context.memberships || root?.myIdentity?.privateGroups || []).map(String);
        return memberships.includes(String(group)) || String(context.currentGroup || root?.myIdentity?.group || '') === String(group);
    }
    function publicGroupLabel(group, context = {}) {
        const key = String(group || '').trim();
        if (!key) return '🍽️ 呷奔吃貨團';
        if (!canSeePrivateGroup(key, context)) return PUBLIC_GROUPS[key] || '🍽️ 呷奔吃貨團';
        return PUBLIC_GROUPS[key] || `📍 ${key}吃貨圈`;
    }
    function publicNickname(record, options = {}) {
        const explicit = typeof record === 'object' ? String(record.publicNickname || record.profile?.publicNickname || '').trim() : '';
        if (explicit) return explicit;
        const value = rawName(record);
        if (!value) return '匿名吃貨';
        if (KNOWN_PUBLIC_NICKNAMES.has(value)) return value;
        if (options.allowRaw && options.isSelf) return value;
        return `吃貨夥伴${String.fromCharCode(65 + (hash(value) % 26))}`;
    }
    function getPublicGroupOptions(groups, context = {}) {
        const seen = new Set();
        return ['公開吃貨圈', ...[].concat(groups || [])].filter(Boolean).map(value => ({ value: String(value), label: publicGroupLabel(value, context) })).filter(item => {
            if (seen.has(item.label)) return false;
            seen.add(item.label);
            return true;
        });
    }
    function resolveRawName(value, records = []) {
        const needle = String(value || '').trim();
        const match = [].concat(records || []).find(record => publicNickname(record) === needle || rawName(record) === needle);
        return match ? rawName(match) : needle;
    }
    return { isPrivateGroup, canSeePrivateGroup, publicGroupLabel, publicNickname, getPublicGroupOptions, resolveRawName };
});
