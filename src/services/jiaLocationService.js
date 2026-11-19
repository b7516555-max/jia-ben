(function (root) {
    'use strict';
    const STORAGE_KEY = 'jia_ben_precise_location';
    const MANUAL = {
        '高雄左營': { lat: 22.687, lng: 120.294 }, '高雄鳳山': { lat: 22.625, lng: 120.357 }, '高雄苓雅': { lat: 22.626, lng: 120.312 },
        '屏東市': { lat: 22.671, lng: 120.488 }, '屏東九如': { lat: 22.729, lng: 120.489 }, '台南': { lat: 22.999, lng: 120.227 },
        '嘉義': { lat: 23.480, lng: 120.449 }, '台北': { lat: 25.033, lng: 121.565 }
    };
    const valid = value => value && Number.isFinite(Number(value.lat)) && Number.isFinite(Number(value.lng));
    function readSaved(storage = root.localStorage) { try { const value = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null'); return valid(value) ? value : null; } catch (_) { return null; } }
    function save(value, source = 'gps', storage = root.localStorage) { if (!valid(value)) return null; const result = { lat: Number(value.lat), lng: Number(value.lng), accuracy: Number.isFinite(Number(value.accuracy)) ? Number(value.accuracy) : null, source, savedAt: Date.now() }; try { storage?.setItem(STORAGE_KEY, JSON.stringify(result)); } catch (_) {} root.jiaLocationState = result; return result; }
    function request({ timeout = 4500 } = {}) {
        if (!root.navigator?.geolocation) return Promise.reject(Object.assign(new Error('定位功能不可用'), { code: 0 }));
        return new Promise((resolve, reject) => {
            let best = null, settled = false, watchId = null;
            const finish = (value, error) => { if (settled) return; settled = true; if (watchId != null) root.navigator.geolocation.clearWatch(watchId); if (value) resolve(save(value)); else reject(error || new Error('無法取得定位')); };
            const consider = position => { const c = position.coords || {}; const candidate = { lat: c.latitude, lng: c.longitude, accuracy: c.accuracy }; if (!valid(candidate)) return; if (!best || Number(candidate.accuracy ?? Infinity) < Number(best.accuracy ?? Infinity)) best = candidate; if (Number(candidate.accuracy) <= 50) finish(best); };
            try { watchId = root.navigator.geolocation.watchPosition(consider, error => { if (!best) finish(null, error); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }); } catch (error) { finish(null, error); return; }
            root.setTimeout(() => finish(best, best ? null : new Error('定位逾時')), timeout);
        });
    }
    function setManual(label) { const value = MANUAL[label]; return value ? save(value, 'manual') : null; }
    function chooseManual() { const labels = Object.keys(MANUAL); const selected = root.prompt?.(`選擇目前生活圈：\n${labels.map((item, i) => `${i + 1}. ${item}`).join('\n')}\n請輸入編號`); const index = Number(selected) - 1; const result = labels[index] ? setManual(labels[index]) : null; if (!result && selected != null) root.showCustomMsg?.('沒有找到這個生活圈，請重新選擇。'); return result; }
    function mapsUrl(place = {}) { const name = String(place.name || '').trim(); const address = String(place.address || '').trim(); const area = [place.city, place.district].filter(Boolean).join(''); const query = [name, address || area].filter(Boolean).join(' '); const fallback = valid(place.location) ? `${place.location.lat},${place.location.lng}` : (valid({ lat: place.lat, lng: place.lng }) ? `${place.lat},${place.lng}` : name || '餐廳'); return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query || fallback)}`; }
    function label(value = readSaved()) { if (!value) return '📍 尚未取得定位'; return value.source === 'manual' ? `📍 手動位置${value.accuracy ? ` (±${Math.round(value.accuracy)}m)` : ''}` : `📍 已定位${value.accuracy ? ` (±${Math.round(value.accuracy)}m)` : ''}`; }
    const api = { STORAGE_KEY, MANUAL, readSaved, save, request, setManual, chooseManual, mapsUrl, label };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.JiaLocation = api;
})(typeof window !== 'undefined' ? window : globalThis);
