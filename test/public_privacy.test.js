const assert = require('assert');
const fs = require('fs');
const privacy = require('../src/utils/publicPrivacy.js');
const html = fs.readFileSync('index.html', 'utf8');
const version = fs.readFileSync('src/config/appVersion.js', 'utf8');

assert.strictEqual(privacy.isPrivateGroup('社發'), true, 'Internal groups are classified as private');
assert.ok(!privacy.publicGroupLabel('社發').includes('社發'), 'Private group names are not exposed to visitors');
assert.ok(privacy.publicGroupLabel('高雄').includes('高雄'), 'Public city circle remains visible');
assert.notStrictEqual(privacy.publicNickname({ name: '黃政誥' }), '黃政誥', 'Legacy real names are de-identified');
assert.strictEqual(privacy.publicNickname({ name: '黃政誥', publicNickname: '巷口獅' }), '巷口獅', 'Explicit public nickname wins');
assert.ok(privacy.getPublicGroupOptions(['社發', '高雄']).every(option => !option.label.includes('社發')), 'Public group options hide private names');
assert.ok(html.includes('src="./src/utils/publicPrivacy.js?v=140"'), 'Privacy layer is loaded before app code');
assert.ok(html.includes('id="privacy-version"'), 'Privacy page version is dynamic');
assert.ok(html.includes('全部公開精選') && html.includes('我的口袋名單'), 'Pocket list uses privacy-safe filters');
assert.ok(version.includes("JIA_BEN_VERSION = 'v140'"), 'App version is v140');
console.log('✅ Public nickname and private-group privacy contracts passed');
