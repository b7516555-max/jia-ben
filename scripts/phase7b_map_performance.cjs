const { chromium } = require('playwright-core');
const fixture = size => Array.from({ length: size }, (_, i) => ({ jiaPlaceId: `perf-${size}-${i}`, name: `Perf ${i}`, location: { lat: 22.4 + (i % 50) * .006, lng: 120.1 + Math.floor(i / 50) * .006 }, categories: ['測試'] }));
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  await page.goto('http://127.0.0.1:4175/index.html?phase7b-performance=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
  const enter = page.getByRole('button', { name: /直接進入網頁版/ }); if (await enter.isVisible().catch(() => false)) await enter.click();
  await page.evaluate(() => window.switchTab?.('map', true)); await page.waitForTimeout(800);
  const results = await page.evaluate(async sizes => {
    const rows = [];
    for (const size of sizes) { const data = Array.from({ length: size }, (_, i) => ({ jiaPlaceId: `perf-${size}-${i}`, name: `Perf ${i}`, location: { lat: 22.4 + (i % 50) * .006, lng: 120.1 + Math.floor(i / 50) * .006 }, categories: ['測試'] })); const start = performance.now(); window.JiaInteractiveMap.setPlaces(data); await new Promise(resolve => setTimeout(resolve, 0)); rows.push({ size, renderMs: performance.now() - start, state: window.JiaInteractiveMap.getState() }); }
    return rows;
  }, [100, 250, 500]);
  console.log(JSON.stringify(results, null, 2));
  await browser.close(); if (results.some(row => row.state.visibleRestaurantIds.length !== row.size || row.renderMs > 1000)) process.exitCode = 1;
})();
