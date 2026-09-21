const { chromium } = require('playwright-core');
const fixture = [{ jiaPlaceId: 'phase2e', name: 'PHASE2E TEST', address: '測試地址', categories: ['測試'], openingHours: '11:00~14:00, 17:00~21:00', coverPhoto: './assets/place-placeholder.svg' }];
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' });
  const results = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 700]]) {
    const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.addInitScript(() => { window.__JIA_BEN_ENABLE_PERF = true; });
    await page.goto(`http://127.0.0.1:4175/index.html?phase2e=shell-${width}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1400);
    const enter = page.getByRole('button', { name: /直接進入網頁版/ });
    if (await enter.isVisible().catch(() => false)) await enter.click();
    await page.waitForTimeout(600);
    await page.evaluate(f => { window.jiaPlacesData = f; window.restaurantData = f; window.renderHomeForYou?.(); }, fixture);
    await page.waitForTimeout(250);
    const card = page.locator('.restaurant-card').first();
    await card.scrollIntoViewIfNeeded();
    const clickStart = await page.evaluate(() => performance.now());
    await card.click({ position: { x: 20, y: 20 }, timeout: 5000 });
    let visible = false;
    for (let i = 0; i < 100; i++) {
      visible = await page.locator('#card-detail-modal').evaluate(e => !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none').catch(() => false);
      if (visible) break;
      await page.waitForTimeout(5);
    }
    results.push({ viewport: [width, height], clickToVisibleMs: Math.round((await page.evaluate(() => performance.now())) - clickStart), visible, instrumentation: await page.evaluate(() => window.__jiaBenDetailPerf || null), numeric: await page.locator('.numeric-value').allTextContents() });
    await context.close();
  }
  await browser.close(); console.log(JSON.stringify(results, null, 2));
})();
