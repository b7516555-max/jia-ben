(function (root) {
    'use strict';
    if (!root || !root.document) return;

    const ROUTABLE_PAGES = new Set(['explore', 'map', 'nearby', 'history', 'party', 'feed', 'chat', 'list', 'creator', 'admin', 'guide']);
    const FALLBACK_PLACES = [{
        jiaPlaceId: 'demo-hotpot', id: 'demo-hotpot', name: '呷奔展示火鍋',
        city: '高雄市', district: '苓雅區', category: '火鍋', categories: ['火鍋'],
        address: '高雄市苓雅區展示路 1 號', averageSpend: 420
    }];
    const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
    const updateLion = () => root.JiaLionAssistant?.updateAvoidance?.();

    function renderFallbackHome() {
        const container = root.document.getElementById('home-for-you-container');
        if (!container || (typeof root.renderHomeForYouRemote === 'function' && root.__JIA_FIREBASE_MODULE_READY)) {
            root.renderHomeForYouRemote?.();
            return;
        }
        container.innerHTML = FALLBACK_PLACES.map(place => `<article class="restaurant-card bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden p-4"><div class="font-black text-gray-800">${escapeHtml(place.name)}</div><div class="text-xs text-gray-500 mt-1">${escapeHtml(place.city)} · ${escapeHtml(place.category)}</div><button type="button" class="mt-3 text-xs text-orange-600 font-bold" onclick="window.openRestaurantDetailByName?.('${encodeURIComponent(place.name)}')">查看詳情</button></article>`).join('');
    }

    root.renderHomeForYou = function (shuffle = false) {
        if (typeof root.renderHomeForYouRemote === 'function') return root.renderHomeForYouRemote(shuffle);
        renderFallbackHome();
    };

    root.syncNavigationState = function (tabName) {
        const activeId = `tab-${tabName}`;
        root.document.querySelectorAll('nav .tab-btn').forEach(button => {
            const active = button.id === activeId;
            button.classList.toggle('active', active);
            if (active) button.setAttribute('aria-current', 'page');
            else button.removeAttribute('aria-current');
            button.blur();
        });
    };

    root.enterApp = function () {
        const intro = root.document.getElementById('intro-screen');
        const mainApp = root.document.getElementById('main-app');
        if (!mainApp) return false;
        mainApp.classList.remove('hidden');
        intro?.classList.add('intro-exit', 'pointer-events-none');
        root.setTimeout(() => intro?.classList.add('hidden'), 400);
        updateLion();
        const partyId = new URLSearchParams(root.location.search).get('party');
        if (partyId) root.setTimeout(() => root.switchTab?.('party', true), 0);
        if (root.__JIA_PENDING_RELEASE_NOTES) {
            root.__JIA_PENDING_RELEASE_NOTES = false;
            root.setTimeout(() => root.openReleaseNotesModal?.(), 500);
        }
        return true;
    };

    root.openProducerModal = function () {
        root.enterApp();
        root.setTimeout(() => root.switchTab?.('creator', true), 450);
    };
    root.openCreatorPage = root.openProducerModal;

    root.openReleaseNotesModal = function () {
        const modal = root.document.getElementById('release-notes-modal');
        if (!modal) return;
        const version = root.JIA_BEN_VERSION || 'v135';
        const note = root.JIA_BEN_RELEASE_NOTES?.[version] || root.JIA_BEN_RELEASE_NOTES?.v135;
        const title = root.document.getElementById('release-notes-title');
        const date = root.document.getElementById('release-notes-date');
        const list = root.document.getElementById('release-notes-list');
        if (title) title.textContent = `${note?.title || '🎉 呷奔更新啦'}（${version}）`;
        if (date) date.textContent = note?.date || '';
        if (list) list.innerHTML = (note?.highlights || []).map(item => `<li class="flex gap-2"><span class="text-orange-500">✦</span><span>${root.escapeHtml ? root.escapeHtml(item) : escapeHtml(item)}</span></li>`).join('');
        modal.classList.remove('hidden');
        updateLion();
    };

    root.openModal = function (id) {
        const modal = root.document.getElementById(id);
        if (!modal) return;
        modal.classList.remove('hidden');
        updateLion();
    };

    root.closeModal = function (id) {
        const modal = root.document.getElementById(id);
        if (!modal) return;
        modal.classList.add('hidden');
        if (id === 'detail-lightbox') modal.classList.remove('flex');
        if (id === 'release-notes-modal') {
            try { root.localStorage.setItem('jia_ben_last_seen_version', root.JIA_BEN_VERSION || 'v135'); } catch (_) {}
        }
        if (id === 'card-detail-modal' && root.__JIA_DETAIL_RETURN_CONTEXT) {
            const context = root.__JIA_DETAIL_RETURN_CONTEXT;
            root.__JIA_DETAIL_RETURN_CONTEXT = null;
            if (context.activeTab === 'map') {
                root.switchTab?.('map', true);
                if (context.restaurantId) root.JiaInteractiveMap?.selectRestaurant(context.restaurantId, { pan: false });
            }
            context.focus?.focus?.();
        }
        updateLion();
    };

    root.switchTab = function (tabName, forceRefresh = false, options = {}) {
        const tab = ROUTABLE_PAGES.has(tabName) ? tabName : 'explore';
        const currentPage = new URLSearchParams(root.location.search).get('page');
        if (!forceRefresh && currentPage === tab && root.document.getElementById(`tab-${tab}`)?.classList.contains('active')) return;
        ['explore', 'map', 'nearby', 'history', 'random', 'party', 'feed', 'chat', 'list', 'creator', 'admin', 'guide'].forEach(name => root.document.getElementById(`view-${name}`)?.classList.add('hidden'));
        root.document.getElementById('jia-map-view')?.classList.add('hidden');
        if (tab !== 'map') root.JiaInteractiveMap?.close?.();
        root.document.getElementById(`view-${tab}`)?.classList.remove('hidden');
        root.syncNavigationState(tab);
        root.scrollTo?.({ top: 0, behavior: 'auto' });
        root.document.getElementById('main-content')?.scrollTo?.({ top: 0, behavior: 'auto' });
        const titles = { explore: '找餐廳', map: '地圖找餐廳', nearby: '美食輪盤', history: '吃過紀錄', party: '揪團活動', feed: '美食動態牆', chat: '留言板', list: '口袋名單', creator: '製作人介紹', admin: '主揪後台', guide: '使用指南' };
        const title = root.document.getElementById('app-header-title');
        if (title) title.textContent = `呷奔 • ${titles[tab]}`;
        if (!options.fromHistory && currentPage !== tab) root.history.pushState({ page: tab }, '', `${root.location.pathname}?page=${tab}`);
        root.document.body.classList.toggle('map-view-active', tab === 'map');
        if (tab === 'explore') root.renderHomeForYou();
        if (tab === 'history') root.renderHistoryView?.();
        if (tab === 'list') root.renderList?.();
        if (tab === 'feed') root.renderFeed?.();
        if (tab === 'party') root.renderParties?.();
        if (tab === 'chat') root.renderChatMessages?.(true);
        if (tab === 'nearby') root.previewWheelCandidates?.();
        if (tab === 'admin') root.renderAdminDataList?.();
        if (tab === 'creator') root.updateCreatorStats?.();
        if (tab === 'map') root.JiaInteractiveMap?.open(root.jiaPlacesData || root.restaurantData || FALLBACK_PLACES);
        root.setTimeout(() => root.JiaFreeImageSearch?.hydrateImages?.(), 0);
        updateLion();
    };

    root.quickDecidePlace = root.quickDecidePlace || function () { root.switchTab('nearby', true); };
    root.jiaPlacesData = Array.isArray(root.jiaPlacesData) && root.jiaPlacesData.length ? root.jiaPlacesData : FALLBACK_PLACES;
    root.restaurantData = Array.isArray(root.restaurantData) && root.restaurantData.length ? root.restaurantData : FALLBACK_PLACES;
    root.JIA_ROUTABLE_PAGES = ROUTABLE_PAGES;
    root.addEventListener('popstate', () => {
        const page = new URLSearchParams(root.location.search).get('page') || 'explore';
        root.enterApp();
        root.switchTab(page, true, { fromHistory: true });
        root.setTimeout(() => root.applyUrlPrefill?.(), 80);
    });
})(typeof window !== 'undefined' ? window : globalThis);
