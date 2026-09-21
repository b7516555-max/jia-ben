const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' });
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p = await c.newPage();
  await p.addInitScript(() => { window.__JIA_BEN_ENABLE_PERF = true; });
  await p.goto('http://127.0.0.1:4175/index.html?phase2e=slow', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.waitForTimeout(1400); const enter = p.getByRole('button', { name: /直接進入網頁版/ }); if (await enter.isVisible().catch(() => false)) await enter.click(); await p.waitForTimeout(600);
  await p.evaluate(f => { const fixture = [{ jiaPlaceId: 'slow', name: 'SLOW NETWORK TEST', address: '測試地址', categories: ['測試'], openingHours: '11:00~21:00', coverPhoto: './assets/place-placeholder.svg' }]; window.jiaPlacesData = fixture; window.restaurantData = fixture; window.renderHomeForYou?.(); }, null);
  await p.waitForTimeout(250); await p.route('**/*', async route => { await new Promise(resolve => setTimeout(resolve, 1000)); await route.continue(); });
  const card = p.locator('.restaurant-card').first(); await card.scrollIntoViewIfNeeded(); const start = await p.evaluate(() => performance.now()); await card.click({ position: { x: 20, y: 20 } });
  let visible = false; for (let i = 0; i < 100; i++) { visible = await p.locator('#card-detail-modal').evaluate(e => !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none').catch(() => false); if (visible) break; await p.waitForTimeout(5); }
  console.log(JSON.stringify({ visible, clickToVisibleMs: Math.round((await p.evaluate(() => performance.now())) - start), instrumentation: await p.evaluate(() => window.__jiaBenDetailPerf || null) }, null, 2)); await b.close();
})();
