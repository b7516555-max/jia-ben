const assert = require('assert');
const mapProvider = require('../src/services/mapProvider.js');

function stub(label, fail) {
  const calls = [];
  return {
    calls,
    async initialize() { calls.push(`${label}:initialize`); if (fail) throw new Error('PRIMARY_INIT_FAILED'); return this; },
    destroy() { calls.push(`${label}:destroy`); },
    setCenter(value) { calls.push(`${label}:setCenter:${value.join(',')}`); },
    setZoom(value) { calls.push(`${label}:setZoom:${value}`); },
    fitBounds() {}, setMarkers() {}, selectMarker() {}, getBounds() { return null; },
    setUserLocation() {}, onMarkerClick() {}, onViewportChange() {}, resize() {}
  };
}

(async () => {
  const primary = stub('primary', true);
  const fallback = stub('fallback', false);
  const provider = mapProvider.create({ primary, fallback });
  await provider.initialize({});
  provider.setCenter([22.62, 120.31]);
  assert.deepStrictEqual(provider.getState(), { provider: 'fallback', fallbackUsed: true, primaryError: 'PRIMARY_INIT_FAILED' });
  assert.ok(fallback.calls.includes('fallback:initialize'));
  assert.ok(fallback.calls.some(call => call.startsWith('fallback:setCenter:')));
  console.log('✅ map provider primary-to-fallback behavior passed');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
