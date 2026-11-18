const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scriptSources = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)]
  .map(match => match[1].split('?')[0])
  .filter(source => !/^https?:\/\//.test(source));
assert.ok(scriptSources.length > 40, 'The complete local script inventory was discovered');
for (const source of scriptSources) {
  const file = path.join(root, source.replace(/^\.\//, ''));
  assert.ok(fs.existsSync(file), `Local script exists: ${source}`);
  execFileSync(process.execPath, ['--check', file], { stdio: 'ignore' });
}

const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match => match[1])
  .filter(source => source.trim() && !source.trim().startsWith('{') && !source.includes('import {'));
assert.ok(inlineScripts.length > 1, 'Inline application scripts were discovered');
for (const source of inlineScripts) new Function(source);

assert.ok(html.includes('window.enterApp = function'), 'Entry function is defined');
assert.ok(html.includes('window.switchTab = fallbackSwitchTab'), 'Emergency switchTab fallback exists');
assert.ok(html.includes('window.renderHomeForYou = renderFallbackHome'), 'Emergency home renderer exists');
assert.ok(html.includes('window.quickDecidePlace = function'), 'Emergency quick-decision fallback exists');
assert.ok(html.includes('window.__JIA_EMERGENCY_BOOTSTRAP = true'), 'Emergency bootstrap marks recovery state');
assert.ok(html.includes('firebasejs/11.6.1/firebase-auth.js'), 'Firebase Auth module source is present');
assert.ok(html.includes('firebasejs/11.6.1/firebase-firestore.js'), 'Firebase Firestore module source is present');

const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
assert.ok(sw.includes('self.skipWaiting()') && sw.includes('self.clients.claim()'), 'Service Worker activates the newest shell');
assert.ok(sw.includes('together-eat-shell-v134'), 'Service Worker cache is v134');
console.log('✅ Full-page script, module, fallback, and Service Worker bootstrap audit passed');
