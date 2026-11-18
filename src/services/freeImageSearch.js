(function (root) {
    'use strict';
    const CACHE_PREFIX = 'jia_ben_free_image_';
    const TTL = 1000 * 60 * 60 * 24 * 7;
    const safeText = (value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const cacheKey = (place) => `${CACHE_PREFIX}${encodeURIComponent([place?.name, place?.city, place?.category, ...(place?.categories || [])].filter(Boolean).join('|'))}`;
    const readCache = (key) => { try { const cached = JSON.parse(localStorage.getItem(key) || 'null'); return cached && Date.now() - cached.savedAt < TTL ? cached.url : ''; } catch (_) { return ''; } };
    const writeCache = (key, url) => { try { localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), url })); } catch (_) {} };
    const validImageUrl = (url) => typeof url === 'string' && /^https?:\/\//i.test(url) && !/maps\.googleapis\.com|googleusercontent\.com\/maps/i.test(url);
    async function fetchJson(url) {
        const response = await fetch(url, { headers: { Accept: 'application/json' }, mode: 'cors' });
        if (!response.ok) throw new Error(`image-search-${response.status}`);
        return response.json();
    }
    async function findReferenceImage(place) {
        const key = cacheKey(place);
        const cached = readCache(key);
        if (cached) return cached;
        const query = safeText([place?.name, place?.city, place?.category || (place?.categories || [])[0], 'food'].filter(Boolean).join(' '));
        if (!query) return '';
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
        return '';
    }
    root.JiaFreeImageSearch = Object.freeze({ findReferenceImage, cacheKey });
})(typeof window !== 'undefined' ? window : globalThis);
