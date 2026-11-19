const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
const shell = fs.readFileSync('src/core/uiShell.js', 'utf8');
const appVersion = fs.readFileSync('src/config/appVersion.js', 'utf8');
const notes = fs.readFileSync('src/config/releaseNotes.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

assert.ok(html.includes("get('place')?.trim()"), 'Initial route reads the place deep-link parameter');
assert.ok(html.includes('window.openPlaceDeepLink?.(requestedPlaceId)'), 'Initial place deep-link opens after app startup');
assert.ok(html.includes('window.syncPlaceDeepLink'), 'Opening detail synchronizes the place URL');
assert.ok(html.includes("searchParams.set('place', String(placeId || '')"), 'Place URL contains the canonical place id');
assert.ok(shell.includes("get('place')") && shell.includes("closeModal('card-detail-modal', { fromHistory: true })"), 'Back navigation closes detail without adding history');
assert.ok(html.includes('detail-direct-share-btn') && html.includes('已複製分享連結'), 'Detail page provides a copyable share action');
assert.ok(html.includes('detail-breadcrumb-home') && html.includes('detail-breadcrumb-city'), 'Detail page provides home and city breadcrumbs');
assert.ok(html.includes('detail-explore-more-btn') && html.includes('exploreFromPlace'), 'Detail page provides same-city/category exploration');
assert.ok(html.includes('document.title = `${data.name}'), 'Detail page updates document.title dynamically');
assert.ok(html.includes('release-notes-modal" class="hidden fixed inset-0 z-[200]'), 'Release notes modal is a body-level high-z modal');
assert.ok(appVersion.includes("JIA_BEN_VERSION = 'v145'"), 'App version is v145');
assert.ok(notes.includes('v145') && sw.includes('together-eat-shell-v145'), 'Release notes and Service Worker are v145');
console.log('✅ Place deep-link, detail navigation, and breadcrumb contracts passed');
