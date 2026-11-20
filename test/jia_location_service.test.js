const assert = require('assert');
const fs = require('fs');
const path = require('path');
const api = require('../src/services/jiaLocationService.js');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/services/jiaLocationService.js'), 'utf8');
const storageMap = new Map();
const storage = { getItem: key => storageMap.get(key) || null, setItem: (key, value) => storageMap.set(key, value), removeItem: key => storageMap.delete(key) };
const saved = api.save({ lat: 22.6273, lng: 120.3014, accuracy: 25 }, 'gps', storage);
assert.strictEqual(saved.accuracy, 25);
assert.strictEqual(api.readSaved(storage).lat, 22.6273);
assert.strictEqual(api.label(saved), '📍 已定位 (±25m)');
const manual = api.save({ lat: 22.625, lng: 120.357 }, 'manual', storage, '高雄鳳山');
assert.strictEqual(manual.source, 'manual');
assert.strictEqual(api.label(manual), '📍 手動：高雄鳳山');
storageMap.set(api.STORAGE_KEY, JSON.stringify({ lat: 25.033, lng: 121.5654, accuracy: 2500 }));
assert.strictEqual(api.readSaved(storage), null);
assert.strictEqual(storage.getItem(api.STORAGE_KEY), null);
assert.ok(api.mapsUrl({ name: '麥料食堂', address: '高雄市鳳山區澄清路85號' }).includes(encodeURIComponent('麥料食堂 高雄市鳳山區澄清路85號')));
assert.ok(api.mapsUrl({ name: '無地址店家', city: '屏東縣', district: '九如鄉' }).includes(encodeURIComponent('無地址店家 屏東縣九如鄉')));
assert.ok(api.mapsUrl({ name: '座標店', location: { lat: 22.6, lng: 120.3 } }).includes(encodeURIComponent('座標店')));
assert.ok(source.includes('enableHighAccuracy: true') && source.includes('maximumAge: 0') && source.includes('clearWatch'));
assert.ok(!source.includes('25.0330') && !source.includes('25.033, 121.5654'));

const restaurantCard = require('../src/components/restaurantCard.js');
const cardHtml = restaurantCard.render({ name: '測試店家', address: '高雄市', location: { lat: 22.6, lng: 120.3 } }, { distanceKm: 1.8 });
assert.ok(cardHtml.includes('1.8 km'), 'distance-sorted card retains km badge');

async function testRejectsCoarseGps() {
    const previousDescriptor = Object.getOwnPropertyDescriptor(global, 'navigator');
    let clearCount = 0;
    Object.defineProperty(global, 'navigator', { configurable: true, value: { geolocation: {
        watchPosition(success, failure, options) {
            assert.strictEqual(options.enableHighAccuracy, true);
            assert.strictEqual(options.maximumAge, 0);
            assert.strictEqual(options.timeout, 10000);
            success({ coords: { latitude: 25.033, longitude: 121.5654, accuracy: 2500 } });
            return 7;
        },
        clearWatch(id) { clearCount += 1; assert.strictEqual(id, 7); }
    } } });
    try {
        await api.request({ timeout: 1 });
        assert.fail('coarse GPS should be rejected');
    } catch (error) {
        assert.strictEqual(error.rejectedAccuracy, 2500);
    } finally {
        if (previousDescriptor) Object.defineProperty(global, 'navigator', previousDescriptor);
        else delete global.navigator;
    }
    assert.strictEqual(clearCount, 1);
}

testRejectsCoarseGps().then(() => console.log('✅ high-precision location, drift rejection, distance badge and Google Maps contracts passed'));
