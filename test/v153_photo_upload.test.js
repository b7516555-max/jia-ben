const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const appVersion = fs.readFileSync(path.join(root, 'src/config/appVersion.js'), 'utf8');
const releaseNotes = fs.readFileSync(path.join(root, 'src/config/releaseNotes.js'), 'utf8');
const imageSafety = require(path.join(root, 'src/utils/imageSafety.js'));

assert.ok(html.includes('MAX_BYTES = 450 * 1024'), 'compression has a 450KB safety limit');
assert.ok(html.includes("toDataURL('image/jpeg'"), 'compression emits JPEG data URLs');
assert.ok(html.includes('image/too-large-after-compression'), 'compression reports oversized output');
assert.ok(html.includes("status: 'local-fallback'"), 'external upload failure falls back to local data URL');
assert.ok(html.includes('window.ensureFirebaseAuth'), 'photo writes ensure a Firebase credential');
assert.ok(html.includes('uploadErr?.code || uploadErr?.message'), 'photo failures expose a concrete reason');
assert.ok(imageSafety.filterSafeImages(['data:image/jpeg;base64,' + 'a'.repeat(100)]).length === 1, 'JPEG data URLs are safe images');
assert.ok(appVersion.includes("JIA_BEN_VERSION = 'v153'"), 'app version is v153');
assert.ok(releaseNotes.includes('v153'), 'release notes include v153');
assert.ok(sw.includes('together-eat-shell-v153') && sw.includes('appVersion.js?v=153') && sw.includes('releaseNotes.js?v=153'), 'Service Worker is v153');
console.log('✅ v153 compressed photo upload, local fallback, auth, and data URL contracts passed');
