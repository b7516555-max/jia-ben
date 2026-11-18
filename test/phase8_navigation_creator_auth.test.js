const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const authConfig = fs.readFileSync(path.join(root, 'src', 'config', 'authConfig.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

assert.ok(html.includes('id="tab-more"') && html.includes('id="mobile-more-menu"'), 'Mobile navigation uses the 4+1 layout');
assert.ok(html.includes('flex-wrap'), 'Quick filters can wrap on narrow screens');
assert.ok(html.includes("history.pushState") && html.includes("addEventListener('popstate'"), 'Independent page routing supports browser history');
assert.ok(html.includes('id="view-creator"') && html.includes("'creator'"), 'Creator page has internal routing and entry points');
assert.ok(!html.includes('b7516555.netlify.app'), 'External producer website is absent from site HTML');
assert.ok(!html.includes('AI 示意圖'), 'AI fallback label is absent from visible UI');
assert.ok(html.includes('Google 地圖最新資訊'), 'Restaurant detail offers a free Google Maps direct link');
assert.ok(html.includes('window.signInWithLine') && html.includes('window.signInWithEmail'), 'LINE and Email login entry points exist');
assert.ok(authConfig.includes('LINE_LIFF_ID'), 'LINE LIFF ID is centralized in auth config');
assert.ok(sw.includes('together-eat-shell-v121'), 'Service Worker cache is v121');

console.log('✅ Phase 8 navigation, creator, image, map, and auth contracts passed');
