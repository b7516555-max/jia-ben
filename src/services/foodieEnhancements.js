(function (root) {
    'use strict';

    const RECENT_KEY = 'jia_ben_recent_searches';
    const READ_KEY = 'jia_ben_notifications_read_at';
    const num = value => Number.isFinite(Number(value)) ? Number(value) : null;
    const coords = place => ({
        lat: num(place?.lat ?? place?.latitude ?? place?.geo?.lat),
        lng: num(place?.lng ?? place?.lon ?? place?.longitude ?? place?.geo?.lng)
    });

    function haversineKm(a, b) {
        const aa = coords(a), bb = coords(b);
        if (aa.lat == null || aa.lng == null || bb.lat == null || bb.lng == null) return null;
        const rad = Math.PI / 180;
        const dLat = (bb.lat - aa.lat) * rad, dLng = (bb.lng - aa.lng) * rad;
        const x = Math.sin(dLat / 2) ** 2 + Math.cos(aa.lat * rad) * Math.cos(bb.lat * rad) * Math.sin(dLng / 2) ** 2;
        return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    }

    function formatDistance(km) {
        const n = num(km);
        if (n == null) return '';
        return n < 1 ? `📍 ${Math.max(1, Math.round(n * 1000))}m` : `📍 ${n.toFixed(n < 10 ? 1 : 0)}km`;
    }

    function parseOpeningHours(value, now = new Date()) {
        if (!value) return '';
        const text = typeof value === 'string' ? value : JSON.stringify(value);
        const match = text.match(/(\d{1,2})\s*[:：]\s*(\d{2})\s*[-~～至]\s*(\d{1,2})\s*[:：]\s*(\d{2})/);
        if (!match) return '';
        const start = Number(match[1]) * 60 + Number(match[2]);
        const end = Number(match[3]) * 60 + Number(match[4]);
        const current = now.getHours() * 60 + now.getMinutes();
        const open = end < start ? current >= start || current <= end : current >= start && current <= end;
        return open ? '🟢 營業中' : '⚫ 已打烊';
    }

    function decoratePlace(place, location) {
        const distanceKm = location ? haversineKm(location, place) : num(place?.distanceKm ?? place?._distanceKm);
        const openingHours = place?.openingHours ?? place?.opening_hours ?? place?.hours;
        return { ...place, distanceKm, _distanceKm: distanceKm, distanceFormatted: formatDistance(distanceKm), openStatus: parseOpeningHours(openingHours) };
    }

    function sortPlaces(places, mode = 'recommended', location) {
        return [...(places || [])].map(p => decoratePlace(p, location)).sort((a, b) => {
            if (mode === 'distance') return (a._distanceKm ?? Infinity) - (b._distanceKm ?? Infinity);
            if (mode === 'rating') return Number(b.rating ?? b.communityStats?.ratingAverage ?? 0) - Number(a.rating ?? a.communityStats?.ratingAverage ?? 0);
            return Number(b.recommendationScore ?? b.score ?? 0) - Number(a.recommendationScore ?? a.score ?? 0);
        });
    }

    function readRecent(storage = root.localStorage, key = RECENT_KEY) {
        try { const value = JSON.parse(storage?.getItem(key) || '[]'); return Array.isArray(value) ? value.filter(Boolean) : []; } catch (_) { return []; }
    }
    function rememberSearch(term, storage = root.localStorage, key = RECENT_KEY) {
        const text = String(term || '').trim(); if (!text) return readRecent(storage, key);
        const next = [text, ...readRecent(storage, key).filter(item => item !== text)].slice(0, 8);
        try { storage?.setItem(key, JSON.stringify(next)); } catch (_) {}
        return next;
    }
    function clearRecentSearches(storage = root.localStorage, key = RECENT_KEY) { try { storage?.removeItem(key); } catch (_) {} return []; }

    function buildNotifications({ partyData = [], feedData = [], releaseVersion = '', storage = root.localStorage, now = Date.now() } = {}) {
        const items = [];
        (partyData || []).slice(-3).reverse().forEach((item, i) => items.push({ id: `party-${item.id || item.title || i}`, page: 'party', text: `🔥 ${item.title || '有新的揪團活動'}`, at: item.updatedAt || item.createdAt || now }));
        (feedData || []).slice(-3).reverse().forEach((item, i) => items.push({ id: `feed-${item.id || item.content || i}`, page: 'feed', text: `💬 ${item.creator || '吃貨朋友'} 有新的動態互動`, at: item.updatedAt || item.createdAt || now }));
        if (releaseVersion) items.unshift({ id: `release-${releaseVersion}`, page: 'creator', text: `✨ 呷奔更新啦 ${releaseVersion}`, at: now });
        const readAt = Number(storage?.getItem(READ_KEY) || 0) || 0;
        return { items, readAt, unreadCount: items.filter(item => new Date(item.at).getTime() > readAt).length };
    }
    function markNotificationsRead(storage = root.localStorage, timestamp = Date.now(), key = READ_KEY) { try { storage?.setItem(key, String(timestamp)); } catch (_) {} return timestamp; }

    function fallbackCard(canvas, place) {
        const ctx = canvas.getContext?.('2d'); if (!ctx) return canvas;
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, '#f97316'); gradient.addColorStop(1, '#fb7185'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff7ed'; ctx.textAlign = 'center'; ctx.font = 'bold 42px system-ui'; ctx.fillText('🍜', canvas.width / 2, 105);
        ctx.font = 'bold 28px system-ui'; ctx.fillText(String(place?.name || '呷奔好店').slice(0, 18), canvas.width / 2, 165);
        ctx.font = '18px system-ui'; ctx.fillText([place?.city, place?.category].filter(Boolean).join(' · ') || '今天吃這間', canvas.width / 2, 205);
        ctx.font = '14px system-ui'; ctx.fillText('呷奔 Jia-ben · 一起吃飯吧', canvas.width / 2, 270); return canvas;
    }
    function drawShareCard(place, { documentRef = root.document, imageUrl = '' } = {}) {
        const canvas = documentRef?.createElement?.('canvas'); if (!canvas) return Promise.reject(new Error('Canvas unavailable'));
        canvas.width = 900; canvas.height = 520; fallbackCard(canvas, place);
        if (!imageUrl) return Promise.resolve(canvas);
        return new Promise(resolve => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => { try { const ctx = canvas.getContext('2d'); ctx.globalAlpha = .3; ctx.drawImage(img, 0, 0, canvas.width, canvas.height); ctx.globalAlpha = 1; fallbackCard(canvas, place); } catch (_) { fallbackCard(canvas, place); } resolve(canvas); }; img.onerror = () => resolve(canvas); img.src = imageUrl; });
    }
    function downloadShareCard(canvas, filename = 'jia-ben-share.png', documentRef = root.document) { const link = documentRef?.createElement?.('a'); if (!link || !canvas?.toDataURL) return false; link.download = filename; link.href = canvas.toDataURL('image/png'); link.click(); return true; }

    function renderSkeleton(container, count = 4) { if (!container) return; container.innerHTML = Array.from({ length: count }, () => '<div class="jia-skeleton-card" aria-hidden="true"><div class="jia-skeleton-media"></div><div class="jia-skeleton-line w-3/4"></div><div class="jia-skeleton-line w-1/2"></div></div>').join(''); }
    function init() {
        const doc = root.document; if (!doc || root.__JIA_FOODIE_ENHANCEMENTS_READY) return; root.__JIA_FOODIE_ENHANCEMENTS_READY = true;
        renderSkeleton(doc.getElementById('home-for-you-container'), 4);
        renderSkeleton(doc.getElementById('explore-results-container'), 4);
        const input = doc.getElementById('explore-keyword'), panel = doc.getElementById('explore-search-suggestions');
        const renderSuggestions = () => { if (!panel) return; const recent = readRecent(); panel.innerHTML = `<div class="flex items-center justify-between"><strong>🕒 最近搜尋</strong><button type="button" data-clear-recent class="text-xs text-gray-400">全部清除</button></div><div class="flex flex-wrap gap-2 mt-2">${recent.map(item => `<button type="button" data-search-term="${String(item).replace(/"/g, '&quot;')}" class="rounded-full bg-orange-50 px-3 py-1 text-sm text-orange-700">${String(item).replace(/[<>&]/g, '')}</button>`).join('') || '<span class="text-sm text-gray-400">還沒有搜尋紀錄</span>'}</div><div class="mt-3 font-bold">🔥 大家都在找</div><div class="flex flex-wrap gap-2 mt-2">${['拉麵','咖啡','燒肉','宵夜','屏東市','鳳山'].map(item => `<button type="button" data-search-term="${item}" class="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">${item}</button>`).join('')}</div>`; };
        input?.addEventListener('focus', () => { renderSuggestions(); panel?.classList.remove('hidden'); });
        panel?.addEventListener('click', event => { const clear = event.target.closest('[data-clear-recent]'); if (clear) { clearRecentSearches(); renderSuggestions(); return; } const button = event.target.closest('[data-search-term]'); if (!button) return; input.value = button.dataset.searchTerm; rememberSearch(input.value); panel.classList.add('hidden'); root.searchGooglePlaces?.('explore'); });
        doc.addEventListener('click', event => { if (panel && !panel.parentElement?.contains(event.target)) panel.classList.add('hidden'); }, { passive: true });
        const initialNotifications = buildNotifications({ partyData: root.partyData, feedData: root.feedData, releaseVersion: root.JIA_BEN_VERSION });
        doc.getElementById('notification-unread-dot')?.classList.toggle('hidden', initialNotifications.unreadCount === 0);
        doc.getElementById('notification-bell')?.addEventListener('click', () => { const drawer = doc.getElementById('notification-drawer'); if (!drawer) return; const info = buildNotifications({ partyData: root.partyData, feedData: root.feedData, releaseVersion: root.JIA_BEN_VERSION }); doc.getElementById('notification-list').innerHTML = info.items.map(item => `<button type="button" data-notification-page="${item.page}" class="block w-full text-left p-3 border-b border-orange-50 text-sm hover:bg-orange-50">${item.text}</button>`).join('') || '<p class="p-4 text-sm text-gray-500">目前沒有新通知。</p>'; drawer.classList.toggle('hidden'); markNotificationsRead(); doc.getElementById('notification-unread-dot')?.classList.add('hidden'); });
        doc.getElementById('notification-list')?.addEventListener('click', event => { const item = event.target.closest('[data-notification-page]'); if (item) { doc.getElementById('notification-drawer')?.classList.add('hidden'); root.switchTab?.(item.dataset.notificationPage); } });
    }
    const api = { haversineKm, formatDistance, parseOpeningHours, decoratePlace, sortPlaces, readRecent, rememberSearch, clearRecentSearches, buildNotifications, markNotificationsRead, drawShareCard, downloadShareCard, fallbackCard, renderSkeleton, init };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.JiaFoodieEnhancements = api;
})(typeof window !== 'undefined' ? window : globalThis);
