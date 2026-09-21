const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'reports', 'jia_ben_6_0j_phase2d_mobile_after');
const CHROME = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const viewports = [
  ['mobile-320', 320, 700], ['mobile-360', 360, 800], ['mobile-375', 375, 812],
  ['mobile-390', 390, 844], ['mobile-414', 414, 896],
  ['desktop-1440', 1440, 900], ['desktop-1920', 1920, 1080]
];
const fixture = [
  { jiaPlaceId: 'phase2d-hours', name: 'TEST RESTAURANT', address: '屏東縣屏東市測試路1號', phone: '08-700-0000', categories: ['測試餐廳'], openingHours: '週一至週日 11:00~21:00', coverPhoto: './assets/place-placeholder.svg', location: { lat: 22.67, lng: 120.49 } },
  { jiaPlaceId: 'phase2d-contribution', name: 'CONTRIBUTION TEST', address: '屏東縣屏東市測試路2號', phone: '', categories: ['測試餐廳'], openingHours: '', coverPhoto: './assets/place-placeholder.svg', location: { lat: 22.67, lng: 120.50 } }
];

fs.mkdirSync(OUT, { recursive: true });
const visibleState = async (page, selector) => page.evaluate((selector) => {
  const el = document.querySelector(selector); if (!el) return { exists: false, visible: false };
  const s = getComputedStyle(el), r = el.getBoundingClientRect();
  const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const x = Math.max(0, Math.min(innerWidth - 1, r.left + r.width / 2));
  const y = Math.max(0, Math.min(innerHeight - 1, r.top + Math.min(r.height / 2, innerHeight - 1)));
  const top = document.elementFromPoint(x, y);
  const covered = !!top && top !== el && !el.contains(top);
  return { exists: true, visible: s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0 && r.width > 0 && r.height > 0 && !covered && !!text, text, box: { x:r.x, y:r.y, width:r.width, height:r.height, bottom:r.bottom, right:r.right }, covered, style:{display:s.display, visibility:s.visibility, opacity:s.opacity} };
}, selector);

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--disable-gpu', '--no-sandbox'] });
  const results = [];
  const selected = process.env.QA_VIEWPORT ? viewports.filter(v => v[0] === process.env.QA_VIEWPORT) : viewports;
  for (const [name, width, height] of selected) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, serviceWorkers: 'block', locale: 'zh-TW', timezoneId: 'Asia/Taipei' });
    const page = await context.newPage(); const errors = []; const places = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(`PAGEERROR: ${e.message}`));
    page.on('request', r => { if (/maps\.googleapis|maps\.google\.com|places\.googleapis/i.test(r.url())) places.push(r.url()); });
    await page.goto('http://127.0.0.1:4175/index.html?phase2d=after', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);
    const enter = page.getByRole('button', { name: /直接進入網頁版/ }); if (await enter.isVisible().catch(() => false)) await enter.click();
    await page.waitForTimeout(1000);
    await page.evaluate((fixture) => { window.jiaPlacesData = fixture; window.restaurantData = fixture; window.renderHomeForYou?.(); }, fixture);
    await page.waitForTimeout(600);
    const homeCard = page.locator('.restaurant-card').filter({ hasText: 'TEST RESTAURANT' }).first();
    await homeCard.scrollIntoViewIfNeeded().catch(() => {});
    const card = await visibleState(page, '.restaurant-card');
    const hoursText = await page.getByText('週一至週日 11:00~21:00', { exact: true }).count();
    await page.screenshot({ path: path.join(OUT, `${name}-card.png`), fullPage: false, timeout: 5000, animations: 'disabled' }).catch(() => {});
    const cta = page.getByRole('button', { name: /回報營業時間|回報最新營業時間/ }).last();
    const ctaVisible = await cta.isVisible().catch(() => false); let modal = false; let structured = false; let secondShift = false;
    if (ctaVisible) { await cta.scrollIntoViewIfNeeded(); await cta.click(); await page.waitForTimeout(300); modal = await page.getByText('你想幫大家補充哪一項？', { exact: true }).isVisible().catch(() => false); structured = await page.getByText('每週營業時段設定', { exact: true }).isVisible().catch(() => false); const second = page.getByRole('button', { name: /二段/ }).first(); secondShift = await second.isVisible().catch(() => false); if (secondShift) { await second.click(); await page.waitForTimeout(150); secondShift = await page.locator('input[type="time"]').count() >= 4; } await page.screenshot({ path: path.join(OUT, `${name}-contribution.png`), fullPage: false, timeout: 5000, animations: 'disabled' }).catch(() => {}); }
    await page.evaluate(() => { document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach(el => el.classList.add('hidden')); window.partyData = [{ id:'phase2d-party', title:'TEST RESTAURANT', date:'2026/09/26', time:'18:30', location:'TEST RESTAURANT', group:'QA', options:['測試聚餐'], amount:600, costMode:'split', creator:'QA', joined:['甲','乙','丙'], votes:{} }]; window.switchTab?.('party', true); });
    await page.waitForTimeout(350);
    const party = page.locator('#party-container .restaurant-card').filter({ hasText: 'TEST RESTAURANT' }).first(); await party.scrollIntoViewIfNeeded().catch(() => {});
    const partyText = await party.innerText().catch(() => ''); const partyVisible = await visibleState(page, '#party-container .restaurant-card');
    const lastPartyAction = page.locator('#party-container .party-recap-action').first(); await lastPartyAction.scrollIntoViewIfNeeded().catch(() => {});
    const partyBottom = await page.evaluate(() => { const el = document.querySelector('#party-container .party-recap-action'); const nav = document.querySelector('nav'); if (!el || !nav) return null; const er=el.getBoundingClientRect(), nr=nav.getBoundingClientRect(); return { actionBottom:er.bottom, navTop:nr.top, visibleAboveNav: er.bottom <= nr.top + 1 }; });
    await page.screenshot({ path: path.join(OUT, `${name}-party.png`), fullPage: false, timeout: 5000, animations: 'disabled' }).catch(() => {});
    await page.evaluate((fixture) => { window.jiaPlacesData = fixture; window.restaurantData = fixture; window.renderHomeForYou?.(); window.switchTab?.('explore', true); }, fixture); await page.waitForTimeout(350); const detailCard = page.locator('.restaurant-card').filter({ hasText: 'TEST RESTAURANT' }).first(); await detailCard.scrollIntoViewIfNeeded().catch(() => {}); await detailCard.click({ position: { x: 30, y: 30 }, timeout: 5000 }).catch(() => {}); await page.waitForTimeout(500);
    const detail = await visibleState(page, '#card-detail-modal'); const detailText = await page.locator('#card-detail-modal').innerText().catch(() => '');
    const metrics = await page.evaluate(() => ({ innerWidth, bodyScrollWidth:document.body.scrollWidth, overflow:document.body.scrollWidth > innerWidth + 1, bodyText:document.body.innerText }));
    results.push({ name, width, height, card, hoursText, ctaVisible, modal, structured, secondShift, partyVisible, partyText, partyBottom, detailVisible:detail.visible, detailText, metrics:{overflow:metrics.overflow, bodyScrollWidth:metrics.bodyScrollWidth}, consoleErrors:errors, googlePlacesRequests:places });
    await context.close();
  }
  await browser.close(); fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ generatedAt:new Date().toISOString(), results }, null, 2)); console.log(JSON.stringify(results, null, 2));
})().catch(e => { console.error(e.stack || e); process.exitCode = 1; });
