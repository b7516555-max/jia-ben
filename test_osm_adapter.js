const nativeFetch = global.fetch;
global.window = global;
const storage = new Map();
global.localStorage = {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key)
};
global.fetch = (url, options = {}) => nativeFetch(url, {
    ...options,
    headers: {
        ...(options.headers || {}),
        'User-Agent': 'JiaBen/1.0 (https://b7516555-max.github.io/jia-ben/)',
        Referer: 'https://b7516555-max.github.io/jia-ben/'
    }
});

require('./osm-adapter.js');

(async () => {
    const results = await window.OSMPlaces.searchPlaces({
        query: '餐廳',
        location: new window.JiaPlaces.LatLng(22.7380, 120.4810),
        radius: 50000
    });
    if (!results.length) throw new Error('OSM/Overpass returned no restaurants');
    const first = results.find(item => item.name && item.name !== '未命名餐飲店') || results[0];
    const detail = await window.OSMPlaces.lookupPlace(first.place_id);
    if (!detail || !Number.isFinite(detail.geometry.location.lat())) throw new Error('OSM lookup failed');
    console.log(JSON.stringify({ count: results.length, first: first.name, placeId: first.place_id, lookup: detail.name }));
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
