const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const version = fs.readFileSync(path.join(root, 'src/config/appVersion.js'), 'utf8');
const notes = fs.readFileSync(path.join(root, 'src/config/releaseNotes.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

assert.ok(html.includes('onclick="window.openAddModal?.()"') && html.includes('>新增好店</span>'), 'explore list has persistent add restaurant entry');
assert.ok(html.includes('找不到這間店？點我新增') && html.includes('decodeURIComponent'), 'empty search state pre-fills add form with query');
assert.ok(html.includes('signInAnonymously(auth)') && html.includes("'公開吃貨圈'") && html.includes("'公開吃貨'"), 'visitor submission has anonymous and local fallback identity');
assert.ok(html.includes('window.jiaPlacesData = [localPlace') && html.includes('window.renderHomeForYou?.()'), 'new restaurant refreshes canonical in-memory list and home view');
assert.ok(!html.includes("if (!window.isMemberSignedIn()) {\n                window.requireIdentity(() => window.submitForm())"), 'new restaurant submission is not blocked by member identity gate');
assert.ok(/match \/restaurants\/\{resId\}[^]*allow create: if isSignedIn\(\);/.test(rules), 'Firestore restaurants create requires signed-in or anonymous auth');
assert.ok(version.includes("JIA_BEN_VERSION = 'v151'"), 'app version is v151');
assert.ok(notes.includes('v151') && sw.includes('together-eat-shell-v151'), 'release notes and Service Worker are v151');
assert.ok(html.includes("publicCreatorFallback") && html.includes("['公開吃貨圈', '呷奔吃貨團']") && html.includes("allowedCreators = isPublicAddGroup ? [publicCreatorFallback]"), 'public guest creator defaults to 公開吃貨 without empty member option');
console.log('✅ v151 add-restaurant creator fallback and v150 visitor submit contracts passed');
