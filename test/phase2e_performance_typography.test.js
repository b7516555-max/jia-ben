const assert = require('assert');
const fs = require('fs');

const indexHtml = fs.readFileSync('index.html', 'utf8');
const cardJs = fs.readFileSync('src/components/restaurantCard.js', 'utf8');

assert.ok(indexHtml.includes('window.openDetailModal(detailData);'), 'detail shell still opens from card identity path');
const detailHandler = indexHtml.slice(indexHtml.indexOf('window.openRestaurantDetailByName'), indexHtml.indexOf('// 🌟 全新升級：口袋名單'));
assert.ok(!/await\s+window\.JiaEnrichment\.enrichPlace/.test(detailHandler), 'enrichment must not block detail shell');
assert.ok(detailHandler.includes('window.JiaEnrichment.enrichPlace(jiaPlace).then'), 'secondary enrichment remains progressive');
assert.ok(indexHtml.includes('.numeric-value'), 'numeric style token exists');
assert.ok(indexHtml.includes('class="numeric-value"'), 'party date/time uses numeric style token');
assert.ok(cardJs.includes('class="numeric-value"'), 'restaurant card numeric values use numeric style token');
assert.ok(indexHtml.includes('pb-28 md:pb-8'), 'party mobile bottom-nav clearance remains present');
console.log('PASS: Phase 2E immediate-shell and numeric-typography source regression');
