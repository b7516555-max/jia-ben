(function () {
    'use strict';

    const config = Object.assign({
        nominatimBase: 'https://nominatim.openstreetmap.org',
        overpassBase: 'https://overpass-api.de/api/interpreter',
        requestIntervalMs: 1100,
        cacheTtlMs: 7 * 24 * 60 * 60 * 1000,
        resultLimit: 10
    }, window.OSM_CONFIG || {});

    const memoryCache = new Map();
    const placeCache = new Map();
    let requestChain = Promise.resolve();
    let lastRequestAt = 0;

    function readCache(key) {
        if (memoryCache.has(key)) return memoryCache.get(key);
        try {
            const raw = localStorage.getItem(`jia-ben:osm:${key}`);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || Date.now() - parsed.savedAt > config.cacheTtlMs) {
                localStorage.removeItem(`jia-ben:osm:${key}`);
                return null;
            }
            memoryCache.set(key, parsed.value);
            return parsed.value;
        } catch (_) {
            return null;
        }
    }

    function writeCache(key, value) {
        memoryCache.set(key, value);
        try {
            localStorage.setItem(`jia-ben:osm:${key}`, JSON.stringify({ savedAt: Date.now(), value }));
        } catch (_) {}
    }

    function queuedFetch(url) {
        const cacheKey = encodeURIComponent(url.replace(config.nominatimBase, ''));
        const cached = readCache(cacheKey);
        if (cached) return Promise.resolve(cached);

        const task = requestChain.then(async () => {
            const waitMs = Math.max(0, config.requestIntervalMs - (Date.now() - lastRequestAt));
            if (waitMs) await new Promise(resolve => setTimeout(resolve, waitMs));
            lastRequestAt = Date.now();
            const response = await fetch(url, {
                headers: { 'Accept': 'application/json', 'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.5' }
            });
            if (!response.ok) throw new Error(`OSM search failed (${response.status})`);
            const data = await response.json();
            writeCache(cacheKey, data);
            return data;
        });
        requestChain = task.catch(() => undefined);
        return task;
    }

    function osmTypeLetter(type) {
        return type === 'node' ? 'N' : type === 'way' ? 'W' : type === 'relation' ? 'R' : '';
    }

    function mapPlaceTypes(item) {
        const type = String(item.type || '').toLowerCase();
        const category = String(item.category || item.class || '').toLowerCase();
        const types = [type, category].filter(Boolean);
        const foodTypes = ['restaurant', 'cafe', 'fast_food', 'food_court', 'bakery', 'bar', 'pub', 'ice_cream'];
        if (foodTypes.includes(type) || category === 'amenity' || category === 'shop') types.push('food');
        if (type === 'fast_food') types.push('meal_takeaway');
        return [...new Set(types)];
    }

    function isFoodPlace(item) {
        const type = String(item.type || '').toLowerCase();
        const category = String(item.category || item.class || '').toLowerCase();
        if (category === 'amenity') return ['restaurant', 'cafe', 'fast_food', 'food_court', 'bar', 'pub', 'ice_cream'].includes(type);
        if (category === 'shop') return ['bakery', 'deli', 'confectionery', 'coffee', 'tea', 'beverages', 'pastry'].includes(type);
        return false;
    }

    function addressComponents(address) {
        const rows = [];
        const add = (value, types) => {
            if (value) rows.push({ long_name: String(value), short_name: String(value), types });
        };
        if (address.country) {
            rows.push({
                long_name: String(address.country === '臺灣' ? '台灣' : address.country),
                short_name: String(address.country_code || '').toUpperCase() || String(address.country),
                types: ['country']
            });
        }
        const isTaiwan = String(address.country_code || '').toLowerCase() === 'tw';
        add(isTaiwan ? (address.county || address.city || address.town || address.state) : (address.state || address.province), ['administrative_area_level_1']);
        add(address.county, ['administrative_area_level_2']);
        add(address.city || address.town || address.municipality, ['locality']);
        add(address.suburb || address.city_district || address.district, ['sublocality_level_1', 'sublocality']);
        add(address.postcode, ['postal_code']);
        add(address.road || address.pedestrian, ['route']);
        add(address.house_number, ['street_number']);
        return rows;
    }

    function weekdayText(openingHours) {
        if (!openingHours) return [];
        return [`OSM 營業時間：${openingHours}`];
    }

    function toPlace(item) {
        const lat = Number(item.lat);
        const lng = Number(item.lon);
        const extras = item.extratags || {};
        const address = Object.assign({}, item.address || {}, { country_code: item.address?.country_code || item.country_code || '' });
        const osmId = `${osmTypeLetter(item.osm_type)}${item.osm_id || ''}`;
        const placeId = osmId ? `osm:${osmId}` : `osm:place:${item.place_id}`;
        const displayName = item.display_name || '';
        const name = item.namedetails?.name || item.name || address.amenity || address.shop || displayName.split(',')[0] || '未命名地點';
        const place = {
            name,
            place_id: placeId,
            osm_type: item.osm_type,
            osm_id: item.osm_id,
            formatted_address: displayName,
            address_components: addressComponents(address),
            geometry: { location: { lat: () => lat, lng: () => lng } },
            url: item.osm_type && item.osm_id
                ? `https://www.openstreetmap.org/${item.osm_type}/${item.osm_id}`
                : `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`,
            website: extras.website || extras['contact:website'] || '',
            formatted_phone_number: extras.phone || extras['contact:phone'] || '',
            opening_hours: extras.opening_hours ? {
                weekday_text: weekdayText(extras.opening_hours),
                open_now: undefined,
                isOpen: () => undefined
            } : null,
            business_status: 'OPERATIONAL',
            rating: 0,
            user_ratings_total: 0,
            reviews: [],
            photos: [],
            price_level: undefined,
            types: mapPlaceTypes(item),
            _osmRaw: item
        };
        placeCache.set(placeId, place);
        return place;
    }

    function overpassItem(element) {
        const tags = element.tags || {};
        const lat = element.lat ?? element.center?.lat;
        const lon = element.lon ?? element.center?.lon;
        const addressParts = [tags['addr:housenumber'], tags['addr:street'], tags['addr:district'], tags['addr:city'], tags['addr:county'], tags['addr:postcode'], tags['addr:country']].filter(Boolean);
        return {
            place_id: `overpass-${element.type}-${element.id}`,
            osm_type: element.type,
            osm_id: element.id,
            lat: String(lat),
            lon: String(lon),
            name: tags.name || tags['name:zh'] || tags.brand || '未命名餐飲店',
            display_name: addressParts.join(', ') || tags.name || tags['name:zh'] || 'OpenStreetMap 地點',
            category: tags.amenity ? 'amenity' : 'shop',
            type: tags.amenity || tags.shop || 'restaurant',
            address: {
                country: tags['addr:country'] === 'TW' ? '台灣' : (tags['addr:country'] || ''),
                country_code: String(tags['addr:country'] || '').toLowerCase(),
                state: tags['addr:state'] || '', county: tags['addr:county'] || '', city: tags['addr:city'] || '',
                suburb: tags['addr:district'] || '', road: tags['addr:street'] || '',
                house_number: tags['addr:housenumber'] || '', postcode: tags['addr:postcode'] || ''
            },
            extratags: {
                opening_hours: tags.opening_hours || '', website: tags.website || tags['contact:website'] || '',
                phone: tags.phone || tags['contact:phone'] || '', cuisine: tags.cuisine || ''
            },
            namedetails: { name: tags.name || tags['name:zh'] || tags.brand || '' }
        };
    }

    async function searchNearbyFood(lat, lng, radius) {
        const safeRadius = Math.max(1000, Math.min(8000, Number(radius || 50000)));
        const query = `[out:json][timeout:20];(nwr(around:${safeRadius},${lat},${lng})["amenity"~"^(restaurant|cafe|fast_food|food_court|bar|pub|ice_cream)$"];nwr(around:${safeRadius},${lat},${lng})["shop"~"^(bakery|deli|confectionery|coffee|tea|beverages|pastry)$"];);out center tags 120;`;
        const cacheKey = `overpass:${lat.toFixed(3)}:${lng.toFixed(3)}:${safeRadius}`;
        const cached = readCache(cacheKey);
        if (cached) return cached.map(overpassItem).map(toPlace);
        const task = requestChain.then(async () => {
            const waitMs = Math.max(0, config.requestIntervalMs - (Date.now() - lastRequestAt));
            if (waitMs) await new Promise(resolve => setTimeout(resolve, waitMs));
            lastRequestAt = Date.now();
            const response = await fetch(config.overpassBase, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'Accept': 'application/json' },
                body: new URLSearchParams({ data: query })
            });
            if (!response.ok) throw new Error(`Overpass search failed (${response.status})`);
            const data = await response.json();
            const elements = Array.isArray(data.elements) ? data.elements.filter(e => (e.lat ?? e.center?.lat) != null && (e.lon ?? e.center?.lon) != null) : [];
            writeCache(cacheKey, elements);
            return elements.map(overpassItem).map(toPlace);
        });
        requestChain = task.catch(() => undefined);
        return task;
    }

    async function searchPlaces(request) {
        const query = String(request?.query || request?.input || '').trim();
        if (!query) return [];
        const params = new URLSearchParams({
            q: query,
            format: 'jsonv2',
            addressdetails: '1',
            extratags: '1',
            namedetails: '1',
            dedupe: '1',
            limit: String(config.resultLimit),
            'accept-language': 'zh-TW,zh,en'
        });
        const location = request?.location;
        const lat = typeof location?.lat === 'function' ? location.lat() : Number(location?.lat);
        const lng = typeof location?.lng === 'function' ? location.lng() : Number(location?.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            const span = Math.min(0.7, Math.max(0.05, Number(request.radius || 50000) / 111000));
            params.set('viewbox', `${lng - span},${lat + span},${lng + span},${lat - span}`);
            params.set('bounded', '0');
        }
        const data = await queuedFetch(`${config.nominatimBase}/search?${params}`);
        const nominatimPlaces = Array.isArray(data) ? data.filter(isFoodPlace).map(toPlace) : [];
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return nominatimPlaces;
        let nearbyPlaces = [];
        try { nearbyPlaces = await searchNearbyFood(lat, lng, request.radius); } catch (error) { console.warn('Overpass 附近餐廳搜尋失敗:', error); }
        const normalizedQuery = query.toLowerCase().replace(/餐廳|美食|好吃的|附近|台灣|臺灣|台北|臺北|新北|基隆|桃園|新竹|苗栗|台中|臺中|彰化|南投|雲林|嘉義|台南|臺南|高雄|屏東|宜蘭|花蓮|台東|臺東|澎湖|金門|連江|市|縣|區|鄉|鎮/g, '').trim();
        const filteredNearby = normalizedQuery
            ? nearbyPlaces.filter(place => `${place.name} ${place._osmRaw?.extratags?.cuisine || ''} ${place.types.join(' ')}`.toLowerCase().includes(normalizedQuery))
            : nearbyPlaces;
        const merged = [...filteredNearby, ...nominatimPlaces];
        return [...new Map(merged.map(place => [place.place_id, place])).values()].slice(0, config.resultLimit);
    }

    async function lookupPlace(placeId) {
        if (placeCache.has(placeId)) return placeCache.get(placeId);
        const match = /^osm:([NWR]\d+)$/.exec(String(placeId || ''));
        if (!match) return null;
        const params = new URLSearchParams({
            osm_ids: match[1],
            format: 'jsonv2',
            addressdetails: '1',
            extratags: '1',
            namedetails: '1',
            'accept-language': 'zh-TW,zh,en'
        });
        const data = await queuedFetch(`${config.nominatimBase}/lookup?${params}`);
        return Array.isArray(data) && data[0] ? toPlace(data[0]) : null;
    }

    class LatLng {
        constructor(lat, lng) { this._lat = Number(lat); this._lng = Number(lng); }
        lat() { return this._lat; }
        lng() { return this._lng; }
    }

    class PlacesService {
        textSearch(request, callback) {
            searchPlaces(request)
                .then(results => callback(results, results.length ? 'OK' : 'ZERO_RESULTS'))
                .catch(error => { console.warn('OSM 搜尋失敗:', error); callback([], 'UNKNOWN_ERROR'); });
        }
        getDetails(request, callback) {
            lookupPlace(request?.placeId)
                .then(place => callback(place, place ? 'OK' : 'ZERO_RESULTS'))
                .catch(error => { console.warn('OSM 詳細資料讀取失敗:', error); callback(null, 'UNKNOWN_ERROR'); });
        }
    }

    const queryLocations = {
        '台北': [25.0330, 121.5654], '臺北': [25.0330, 121.5654], '新北': [25.0118, 121.4658],
        '桃園': [24.9936, 121.3010], '新竹': [24.8138, 120.9675], '台中': [24.1477, 120.6736],
        '臺中': [24.1477, 120.6736], '嘉義': [23.4801, 120.4491], '台南': [22.9999, 120.2269],
        '臺南': [22.9999, 120.2269], '高雄': [22.6273, 120.3014], '屏東': [22.6761, 120.4942],
        '宜蘭': [24.7021, 121.7378], '花蓮': [23.9911, 121.6112], '台東': [22.7554, 121.1500],
        '臺東': [22.7554, 121.1500]
    };

    function autocompleteLocation(query) {
        const matched = Object.entries(queryLocations).find(([name]) => query.includes(name));
        if (matched) return Promise.resolve(new LatLng(matched[1][0], matched[1][1]));
        if (!navigator.geolocation) return Promise.resolve(new LatLng(22.6761, 120.4942));
        return new Promise(resolve => navigator.geolocation.getCurrentPosition(
            position => resolve(new LatLng(position.coords.latitude, position.coords.longitude)),
            () => resolve(new LatLng(22.6761, 120.4942)),
            { enableHighAccuracy: false, timeout: 4000, maximumAge: 300000 }
        ));
    }

    class AutocompleteService {
        getPlacePredictions(request, callback) {
            const query = String(request?.input || '').trim();
            autocompleteLocation(query).then(location => searchPlaces({ query, location, radius: 8000 }))
                .then(results => callback(results.map(place => ({
                    place_id: place.place_id,
                    description: place.formatted_address,
                    structured_formatting: {
                        main_text: place.name,
                        secondary_text: place.formatted_address
                    }
                })), results.length ? 'OK' : 'ZERO_RESULTS'))
                .catch(error => { console.warn('OSM 地點搜尋失敗:', error); callback([], 'UNKNOWN_ERROR'); });
        }
    }

    window.OSMPlaces = { searchPlaces, lookupPlace, config };
    window.google = window.google || {};
    window.google.maps = {
        LatLng,
        places: {
            PlacesService,
            AutocompleteService,
            PlacesServiceStatus: { OK: 'OK', ZERO_RESULTS: 'ZERO_RESULTS', UNKNOWN_ERROR: 'UNKNOWN_ERROR' }
        }
    };
})();
