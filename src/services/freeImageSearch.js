(function (root) {
    'use strict';
    const CACHE_PREFIX = 'jia_ben_free_image_';
    const TTL = 1000 * 60 * 60 * 24 * 7;
    const safeText = (value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const cacheKey = (place) => `${CACHE_PREFIX}${encodeURIComponent([place?.name, place?.city, place?.category, ...(place?.categories || [])].filter(Boolean).join('|'))}`;
    const readCache = (key) => { try { const cached = JSON.parse(localStorage.getItem(key) || 'null'); return cached && Date.now() - cached.savedAt < TTL ? cached.url : ''; } catch (_) { return ''; } };
    const writeCache = (key, url) => { try { localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), url })); } catch (_) {} };
    const validImageUrl = (url) => typeof url === 'string' && /^https?:\/\//i.test(url) && !/maps\.googleapis\.com|googleusercontent\.com\/maps/i.test(url);
    const categoryQuery = (place) => {
        const text = `${place?.category || ''} ${(place?.categories || []).join(' ')} ${place?.name || ''}`;
        if (/甜點|咖啡|飲料|下午茶/.test(text)) return 'cafe latte pastry';
        if (/拉麵|麵|麵食/.test(text)) return 'ramen noodles';
        if (/飯|壽司|日式/.test(text)) return 'japanese sushi rice bowl';
        if (/燒肉|烤肉|炭烤/.test(text)) return 'bbq yakiniku';
        if (/火鍋|鍋物|麻辣/.test(text)) return 'hotpot';
        return 'taiwanese street food';
    };
    const localReference = (place) => root.imageSafety?.getReferenceFoodImageForPlace?.(place) || './assets/food/lu_rou_fan.jpg';
    async function fetchJson(url) {
        const response = await fetch(url, { headers: { Accept: 'application/json' }, mode: 'cors' });
        if (!response.ok) throw new Error(`image-search-${response.status}`);
        return response.json();
    }
    async function findReferenceImage(place) {
        const key = cacheKey(place);
        const cached = readCache(key);
        if (cached) return cached;
        const queries = [
            safeText([place?.name, place?.city, place?.category || (place?.categories || [])[0], 'food'].filter(Boolean).join(' ')),
            categoryQuery(place)
        ].filter(Boolean);
        for (const query of queries) {
          try {
            const data = await fetchJson(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=8&license_type=commercial`);
            const result = (data.results || []).find(item => validImageUrl(item.thumbnail || item.url));
            if (result) { const imageUrl = result.thumbnail || result.url; writeCache(key, imageUrl); return imageUrl; }
          } catch (_) {}
          try {
            const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|mime&iiurlwidth=900&format=json&origin=*`;
            const data = await fetchJson(wikiUrl);
            const result = Object.values(data.query?.pages || {}).map(page => page.imageinfo?.[0]?.thumburl || page.imageinfo?.[0]?.url).find(validImageUrl);
            if (result) { writeCache(key, result); return result; }
          } catch (_) {}
        }
        const fallback = localReference(place);
        writeCache(key, fallback);
        return fallback;
    }
    function hydrateImages(rootElement) {
        if (typeof document === 'undefined') return;
        const scope = rootElement || document;
        scope.querySelectorAll?.('img[data-jia-free-image="1"]:not([data-jia-image-hydrated])').forEach((image) => {
            image.dataset.jiaImageHydrated = '1';
            const place = { name: image.dataset.jiaImageName, city: image.dataset.jiaImageCity, category: image.dataset.jiaImageCategory };
            findReferenceImage(place).then(url => {
                if (url && image.isConnected) image.src = url;
            }).catch(() => {});
        });
    }
    root.JiaFreeImageSearch = Object.freeze({ findReferenceImage, hydrateImages, cacheKey });
})(typeof window !== 'undefined' ? window : globalThis);
