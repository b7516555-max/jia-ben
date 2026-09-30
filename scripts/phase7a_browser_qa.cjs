const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const root = path.resolve(__dirname, '..');
const evidence = path.join(root, 'reports', 'evidence', 'phase7a');
fs.mkdirSync(evidence, { recursive: true });
const fixture = [{
  jiaPlaceId: 'phase7a-card', name: '7.0A 測試餐廳', address: '屏東市測試路 1 號', city: '屏東市',
  categories: ['台式料理'], openingHours: '今日 11:00–21:00', location: { lat: 22.6761, lng: 120.4942 },
  communityStats: { ratingAverage: 4.5, ratingCount: 12, averageSpend: 250 }, coverPhoto: './assets/place-placeholder.svg'
}];
const viewports = [[320, 700], [360, 800], [375, 812], [390, 844], [414, 896], [768, 1024], [820, 1180], [1366, 768], [1440, 900], [1920, 1080]];
async function safeScreenshot(page, locator, target) {
  try { await locator.screenshot({ path: target, animations: 'disabled', timeout: 15000 }); }
  catch { await page.screenshot({ path: target, animations: 'disabled', timeout: 15000 }); }
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' });
  const rows = [];
  for (const [width, height] of viewports) {
    const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const errors = [], places = [], notFound = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource.*404/i.test(m.text())) errors.push(m.text()); });
    page.on('request', request => { if (/maps\.googleapis|maps\.google\.com|places\.googleapis/i.test(request.url())) places.push(request.url()); });
    page.on('response', response => { if (response.status() === 404) notFound.push(response.url()); });
    await page.goto(`http://127.0.0.1:4175/index.html?phase7a=${width}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Evidence capture must not wait forever on optional third-party font downloads.
    await page.evaluate(() => document.querySelectorAll('link[href*="fonts.googleapis.com"], link[href*="cdnjs.cloudflare.com"]').forEach(node => node.remove()));
    await page.waitForTimeout(1000);
    const enter = page.getByRole('button', { name: /直接進入網頁版/ });
    if (await enter.isVisible().catch(() => false)) await enter.click();
    await page.evaluate(data => { window.jiaPlacesData = data; window.restaurantData = data; window.renderHomeForYou?.(); }, fixture);
    await page.waitForTimeout(250);
    const card = page.locator('.restaurant-card').filter({ hasText: '7.0A 測試餐廳' }).first();
    const cardCount = await card.count();
    const cardVisible = cardCount > 0;
    const cardText = await card.innerText().catch(() => '');
    const before = await page.evaluate(() => ({ overflow: document.body.scrollWidth > innerWidth, width: document.body.scrollWidth }));
    if (cardVisible) await safeScreenshot(page, card, path.join(evidence, `card-${width}.png`));
    await card.click({ position: { x: 20, y: 20 } }).catch(() => {});
    const detailVisible = await page.locator('#card-detail-modal').isVisible().catch(() => false);
    if (detailVisible) await safeScreenshot(page, page.locator('#card-detail-modal'), path.join(evidence, `detail-${width}.png`));
    await page.locator('#card-detail-modal button').first().click().catch(() => {});
    const cta = page.locator('.contribution-context-cta').first();
    await cta.click({ force: true }).catch(() => {});
    const contributionVisible = await page.getByText('你想幫大家補充哪一項？', { exact: true }).isVisible().catch(() => false);
    const structuredVisible = await page.getByText('每週營業時段設定', { exact: true }).isVisible().catch(() => false);
    const after = await page.evaluate(() => ({ overflow: document.body.scrollWidth > innerWidth, width: document.body.scrollWidth }));
    rows.push({ width, height, cardVisible, requiredText: cardText.includes('7.0A 測試餐廳') && cardText.includes('今日 11:00–21:00'), detailVisible, contributionVisible, structuredVisible, noOverflow: !before.overflow && !after.overflow, places, errors, notFound });
    await context.close();
  }
  await browser.close();
  console.log(JSON.stringify(rows, null, 2));
  if (rows.some(row => !row.cardVisible || !row.requiredText || !row.detailVisible || !row.noOverflow || row.places.length || row.errors.some(error => !/ERR_CONNECTION_RESET/i.test(error)))) process.exitCode = 1;
})();
