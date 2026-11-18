const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const mapCss = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles', 'interactive-map.css'), 'utf8');
const uiShell = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'uiShell.js'), 'utf8');

assert.ok(html.includes("new URLSearchParams(window.location.search).get('party')"), 'Party deep link parses the party query parameter');
assert.ok(html.includes("get('party')") && fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'uiShell.js'), 'utf8').includes("switchTab?.('party', true)"), 'Party deep link enters the party tab');
assert.ok(html.includes('data-party-id="${window.escapeHtml(p.id)}"'), 'Rendered party cards expose a safe deep-link target');
assert.ok(html.includes('window.focusPartyDeepLink'), 'Party deep link focuses and highlights the matching card');
assert.ok(html.includes('party-deep-link-highlight'), 'Party deep link has a temporary highlight style');
assert.ok(html.includes('shareUrl.searchParams.set(\'party\', p.id)'), 'Party share URLs include the party id');
assert.ok(html.includes('localStorage.getItem(\'jia_ben_party_guest\')'), 'Guest identity is restored from local storage');
assert.ok(html.includes('guestJoinedIds'), 'Guest participation uses a persistent id set for deduplication');
assert.ok(html.includes('guestVotes'), 'Guest votes use a persistent id map for deduplication');
assert.ok(html.includes('window.ensurePartyGuestIdentity'), 'Guest actions request only a nickname instead of full identity registration');
assert.ok(html.includes('window.showGuestRetentionMsg(\'已記錄你的選擇！日後可隨時建檔／登入保存跨裝置紀錄。\')'), 'Guest vote completion gives a retention hint');
assert.ok(html.includes('GoogleAuthProvider'), 'Firebase Google provider is imported');
assert.ok(html.includes('signInWithPopup') && html.includes('signInWithRedirect'), 'Google login supports popup and redirect fallback');
assert.ok(html.includes('getRedirectResult'), 'Google redirect result is handled on load');
assert.ok(html.includes('window.mergeGuestPartyRecords'), 'Guest party records are merged after account login');
assert.ok(html.includes("provider === 'google' ? user.uid"), 'Google uid is synchronized to the existing profile structure');
assert.ok(html.includes('custom-alert-google-btn'), 'Guest completion prompt offers Google login shortcut');
assert.strictEqual((sw.match(/together-eat-shell-v135/g) || []).length, 1, 'Service Worker cache is v135');
assert.ok(html.includes('window.applyUrlPrefill'), 'LINE assistant prefill routing hook exists');
assert.ok(html.includes("page === 'list' && params.get('addName')?.trim()"), 'List deep link accepts addName');
assert.ok(html.includes("page === 'party' && params.get('quickTitle')?.trim()"), 'Party deep link accepts quickTitle');
assert.ok(html.includes("resultEl.scrollIntoView({ behavior: 'smooth', block: 'center' })"), 'Wheel result scrolls into view after drawing');
assert.ok(html.includes('padding-bottom: 7rem') && html.includes('overflow: visible !important'), 'Mobile wheel view reserves bottom safe space');
assert.ok(uiShell.includes("setTimeout(() => root.applyUrlPrefill?.(), 80)"), 'Popstate reapplies only explicit URL prefill parameters');
assert.ok(mapCss.includes('padding-bottom: 0') && mapCss.includes('min-height: 0') && mapCss.includes('overflow-y: auto'), 'Mobile map drawer removes the extra bottom gap and keeps the list scrollable');
assert.ok(uiShell.includes("root.addEventListener('popstate'"), 'Browser back/forward listens for popstate');
assert.ok(uiShell.includes("get('page') || 'explore'"), 'Popstate defaults to explore at the root route');
assert.ok(uiShell.includes("root.switchTab(page, true, { fromHistory: true })"), 'Popstate switches the visible page without pushing history again');
assert.ok(html.includes("window.history.replaceState({ page: 'explore' }"), 'Initial root route uses replaceState for explore');

function applyGuestJoin(party, guest) {
  const joined = Array.isArray(party.joined) ? [...party.joined] : [];
  const guestJoinedIds = Array.isArray(party.guestJoinedIds) ? [...party.guestJoinedIds] : [];
  const alreadyJoined = guestJoinedIds.includes(guest.id);
  if (alreadyJoined) {
    guestJoinedIds.splice(guestJoinedIds.indexOf(guest.id), 1);
    const nameIndex = joined.indexOf(guest.name);
    if (nameIndex >= 0) joined.splice(nameIndex, 1);
  }
  else { joined.push(guest.name); guestJoinedIds.push(guest.id); }
  return { ...party, joined, guestJoinedIds };
}

const guest = { id: 'guest_test_1', name: '測試訪客' };
const firstJoin = applyGuestJoin({ joined: [], guestJoinedIds: [] }, guest);
assert.deepStrictEqual(firstJoin.joined, ['測試訪客'], 'First guest join is recorded');
assert.deepStrictEqual(firstJoin.guestJoinedIds, ['guest_test_1'], 'First guest join stores the persistent id');
const secondJoin = applyGuestJoin(firstJoin, guest);
assert.deepStrictEqual(secondJoin.joined, [], 'Repeated guest join toggles off instead of duplicating');
assert.deepStrictEqual(secondJoin.guestJoinedIds, [], 'Repeated guest join removes the persistent id');

console.log('✅ Party deep link and guest participation contracts passed');
