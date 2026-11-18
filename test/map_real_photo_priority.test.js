const assert = require('assert');
const fs = require('fs');

const imageSafety = require('../src/utils/imageSafety.js');
const mapSource = fs.readFileSync('src/services/interactiveMap.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

const place = {
  name: '地圖實拍測試店',
  category: '火鍋',
  coverPhoto: './assets/places/ai-hotpot.png',
  photos: [{ imageUrl: 'https://storage.googleapis.com/example/real-hotpot.jpg' }]
};
const selected = imageSafety.selectImage(place);
assert.strictEqual(selected.url, 'https://storage.googleapis.com/example/real-hotpot.jpg', 'Real photo outranks AI fallback in every view');
assert.strictEqual(selected.isAiFallback, false, 'Real map photo is not marked as AI fallback');

const drivePlace = { name: 'Google Drive 實拍店', category: '小吃', imageUrl: 'https://drive.google.com/uc?id=photo123' };
assert.strictEqual(imageSafety.selectImage(drivePlace).url, drivePlace.imageUrl, 'Drive-hosted photo remains allowed');
assert.ok(mapSource.includes('window.imageSafety?.selectImage?.(place || item'), 'Map marker popup uses the shared photo selector');
assert.ok(mapSource.includes('marker.bindPopup'), 'Map markers expose the selected photo in a popup');
assert.ok(mapSource.includes('return { ...raw, ...normalized, raw }'), 'Map models retain original photo fields after normalization');
assert.ok(html.includes('id="release-notes-modal" class="hidden fixed inset-0 z-[200]'), 'Release notes modal sits above the welcome screen');
console.log('✅ Map real-photo priority and release-note layering contracts passed');
