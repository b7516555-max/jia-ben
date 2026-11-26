const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const authConfig = fs.readFileSync(path.join(root, 'src/config/authConfig.js'), 'utf8');

assert.ok(html.includes('signInWithPopup(auth, googleProvider)'), 'Google popup login remains wired to the click handler');
assert.ok(html.includes("await getRedirectResult(auth)") && html.includes('redirectResult?.user'), 'Google redirect result is processed during initialization');
assert.ok(html.includes('auth/operation-not-allowed') && html.includes('auth/unauthorized-domain') && html.includes('錯誤碼：'), 'Google Firebase error codes are classified and shown');
assert.ok(html.includes('await window.liff.init({ liffId })') && html.includes("scope: ['openid', 'profile']"), 'LINE LIFF initialization and required scopes are wired');
assert.ok(html.includes('completeLineLiffLogin()') && html.includes('clearAuthCallbackParams()'), 'LINE callback profile sync and OAuth parameter cleanup are wired');
assert.ok(html.includes('line/profile-scope-required') && html.includes('Channel 已 Published'), 'LINE profile scope and Published guidance is present');
assert.ok(authConfig.includes('LINE_LIFF_ID'), 'LINE LIFF ID remains centralized');
assert.ok(sw.includes("['code', 'state', 'liff.state']") && sw.includes('if (isOAuthCallback)') && sw.includes('event.respondWith(fetch(event.request))'), 'Service Worker sends OAuth callback navigations directly to network');
console.log('✅ v152 Google popup/redirect, LINE LIFF callback, error-code, and Service Worker OAuth contracts passed');
