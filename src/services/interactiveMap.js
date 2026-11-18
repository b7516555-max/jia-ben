(function (root, factory) {
  const api = factory(root?.JiaRestaurantViewModel || (typeof require === 'function' ? require('./restaurantViewModel.js') : null), root?.JiaMapRestaurantContract || (typeof require === 'function' ? require('./mapRestaurantContract.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JiaInteractiveMap = api;
})(typeof window !== 'undefined' ? window : null, function (viewModel, mapContract) {
  'use strict';

  const DEFAULT_CENTER = [22.6761, 120.4942];
  const DEFAULT_ZOOM = 13;
  const state = {
    viewport: { center: DEFAULT_CENTER.slice(), zoom: DEFAULT_ZOOM, bounds: null },
    selectedRestaurantId: null, visibleRestaurantIds: [], filteredRestaurantIds: [],
    userLocation: null, searchAreaBounds: null, mapMovedByUser: false,
    isSearchAreaAvailable: false, sheetState: 'collapsed', initialized: false
  };
  let map = null, mapLayer = null, userLayer = null, leafletPromise = null;
  let models = [], mapModels = [], suppressMove = false, moveOrigin = null;
  const listeners = new Set();
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])); }

  function emit() { listeners.forEach(fn => { try { fn(getState()); } catch (_) {} }); }
  function subscribe(fn) { if (typeof fn === 'function') listeners.add(fn); return () => listeners.delete(fn); }
  function getState() { return JSON.parse(JSON.stringify(state)); }
  function validCoordinate(lat, lng) { return viewModel?.validCoordinate ? viewModel.validCoordinate(lat, lng) : Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)); }
  function normalizePlaces(places) {
    models = (Array.isArray(places) ? places : []).map(p => {
      const raw = p || {};
      const normalized = viewModel?.normalize(raw) || raw;
      // Keep normalized fields while retaining every photo source for map views.
      return { ...raw, ...normalized, raw };
    });
    mapModels = (mapContract?.normalizeMany ? mapContract.normalizeMany(places) : models.map(p => validCoordinate(p.latitude, p.longitude) ? ({ restaurantId: p.id, lat: p.latitude, lng: p.longitude, name: p.name }) : null)).filter(Boolean);
    state.visibleRestaurantIds = mapModels.map(p => p.restaurantId).filter(Boolean);
    state.filteredRestaurantIds = state.visibleRestaurantIds.slice();
    return models;
  }
  function setPlaces(places) { normalizePlaces(places); if (map) renderMarkers(); renderList(); emit(); return getState(); }
  function getPlace(id) { return models.find(p => p.id === id) || null; }
  function markerIcon(L, selected) {
    return L.divIcon({ className: `jia-map-marker-wrap${selected ? ' is-selected' : ''}`, html: `<span class="jia-map-marker" aria-hidden="true"><i class="fa-solid fa-utensils"></i></span>`, iconSize: [32, 38], iconAnchor: [16, 36], popupAnchor: [0, -32] });
  }
  function clusterIcon(L, count) {
    return L.divIcon({ className: 'jia-map-cluster-wrap', html: `<span class="jia-map-cluster" aria-label="${count} 家餐廳">${count}</span>`, iconSize: [42, 42], iconAnchor: [21, 21] });
  }
  function groupMapModels(items, zoom) {
    if (items.length < 25) return items.map(item => ({ type: 'marker', items: [item] }));
    const grid = Math.max(0.0015, 0.18 / Math.pow(2, Math.max(1, zoom - 8)));
    const groups = new Map();
    items.forEach(item => { const key = `${Math.floor(item.lat / grid)}:${Math.floor(item.lng / grid)}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item); });
    return [...groups.values()].map(group => ({ type: group.length > 1 ? 'cluster' : 'marker', items: group }));
  }
  function renderMarkers() {
    if (!map || !window.L) return;
    if (mapLayer) mapLayer.clearLayers(); else mapLayer = window.L.layerGroup().addTo(map);
    const selected = state.selectedRestaurantId;
    const active = mapModels.filter(item => state.filteredRestaurantIds.includes(item.restaurantId));
    groupMapModels(active, map.getZoom()).forEach(group => {
      if (group.type === 'cluster') {
        const center = group.items.reduce((acc, item) => [acc[0] + item.lat / group.items.length, acc[1] + item.lng / group.items.length], [0, 0]);
        const marker = window.L.marker(center, { icon: clusterIcon(window.L, group.items.length), keyboard: true, title: `${group.items.length} 家餐廳` }).addTo(mapLayer);
        marker._jiaRestaurantIds = group.items.map(item => item.restaurantId);
        marker.on('click keypress', () => { map.fitBounds(window.L.latLngBounds(group.items.map(item => [item.lat, item.lng])).pad(0.25), { maxZoom: Math.min(17, map.getZoom() + 3) }); });
      } else {
        const item = group.items[0];
        const marker = window.L.marker([item.lat, item.lng], { icon: markerIcon(window.L, item.restaurantId === selected), keyboard: true, title: item.name });
        marker._jiaRestaurantId = item.restaurantId;
        marker.on('add', () => { const element = marker.getElement?.(); if (element) { element.dataset.jiaRestaurantId = item.restaurantId; element.setAttribute('aria-label', `選取 ${item.name}`); element.addEventListener('click', () => selectRestaurant(item.restaurantId, { pan: false }), { once: true }); } });
        marker.addTo(mapLayer);
        const markerElement = marker.getElement?.();
        if (markerElement) { markerElement.dataset.jiaRestaurantId = item.restaurantId; markerElement.setAttribute('aria-label', `選取 ${item.name}`); markerElement.addEventListener('click', () => selectRestaurant(item.restaurantId, { pan: false }), { once: true }); }
        marker.bindTooltip(item.name, { direction: 'top', opacity: 0.95 });
        const place = getPlace(item.restaurantId);
        const imageInfo = window.imageSafety?.selectImage?.(place || item, './assets/place-placeholder.svg');
        if (imageInfo?.url) {
          marker.bindPopup(`<div class="jia-map-marker-popup"><img src="${escapeHtml(imageInfo.url)}" alt="${escapeHtml(item.name)}" class="jia-map-marker-popup-image"><strong>${escapeHtml(item.name)}</strong><button type="button" data-map-popup-detail="${escapeHtml(item.restaurantId)}">查看詳情</button></div>`);
          marker.on('popupopen', event => event.popup.getElement()?.querySelector('[data-map-popup-detail]')?.addEventListener('click', () => window.openRestaurantDetailById?.(item.restaurantId)));
        }
        marker.on('click', () => selectRestaurant(item.restaurantId, { pan: false }));
        marker.on('keypress', event => { if (event.originalEvent?.key === 'Enter' || event.originalEvent?.key === ' ') selectRestaurant(item.restaurantId, { pan: false }); });
      }
    });
    if (userLayer) userLayer.eachLayer?.(layer => layer.bringToFront?.());
  }
  function renderList() {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('jia-map-results');
    if (!container) return;
    const list = models.filter(item => state.filteredRestaurantIds.includes(item.id));
    if (!list.length) { container.innerHTML = '<div class="jia-map-empty"><i class="fa-solid fa-map-location-dot"></i><p>此區域目前沒有餐廳資料。</p><button type="button" data-map-action="reset">拉遠地圖</button></div>'; return; }
    container.innerHTML = list.map(item => {
      const rating = item.rating && item.reviewCount ? `<span class="numeric-value"><i class="fa-solid fa-star text-amber-400"></i> ${Number(item.rating).toFixed(1)} (${item.reviewCount})</span>` : '<span>暫無 Jia-ben 評分</span>';
      const imageInfo = window.imageSafety?.selectImage?.(getPlace(item.restaurantId) || item, './assets/place-placeholder.svg') || {
        url: item.primaryPhoto || item.photoFallback || './assets/place-placeholder.svg',
        isPlaceholder: !item.primaryPhoto,
        isReferenceFallback: false,
        label: '參考餐點照片'
      };
      const image = imageInfo.url;
      const imageLabel = imageInfo.isPlaceholder ? `<span class="jia-map-image-badge">${String(imageInfo.label || '參考餐點照片').replace(/[<>&]/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[character]))}</span>` : '';
      const shouldSearchExternal = imageInfo.isPlaceholder && !imageInfo.isReferenceFallback;
      return `<article class="jia-map-preview${item.id === state.selectedRestaurantId ? ' is-selected' : ''}" data-map-restaurant-id="${String(item.id).replace(/"/g, '&quot;')}" tabindex="0" role="button" aria-label="選取 ${String(item.name).replace(/"/g, '&quot;')}">
        <img src="${image}" data-jia-free-image="${shouldSearchExternal ? '1' : '0'}" data-jia-image-name="${String(item.name).replace(/"/g, '&quot;')}" data-jia-image-city="${String(item.city || '').replace(/"/g, '&quot;')}" data-jia-image-category="${String(item.category || '').replace(/"/g, '&quot;')}" alt="${String(item.name).replace(/"/g, '&quot;')}" onerror="this.onerror=null;this.src='./assets/place-placeholder.svg'">
        ${imageLabel}
        <div class="jia-map-preview-body"><h3>${String(item.name).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</h3><p>${String(item.category || item.address || '餐廳')}</p><p class="jia-map-meta">${rating}${item.openStatus ? ` · ${item.openStatus}` : ''}</p><button type="button" data-map-detail="${String(item.id).replace(/"/g, '&quot;')}">查看詳情</button></div>
      </article>`;
    }).join('');
    container.querySelectorAll('[data-map-restaurant-id]').forEach(card => { const id = card.dataset.mapRestaurantId; card.addEventListener('click', event => { if (event.target.closest('[data-map-detail]')) return; selectRestaurant(id); }); card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectRestaurant(id); } }); });
    container.querySelectorAll('[data-map-detail]').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); const item = getPlace(button.dataset.mapDetail); if (item && window.openRestaurantDetailById) window.openRestaurantDetailById(item.id); else if (item && window.openRestaurantDetailByName) window.openRestaurantDetailByName(encodeURIComponent(item.name)); }));
    container.querySelectorAll('[data-map-action="reset"]').forEach(button => button.addEventListener('click', resetSearchArea));
    const selectedCard = container.querySelector('.jia-map-preview.is-selected');
    if (selectedCard && state.selectedRestaurantId) selectedCard.scrollIntoView({ block: 'nearest' });
  }
  function updatePreview() { if (typeof document === 'undefined') return; const item = getPlace(state.selectedRestaurantId), preview = document.getElementById('jia-map-selected-preview'); if (!preview) return; if (!item) { preview.classList.add('hidden'); preview.innerHTML = ''; return; } preview.classList.remove('hidden'); preview.innerHTML = `<div class="jia-map-preview-mini"><strong>${item.name}</strong><span>${item.category || item.address || ''}</span><button type="button" data-map-preview-detail>查看詳情</button></div>`; preview.querySelector('[data-map-preview-detail]').onclick = () => window.openRestaurantDetailById?.(item.id); }
  function selectRestaurant(id, options = {}) { if (!getPlace(id) || !mapModels.some(item => item.restaurantId === id)) return false; state.selectedRestaurantId = id; if (options.pan !== false && map) { const item = mapModels.find(x => x.restaurantId === id); if (item) map.panTo([item.lat, item.lng], { animate: !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches }); } updatePreview(); renderMarkers(); renderList(); setSheetState(typeof window !== 'undefined' && window.innerWidth < 768 ? 'half' : state.sheetState); emit(); return true; }
  function setSheetState(next) { if (!['collapsed', 'half', 'expanded'].includes(next)) return; state.sheetState = next; const sheet = typeof document !== 'undefined' ? document.getElementById('jia-map-sheet') : null; if (sheet) { sheet.dataset.state = next; sheet.setAttribute('aria-label', `餐廳清單，${next}`); } emit(); }
  function installSheetGestures() { const sheet = document.getElementById('jia-map-sheet'), handle = document.getElementById('jia-map-sheet-handle'); if (!sheet || !handle || handle.dataset.bound) return; handle.dataset.bound = '1'; let startY = null; handle.addEventListener('pointerdown', event => { startY = event.clientY; handle.setPointerCapture?.(event.pointerId); }); handle.addEventListener('pointerup', event => { if (startY == null) return; const delta = event.clientY - startY; startY = null; const order = ['collapsed', 'half', 'expanded'], index = order.indexOf(state.sheetState); setSheetState(delta < -35 ? order[Math.min(2, index + 1)] : delta > 35 ? order[Math.max(0, index - 1)] : state.sheetState); }); }
  function searchThisArea() { if (!map) return; state.searchAreaBounds = map.getBounds()?.toBBoxString?.() || null; state.isSearchAreaAvailable = false; state.mapMovedByUser = false; const bounds = map.getBounds(); state.filteredRestaurantIds = mapModels.filter(item => bounds.contains([item.lat, item.lng])).map(item => item.restaurantId); renderMarkers(); renderList(); emit(); }
  function resetSearchArea() { state.searchAreaBounds = null; state.filteredRestaurantIds = state.visibleRestaurantIds.slice(); state.isSearchAreaAvailable = false; if (map && moveOrigin) { suppressMove = true; map.setView(moveOrigin.center, moveOrigin.zoom); } renderMarkers(); renderList(); emit(); }
  function locateUser() { if (!navigator.geolocation) return window.showCustomMsg?.('此裝置不支援定位，仍可使用地圖搜尋。'); if (state.userLocation) { map?.panTo(state.userLocation); return; } navigator.geolocation.getCurrentPosition(position => { const coords = [Number(position.coords.latitude), Number(position.coords.longitude)]; if (!validCoordinate(...coords)) return; state.userLocation = coords; if (window.L && map) { if (userLayer) userLayer.clearLayers(); else userLayer = window.L.layerGroup().addTo(map); window.L.circleMarker(coords, { radius: 8, color: '#2563eb', fillColor: '#60a5fa', fillOpacity: .85, weight: 3 }).bindTooltip('目前位置').addTo(userLayer); map.setView(coords, Math.max(map.getZoom(), 15)); } emit(); }, error => { const message = error?.code === 1 ? '你已拒絕定位權限，仍可使用地圖搜尋。' : '目前無法取得位置，仍可使用地圖搜尋。'; window.showCustomMsg?.(message); }); }
  function loadLeaflet() { if (window.L) return Promise.resolve(window.L); if (leafletPromise) return leafletPromise; leafletPromise = new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; script.onload = () => resolve(window.L); script.onerror = reject; document.head.appendChild(script); }); return leafletPromise; }
  function initialize(options = {}) { const element = document.getElementById(options.containerId || 'jia-map-canvas'); if (!element) return Promise.resolve(null); return loadLeaflet().then(L => { if (!map) { map = L.map(element, { zoomControl: false, attributionControl: true, preferCanvas: true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM); if (typeof window !== 'undefined') window.__JIA_MAP_INSTANCE = map; L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>' }).addTo(map); L.control.zoom({ position: 'bottomright' }).addTo(map); mapLayer = L.layerGroup().addTo(map); moveOrigin = { center: DEFAULT_CENTER.slice(), zoom: DEFAULT_ZOOM }; map.on('moveend zoomend', () => { state.viewport.center = [map.getCenter().lat, map.getCenter().lng]; state.viewport.zoom = map.getZoom(); state.viewport.bounds = map.getBounds().toBBoxString(); if (!suppressMove) { state.mapMovedByUser = true; state.isSearchAreaAvailable = true; } suppressMove = false; renderMarkers(); emit(); }); state.initialized = true; installSheetGestures(); } setPlaces(window.jiaPlacesData || options.places || []); setTimeout(() => map.invalidateSize(), 0); return map; }).catch(error => { const canvas = document.getElementById(options.containerId || 'jia-map-canvas'); if (canvas) canvas.innerHTML = '<div class="jia-map-error"><i class="fa-solid fa-map"></i><p>地圖目前無法載入，仍可使用餐廳清單。</p></div>'; window.__JIA_MAP_LAST_ERROR = String(error?.message || error); return null; }); }
  function open(places) { const run = initialize({ places }); return Promise.resolve(run).then(() => { try { setPlaces(places || window.jiaPlacesData || []); document.getElementById('jia-map-view')?.classList.remove('hidden'); setTimeout(() => { map?.invalidateSize(); window.JiaFreeImageSearch?.hydrateImages?.(); }, 50); } catch (error) { window.__JIA_MAP_LAST_ERROR = String(error?.message || error); } return getState(); }); }
  function close() {
    ['dragging', 'touchZoom', 'scrollWheelZoom', 'doubleClickZoom', 'boxZoom', 'keyboard'].forEach(name => { try { map?.[name]?.disable?.(); } catch (_) {} });
    document.getElementById('jia-map-view')?.classList.add('hidden');
    document.getElementById('jia-map-selected-preview')?.classList.add('hidden');
    state.sheetState = 'collapsed';
  }
  return { state, getState, subscribe, normalizePlaces, setPlaces, initialize, open, close, selectRestaurant, setSheetState, searchThisArea, resetSearchArea, locateUser, groupMapModels, getPlace };
});
