const assert = require('assert');
const fs = require('fs');

const tokens = fs.readFileSync('src/styles/design-tokens.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const card = fs.readFileSync('src/components/restaurantCard.js', 'utf8');
const appVersion = fs.readFileSync('src/config/appVersion.js', 'utf8');
const notes = fs.readFileSync('src/config/releaseNotes.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

assert.ok(tokens.includes('--jia-text-meta: .8125rem'), 'Meta text is at least 13px');
assert.ok(tokens.includes('--jia-text-secondary: .875rem'), 'Secondary text is at least 14px');
assert.ok(tokens.includes('--jia-text-body: 1rem'), 'Body text is 16px');
assert.ok(tokens.includes('--jia-text-name: 1.125rem'), 'Names are at least 18px');
assert.ok(tokens.includes('--jia-text-title: 1.625rem'), 'Titles are at least 26px');
assert.ok(tokens.includes('input, select, textarea { font-size: 16px'), 'Form controls have an iOS-safe 16px floor');
assert.ok(tokens.includes('.text-\\[9px\\], .text-\\[10px\\], .text-\\[11px\\]'), 'Legacy compact utility classes receive a readable floor');
assert.ok(html.includes('design-tokens.css?v=145'), 'Readability stylesheet remains cache-busted');
assert.ok(card.includes('restaurant-card h3') || tokens.includes('.restaurant-card h3'), 'Restaurant names have a readable size rule');
assert.ok(appVersion.includes("JIA_BEN_VERSION = 'v149'"), 'App version is v149');
assert.ok(notes.includes('v144') && notes.includes('可讀性'), 'Release notes retain the readability upgrade');
assert.ok(sw.includes('together-eat-shell-v149') && sw.includes('design-tokens.css?v=145'), 'Service Worker caches the current readability assets');
console.log('✅ Readability token, form-control, responsive floor, and v149 contracts passed');
