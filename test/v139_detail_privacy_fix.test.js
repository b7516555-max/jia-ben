const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
const shell = fs.readFileSync('src/core/uiShell.js', 'utf8');
const appVersion = fs.readFileSync('src/config/appVersion.js', 'utf8');
const notes = fs.readFileSync('src/config/releaseNotes.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

assert.ok(shell.includes("privacy: '隱私權與資料說明'"), 'Privacy has a navigation header title');
assert.ok(shell.includes("guide: '使用指南'"), 'Independent page titles remain complete');
assert.ok(html.includes('profile-food-map-btn') && html.includes('onclick="window.showUserFoodMap(window.currentProfileUser?.name)"'), 'Profile map button has an explicit action');
assert.ok(html.includes("window.switchTab?.('list', true)") && html.includes('list-person'), 'Profile map action switches to the filtered recommendation list');
assert.ok(html.includes('已切換到「${targetName}」的推薦美食清單'), 'Profile map action provides visible feedback');
assert.ok(appVersion.includes("JIA_BEN_VERSION = 'v147'"), 'App version is v147');
assert.ok(notes.includes('v147') && sw.includes('together-eat-shell-v147'), 'Release notes and Service Worker are v147');
console.log('✅ v139 privacy title and profile map action contracts passed');
