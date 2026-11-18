(function (root) {
    'use strict';

    const CATEGORY_RULES = [
        { label: '麵食／小吃', terms: ['麵', '拉麵', '米粉', '小吃', '鹽酥雞', '餃子', '意麵', '烏龍'] },
        { label: '咖啡／甜點', terms: ['咖啡', '甜點', '蛋糕', '烘焙', '茶', '下午茶', '飲料', '早午餐'] },
        { label: '燒肉', terms: ['燒肉', '烤肉', '串燒', '炭烤', ' yakiniku'] },
        { label: '火鍋', terms: ['火鍋', '鍋物', '麻辣鍋', '壽喜燒'] },
        { label: '行動餐車', terms: ['餐車', '攤車', '行動攤販'], foodTruck: true }
    ];
    const CITY_TERMS = ['台北', '臺北', '新北', '桃園', '台中', '臺中', '台南', '臺南', '高雄', '基隆', '新竹', '嘉義', '苗栗', '彰化', '南投', '雲林', '屏東', '宜蘭', '花蓮', '台東', '臺東'];
    const safeText = value => String(value || '').replace(/\s+/g, ' ').trim();
    const searchable = place => safeText([place?.name, place?.city, place?.district, place?.address, place?.category, ...(place?.categories || [])].join(' ')).toLowerCase();
    const places = () => {
        const source = Array.isArray(root.jiaPlacesData) && root.jiaPlacesData.length ? root.jiaPlacesData : (root.restaurantData || []);
        return [...new Map(source.filter(Boolean).map(place => [place.jiaPlaceId || place.id || place.name, place])).values()];
    };
    function parseQuery(query) {
        const text = safeText(query);
        const lower = text.toLowerCase();
        const city = CITY_TERMS.find(term => lower.includes(term.toLowerCase())) || '';
        const category = CATEGORY_RULES.find(rule => rule.terms.some(term => lower.includes(term.toLowerCase()))) || null;
        const budgetMatch = text.match(/(?:nt\$?\s*)?(\d{2,6})\s*(?:元|塊|以下|內)?/i);
        return { raw: text, city, category: category?.label || '', categoryRule: category, budget: budgetMatch ? Number(budgetMatch[1]) : null };
    }
    function filterPlaces(query, source = places()) {
        const parsed = typeof query === 'string' ? parseQuery(query) : query;
        const scored = source.map(place => {
            const haystack = searchable(place);
            let score = 0;
            if (parsed.city && haystack.includes(parsed.city.toLowerCase())) score += 4;
            if (parsed.categoryRule?.foodTruck && (place.isFoodTruck || /餐車|攤車|行動攤販/.test(haystack))) score += 6;
            else if (parsed.categoryRule && parsed.categoryRule.terms.some(term => haystack.includes(term.toLowerCase()))) score += 5;
            if (parsed.budget != null) {
                const spend = Number(place.averageSpend || place.avgSpend || place.budget || 0);
                if (spend > 0 && spend <= parsed.budget) score += 3;
                else if (spend > parsed.budget) score -= 4;
            }
            if (parsed.raw && haystack.includes(parsed.raw.toLowerCase())) score += 5;
            return { place, score };
        }).filter(item => !parsed.city || searchable(item.place).includes(parsed.city.toLowerCase()))
            .filter(item => !parsed.categoryRule || item.score > 0)
            .sort((a, b) => b.score - a.score || String(a.place.name || '').localeCompare(String(b.place.name || ''), 'zh-Hant'));
        return scored.slice(0, 3).map(item => item.place);
    }
    function getGrowthState() {
        let states = root.userPlaceStates || {};
        try { states = Object.keys(states).length ? states : JSON.parse(localStorage.getItem('jia_user_place_states') || '{}'); } catch (_) {}
        const eaten = Object.values(states).filter(state => state?.ate).length;
        let interactions = 0;
        try { interactions = Number(localStorage.getItem('jia_lion_interactions') || 0); } catch (_) {}
        const total = eaten + interactions;
        const levels = total >= 15 ? { title: '傳說吃貨獅', next: 20 } : total >= 8 ? { title: '高屏美食王', next: 15 } : total >= 3 ? { title: '巷弄探險獅', next: 8 } : { title: '貪吃小獅', next: 3 };
        return { eaten, interactions, total, title: levels.title, progress: Math.min(100, Math.round((total / levels.next) * 100)), next: levels.next };
    }
    function bumpInteraction() {
        try { localStorage.setItem('jia_lion_interactions', String(Number(localStorage.getItem('jia_lion_interactions') || 0) + 1)); } catch (_) {}
    }
    function contextLine() {
        const title = root.document?.getElementById('app-header-title')?.textContent || '';
        if (title.includes('輪盤')) return '來到輪盤啦！要不要讓萊恩幫你轉出今天的命定美食？';
        if (title.includes('揪團')) return '揪團集合！萊恩幫你找一間大家比較容易一拍即合的店。';
        if (title.includes('動態')) return '看看大家最近吃了什麼，說不定下一餐靈感就在這裡！';
        if (title.includes('地圖')) return '地圖探險中，萊恩先縮小待命，不擋你的地圖操作。';
        return '嗨！我是萊恩。今天想吃什麼，交給我一起想想看！';
    }
    function escape(value) { return root.escapeHtml ? root.escapeHtml(value) : safeText(value).replace(/[<>&"]/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[char])); }
    function renderGrowth() {
        const growth = getGrowthState();
        const title = root.document?.getElementById('jia-lion-growth-title');
        const progress = root.document?.getElementById('jia-lion-progress');
        const stat = root.document?.getElementById('jia-lion-growth-stat');
        if (title) title.textContent = growth.title;
        if (progress) progress.style.width = `${growth.progress}%`;
        if (stat) stat.textContent = `吃過 ${growth.eaten} 間 · 互動 ${growth.interactions} 次`;
        return growth;
    }
    function renderResults(found, queryLabel) {
        const result = root.document?.getElementById('jia-lion-results');
        if (!result) return;
        if (!found.length) { result.innerHTML = `<div class="jia-lion-empty">找不到完全符合「${escape(queryLabel)}」的店，試試「高雄 燒肉 500」或按下面快捷鍵吧！</div>`; return; }
        result.innerHTML = `<p class="jia-lion-result-label">萊恩幫你挑了 ${found.length} 間</p>` + found.map(place => {
            const id = escape(place.jiaPlaceId || place.id || '');
            const name = escape(place.name || '未命名餐廳');
            const area = escape(place.city || place.district || place.address || '呷奔好店');
            const category = escape(place.categories?.[0] || place.category || '美食');
            return `<button type="button" class="jia-lion-result" data-lion-place-id="${id}"><span class="jia-lion-result-icon">🍽️</span><span class="min-w-0 text-left"><strong class="block truncate">${name}</strong><small>${area} · ${category}</small></span><i class="fa-solid fa-chevron-right ml-auto text-orange-400"></i></button>`;
        }).join('');
    }
    function refresh() { renderGrowth(); const welcome = root.document?.getElementById('jia-lion-context'); if (welcome) welcome.textContent = contextLine(); }
    function setOpen(open) {
        const shell = root.document?.getElementById('jia-lion');
        if (!shell) return;
        shell.classList.toggle('is-open', open);
        if (open) { bumpInteraction(); refresh(); }
    }
    function updateAvoidance() {
        const shell = root.document?.getElementById('jia-lion');
        if (!shell) return;
        const modalOpen = [...root.document.querySelectorAll('.modal-backdrop')].some(modal => !modal.classList.contains('hidden'));
        const mapOpen = !root.document.getElementById('jia-map-view')?.classList.contains('hidden') || new URLSearchParams(root.location?.search || '').get('page') === 'map' || root.document.body?.classList.contains('map-view-active');
        const shouldHide = modalOpen || mapOpen;
        shell.classList.toggle('is-compact', !mapOpen);
        shell.classList.toggle('is-hidden', shouldHide);
        if (shouldHide) shell.classList.remove('is-open');
    }
    function showNudge(message) {
        const bubble = root.document?.getElementById('jia-lion-nudge');
        if (!bubble) return;
        bubble.textContent = message;
        bubble.classList.add('is-visible');
        clearTimeout(showNudge.timer);
        showNudge.timer = setTimeout(() => bubble.classList.remove('is-visible'), 3000);
        refresh();
    }
    function init() {
        const shell = root.document?.getElementById('jia-lion');
        if (!shell || shell.dataset.bound) return;
        shell.dataset.bound = '1';
        shell.querySelector('[data-lion-toggle]')?.addEventListener('click', () => setOpen(!shell.classList.contains('is-open')));
        shell.querySelector('[data-lion-close]')?.addEventListener('click', () => setOpen(false));
        shell.querySelector('[data-lion-form]')?.addEventListener('submit', event => { event.preventDefault(); const input = shell.querySelector('[data-lion-input]'); const query = input?.value || ''; bumpInteraction(); renderResults(filterPlaces(query), query); refresh(); });
        shell.querySelectorAll('[data-lion-quick]').forEach(button => button.addEventListener('click', () => {
            const query = button.dataset.lionQuick || '';
            if (query === '__random__') {
                const list = places();
                const winner = list.length ? list[Math.floor(Math.random() * list.length)] : null;
                renderResults(winner ? [winner] : [], '附近好店');
            } else if (query === '最新揪團') {
                setOpen(false); root.switchTab?.('party');
            } else {
                const input = shell.querySelector('[data-lion-input]'); if (input) input.value = query; renderResults(filterPlaces(query), query);
            }
            bumpInteraction(); refresh();
        }));
        shell.addEventListener('click', event => { const card = event.target.closest('[data-lion-place-id]'); if (!card) return; const place = places().find(item => String(item.jiaPlaceId || item.id || '') === card.dataset.lionPlaceId); if (place) { setOpen(false); root.openRestaurantDetailById?.(place.jiaPlaceId || place.id); if (!root.openRestaurantDetailById) root.openRestaurantDetailByName?.(encodeURIComponent(place.name)); } });
        shell.querySelector('[data-lion-line]')?.addEventListener('click', () => {
            const url = root.JIA_BEN_AUTH_CONFIG?.LINE_ASSISTANT_URL || '';
            if (!url) {
                root.showCustomMsg?.('萊恩本尊的 LINE 連結尚未設定，請在 src/config/authConfig.js 填入 LINE_ASSISTANT_URL。');
                return;
            }
            const link = document.createElement('a');
            link.href = url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.click();
        });
        const observer = new MutationObserver(updateAvoidance); observer.observe(root.document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
        root.addEventListener('popstate', updateAvoidance); setInterval(updateAvoidance, 800); updateAvoidance(); refresh();
    }
    const api = Object.freeze({ parseQuery, filterPlaces, getGrowthState, refresh, init, setOpen, showNudge, updateAvoidance });
    root.JiaLionAssistant = api;
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root.document?.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : globalThis);
