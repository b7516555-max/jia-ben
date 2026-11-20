const assert = require('assert');
const fs = require('fs');
const path = require('path');

const imageSafety = require('../src/utils/imageSafety.js');
const root = path.join(__dirname, '..');

const sushi = imageSafety.selectImage({ name: '野田壽司', category: '日式料理' });
assert.strictEqual(sushi.url, './assets/places/ai-sushi.png');
assert.strictEqual(sushi.isAiFallback, true);
assert.strictEqual(sushi.label, 'AI 餐點示意');

const realPhoto = imageSafety.selectImage({
  name: '野田壽司',
  category: '日式料理',
  communityPhotos: ['https://example.test/real-sushi.jpg']
});
assert.strictEqual(realPhoto.url, 'https://example.test/real-sushi.jpg');
assert.strictEqual(realPhoto.isAiFallback, false, 'Real photos remain ahead of static AI assets');

for (const asset of Object.values(imageSafety.STATIC_AI_FOOD_ASSETS)) {
  const file = path.join(root, asset.replace(/^\.\//, ''));
  assert.ok(fs.existsSync(file), `Static AI food asset exists: ${asset}`);
  assert.ok(fs.statSync(file).size > 1000, `Static AI food asset is not empty: ${asset}`);
}

const card = fs.readFileSync(path.join(root, 'src/components/restaurantCard.js'), 'utf8');
const map = fs.readFileSync(path.join(root, 'src/services/interactiveMap.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
assert.ok(card.includes('vm.isPlaceholder && !vm.isReferenceFallback'), 'Restaurant cards do not externally search for local fallbacks');
assert.ok(map.includes('window.imageSafety?.selectImage?.'), 'Map cards share the image safety selector');
assert.ok(map.includes('data-jia-free-image="${shouldSearchExternal ? \'1\' : \'0\'}"'), 'Map cards skip external search for local assets');
assert.ok(sw.includes('together-eat-shell-v149'), 'Service Worker cache is v149');
console.log('✅ Static AI food priority and local-image performance contracts passed');
