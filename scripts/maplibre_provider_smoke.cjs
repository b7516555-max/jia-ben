const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4175/index.html?maplibre-smoke=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
  const result = await page.evaluate(async () => {
    const element = document.createElement('div'); element.id = 'maplibre-smoke'; element.style.cssText = 'width:800px;height:500px;position:absolute;left:-9999px;top:0'; document.body.appendChild(element);
    try {
      const provider = window.JiaMapLibreProvider.create();
      const map = await provider.initialize({ containerId: 'maplibre-smoke', places: [{ jiaPlaceId: 'smoke-1', name: 'Smoke', location: { lat: 22.62, lng: 120.31 } }] });
      await new Promise(resolve => map.once('idle', resolve));
      return { canvas: Boolean(element.querySelector('canvas')), style: provider.styleUrl, source: Boolean(map.getSource('jia-restaurants')), clusters: Boolean(map.getLayer('jia-restaurants-clusters')) };
    } catch (error) { return { error: String(error?.message || error) }; }
  });
  console.log(JSON.stringify({ result, errors }, null, 2)); await browser.close();
  if (result.error || !result.canvas || !result.source || !result.clusters || errors.length) process.exitCode = 1;
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
