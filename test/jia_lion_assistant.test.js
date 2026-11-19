const assert = require('assert');
const fs = require('fs');
const Lion = require('../src/services/jiaLionAssistant.js');

const places = [
  { jiaPlaceId: 'a', name: '高雄炭火燒肉', city: '高雄市', category: '燒肉', averageSpend: 480 },
  { jiaPlaceId: 'b', name: '屏東拉麵屋', city: '屏東縣', categories: ['拉麵'], averageSpend: 220 },
  { jiaPlaceId: 'c', name: '高雄咖啡日和', city: '高雄市', categories: ['咖啡／甜點'], averageSpend: 180 },
  { jiaPlaceId: 'd', name: '小獅行動餐車', city: '屏東縣', isFoodTruck: true }
];

const parsed = Lion.parseQuery('高雄 燒肉 500');
assert.strictEqual(parsed.city, '高雄');
assert.strictEqual(parsed.category, '燒肉');
assert.strictEqual(parsed.budget, 500);
assert.strictEqual(Lion.filterPlaces(parsed, places)[0].jiaPlaceId, 'a');
assert.strictEqual(Lion.filterPlaces('屏東 拉麵', places)[0].jiaPlaceId, 'b');
assert.strictEqual(Lion.filterPlaces('行動餐車', places)[0].jiaPlaceId, 'd');

const html = fs.readFileSync('index.html', 'utf8');
const lion = fs.readFileSync('src/services/jiaLionAssistant.js', 'utf8');
const auth = fs.readFileSync('src/config/authConfig.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
assert.ok(html.includes('id="jia-lion"') && html.includes('4.75rem + env(safe-area-inset-bottom)'), 'Lion UI clears the mobile bottom navigation');
assert.ok(html.includes('modal-backdrop') && html.includes('is-compact'), 'Lion UI has modal/map avoidance hooks');
assert.ok(auth.includes("LINE_ASSISTANT_URL: 'https://line.me/R/ti/p/@030xdxlb'"), 'LINE assistant URL is configured centrally');
assert.ok(lion.includes("target = '_blank'") && lion.includes("rel = 'noopener noreferrer'"), 'LINE assistant opens safely in a new tab');
assert.ok(html.includes('body.map-view-active #jia-lion') && lion.includes('shell.classList.toggle(\'is-hidden\', shouldHide)'), 'Lion is hidden while the map page is active');
assert.ok(sw.includes('together-eat-shell-v142') && sw.includes('jiaLionAssistant.js?v=135'), 'Service Worker includes v142 cache and Lion assets');
assert.ok(Lion.getGrowthState().title === '貪吃小獅', 'Default Lion growth title is stable');
console.log('✅ Jia Lion keyword, growth, LINE guard, and responsive contract tests passed');
