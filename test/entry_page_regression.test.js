const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
const appVersion = fs.readFileSync('src/config/appVersion.js', 'utf8');
const releaseNotes = fs.readFileSync('src/config/releaseNotes.js', 'utf8');

assert.ok(html.includes('mainApp.classList.remove(\'hidden\');'), 'Entering the app reveals the main shell immediately');
assert.ok(html.includes("intro.classList.add('intro-exit', 'pointer-events-none')"), 'Welcome overlay stops intercepting clicks immediately');
assert.ok(html.includes("window.setTimeout(() => intro.classList.add('hidden'), 400)"), 'Welcome overlay is cleaned up after its visual fade');
assert.ok(html.includes('if (!mainApp) return false;'), 'Entry action is guarded when the shell is unavailable');
assert.ok(html.includes('if (!modal) return;'), 'Release note close action is null-safe');
assert.ok(html.includes('window.__JIA_PENDING_RELEASE_NOTES = true;'), 'First-run release notes are deferred from the welcome overlay');
assert.ok(html.includes('if (window.__JIA_PENDING_RELEASE_NOTES)'), 'Deferred release notes open after entering the app');
assert.ok(html.includes('appVersion.js?v=133') && html.includes('releaseNotes.js?v=133'), 'HTML loads the v133 configuration files');
assert.ok(appVersion.includes("JIA_BEN_VERSION = 'v133'"), 'App version is v133');
assert.ok(releaseNotes.includes('v133'), 'Release notes include v133');
assert.ok(sw.includes('together-eat-shell-v133') && sw.includes('appVersion.js?v=133') && sw.includes('releaseNotes.js?v=133'), 'Service Worker is v133');
console.log('✅ Entry page immediate-response regression contract passed');
