const assert = require('assert');
const fs = require('fs');
const path = require('path');
const supportCard = require('../src/utils/supportCard.js');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'src', 'config', 'authConfig.js'), 'utf8');
const uiShell = fs.readFileSync(path.join(root, 'src', 'core', 'uiShell.js'), 'utf8');

function makeDocument() {
    const attributes = {};
    const link = {
        href: '', textContent: '', target: '', rel: '',
        setAttribute(name, value) { attributes[name] = value; this[name] = value; },
        removeAttribute(name) { delete attributes[name]; if (name === 'href') this.href = ''; }
    };
    return {
        attributes,
        card: { hidden: false },
        link,
        getElementById(id) {
            if (id === 'creator-support-card') return this.card;
            if (id === 'creator-support-link') return this.link;
            return null;
        }
    };
}

assert.ok(source.includes("SUPPORT_URL: ''"), 'Support URL defaults to empty');
assert.ok(source.includes("SUPPORT_LABEL: '🧋 請主揪喝杯珍奶'"), 'Support label has the requested default');
assert.ok(uiShell.includes('configureJiaBenSupportCard'), 'Creator route configures the optional support card');
assert.ok(html.includes('id="creator-support-card" hidden'), 'Support card is hidden by default');
assert.ok(html.includes('id="creator-support-link"') && html.includes('noopener noreferrer'), 'Support link is prepared with safe new-tab attributes');
assert.ok(html.includes('任何自願性小額支持皆導向外部第三方金流平台') && html.includes('不經手、不蒐集也不儲存任何信用卡或銀行帳戶資料'), 'Privacy page explains third-party payment handling');

const disabled = makeDocument();
assert.strictEqual(supportCard.configureSupportCard(disabled, { SUPPORT_URL: '', SUPPORT_LABEL: '支援' }), false);
assert.strictEqual(disabled.card.hidden, true, 'Empty support URL keeps card hidden');
assert.strictEqual(disabled.link.href, '', 'Empty support URL leaves no active href');

const enabled = makeDocument();
assert.strictEqual(supportCard.configureSupportCard(enabled, { SUPPORT_URL: 'https://ko-fi.com/jia-ben', SUPPORT_LABEL: '🧋 支持呷奔' }), true);
assert.strictEqual(enabled.card.hidden, false, 'Valid HTTPS enables the card');
assert.strictEqual(enabled.link.href, 'https://ko-fi.com/jia-ben', 'Valid HTTPS is rendered as the link');
assert.strictEqual(enabled.link.textContent, '🧋 支持呷奔', 'Configured label is rendered as text');
assert.strictEqual(enabled.link.target, '_blank', 'Link opens in a new tab');
assert.strictEqual(enabled.link.rel, 'noopener noreferrer', 'New-tab link is isolated from opener');

for (const invalidUrl of ['http://example.com', 'javascript:alert(1)', 'not a URL', 'https://user:pass@example.com']) {
    const invalid = makeDocument();
    assert.strictEqual(supportCard.configureSupportCard(invalid, { SUPPORT_URL: invalidUrl }), false, `${invalidUrl} is rejected`);
    assert.strictEqual(invalid.card.hidden, true, 'Invalid URL keeps card hidden');
    assert.strictEqual(invalid.link.href, '', 'Invalid URL leaves no active href');
}

console.log('✅ Optional support card configuration and privacy contracts passed');
