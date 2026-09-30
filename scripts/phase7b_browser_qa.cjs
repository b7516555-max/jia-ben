const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const root = path.resolve(__dirname, '..');
const evidence = path.join(root, 'reports', 'evidence', 'phase7b');
fs.mkdirSync(evidence, { recursive: true });
const fixture = Array.from({ length: 14 }, (_, i) => ({
  jiaPlaceId: `qa-${i + 1}`, name: `QA 餐廳 ${i + 1}`, address: `屏東市測試路 ${i + 1} 號`, city: '屏東市',
  category: i % 2 ? '燒肉' : '麵店', categories: [i % 2 ? '燒肉' : '麵店'],
  location: { lat: 22.6761 + (i % 7) * .0012, lng: 120.4942 + Math.floor(i / 7) * .0015 },
  openingHours: '今日 11:00–21:00', communityStats: { ratingAverage: 4.5, ratingCount: 12, averageSpend: 250 }, coverPhoto: './assets/place-placeholder.svg'
}));
const viewports = process.env.PHASE7B_VIEWPORTS ? process.env.PHASE7B_VIEWPORTS.split(',').map(item => item.split('x').map(Number)) : [[320, 700], [360, 800], [375, 812], [390, 844], [414, 896], [768, 1024], [820, 1180], [1366, 768], [1440, 900], [1920, 1080]];
async function screenshot(page, name) { try { await page.screenshot({ path: path.join(evidence, `${name}.png`), animations: 'disabled', timeout: 10000 }); } catch (_) {} }

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' });
  const rows = [];
  for (const [width, height] of viewports) {
    const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', geolocation: { latitude: 22.6800, longitude: 120.5000 }, permissions: ['geolocation'] });
    const page = await context.newPage(); page.setDefaultTimeout(8000);
    const errors = [], googleRequests = [], osmRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource.*404/i.test(message.text())) errors.push(message.text()); });
    page.on('request', request => { if (/maps\.googleapis|places\.googleapis|maps\.google\.com/i.test(request.url())) googleRequests.push(request.url()); if (/tile\.openstreetmap\.org/i.test(request.url())) osmRequests.push(request.url()); });
    await page.goto(`http://127.0.0.1:4175/index.html?phase7b=${width}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(() => document.querySelectorAll('link[href*="fonts.googleapis.com"], link[href*="cdnjs.cloudflare.com"]').forEach(node => node.remove()));
    await page.waitForTimeout(900);
    const enter = page.getByRole('button', { name: /直接進入網頁版/ }); if (await enter.isVisible().catch(() => false)) await enter.click();
    await page.evaluate(data => { window.jiaPlacesData = data; window.restaurantData = data; window.JiaInteractiveMap?.setPlaces(data); window.switchTab?.('map', true); }, fixture);
    await page.waitForSelector('#jia-map-canvas .leaflet-container', { state: 'attached', timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const mapVisible = await page.locator('#jia-map-canvas').evaluate(node => { const r = node.getBoundingClientRect(); const style = getComputedStyle(node); return style.display !== 'none' && style.visibility !== 'hidden' && r.width > 0 && r.height > 0; }).catch(() => false);
    const attribution = await page.locator('.leaflet-control-attribution').isVisible().catch(() => false);
    const markers = page.locator('.jia-map-marker-wrap');
    const markerCount = await markers.count();
    if (width === 1440) await screenshot(page, 'desktop-map');
    const firstMarker = markers.first(); await firstMarker.click({ force: true }).catch(() => {});
    await page.evaluate(() => document.querySelector('.jia-map-marker-wrap')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))).catch(() => {});
    await page.waitForTimeout(100);
    const markerId = await page.evaluate(() => window.JiaInteractiveMap?.getState().selectedRestaurantId || null);
    const selectedCard = await page.locator('.jia-map-preview.is-selected').count();
    if (width === 1440) await screenshot(page, 'desktop-selected-marker');
    const firstCard = page.locator('[data-map-restaurant-id]').first(); await firstCard.click().catch(() => {});
    const cardId = await page.evaluate(() => window.JiaInteractiveMap?.getState().selectedRestaurantId || null);
    const detailBefore = await page.locator('#card-detail-modal').isVisible().catch(() => false);
    await page.evaluate(() => { window.__JIA_BEN_ENABLE_PERF = true; });
    await page.locator('[data-map-detail]').first().click().catch(() => {}); await page.waitForTimeout(50);
    const detailOpen = await page.locator('#card-detail-modal').isVisible().catch(() => false);
    const detailPerf = await page.evaluate(() => { const p = window.__jiaBenDetailPerf || {}; return Number.isFinite(p.t2) && Number.isFinite(p.t3) ? p.t3 - p.t2 : null; });
    await page.locator('#card-detail-modal button').first().click().catch(() => {});
    await page.evaluate(() => window.__JIA_MAP_INSTANCE?.setView([22.72, 120.54], 12)); await page.waitForTimeout(150);
    const searchButton = page.locator('#jia-map-search-area'); const searchAreaShown = await searchButton.isVisible().catch(() => false); await searchButton.click().catch(() => {});
    const searchCommitted = await page.evaluate(() => !window.JiaInteractiveMap?.getState().isSearchAreaAvailable);
    if (width === 1440) await screenshot(page, 'desktop-search-area');
    await page.locator('#jia-map-locate').click().catch(() => {}); await page.waitForTimeout(100);
    const locationState = await page.evaluate(() => Array.isArray(window.JiaInteractiveMap?.getState().userLocation));
    const sheetStates = [];
    for (const sheetState of ['collapsed', 'half', 'expanded']) { await page.evaluate(value => window.JiaInteractiveMap?.setSheetState(value), sheetState); sheetStates.push(await page.locator('#jia-map-sheet').getAttribute('data-state')); if (width === 320) await screenshot(page, `mobile-${sheetState}`); }
    if (width === 320) { await page.evaluate(() => window.JiaInteractiveMap?.selectRestaurant('qa-1', { pan: false })); await screenshot(page, 'mobile-selected-restaurant'); await page.evaluate(() => window.JiaInteractiveMap?.setSheetState('half')); await screenshot(page, 'mobile-search-area'); }
    if (width === 768) await screenshot(page, 'tablet-map');
    const noOverflow = await page.evaluate(() => document.body.scrollWidth <= innerWidth && document.body.scrollHeight <= document.documentElement.scrollHeight + 2);
    await screenshot(page, `map-${width}`);
    rows.push({ viewport: [width, height], mapVisible, attribution, markerCount, markerId, selectedCard, cardId, cardToMarker: markerId === cardId, detailBefore, detailOpen, detailPerf, searchAreaShown, searchCommitted, locationState, sheetStates, noOverflow, osmTiles: osmRequests.length > 0, googleRequests, errors });
    await context.close();
  }
  await browser.close(); console.log(JSON.stringify(rows, null, 2));
  if (rows.some(row => !row.mapVisible || !row.attribution || !row.markerCount || !row.markerId || !row.selectedCard || !row.cardId || !row.cardToMarker || !row.detailOpen || !row.searchAreaShown || !row.searchCommitted || !row.locationState || row.sheetStates.join(',') !== 'collapsed,half,expanded' || !row.noOverflow || row.googleRequests.length || row.errors.length)) process.exitCode = 1;
})();
