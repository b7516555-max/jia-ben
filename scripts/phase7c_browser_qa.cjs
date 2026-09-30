const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const root = path.resolve(__dirname, '..');
const evidence = path.join(root, 'reports', 'evidence', 'phase7c');
fs.mkdirSync(evidence, { recursive: true });
const viewports = process.env.PHASE7C_VIEWPORTS ? process.env.PHASE7C_VIEWPORTS.split(',').map(item => item.split('x').map(Number)) : [[320,700],[360,800],[375,812],[390,844],[414,896],[768,1024],[820,1180],[1366,768],[1440,900],[1920,1080]];
const fixture = [{ jiaPlaceId:'qa-1', name:'7.0C 測試餐廳', address:'屏東市測試路 1 號', city:'屏東市', categories:['麵店'], location:{lat:22.6761,lng:120.4942}, openingHours:{weekday_text:['星期日：休息','星期一：11:00–14:00、17:00–21:00','星期二：11:00–21:00','星期三：休息','星期四：11:00–21:00','星期五：11:00–22:00','星期六：10:00–22:00']}, communityStats:{ratingAverage:4.6,ratingCount:8,averageSpend:240,spendCount:5,recommendedDishes:[{name:'牛肉麵',votes:4}]}, communityReviews:[{userName:'QA 吃貨',rating:5,text:'測試心得',status:'approved'}], communityPhotos:[], coverPhoto:'./assets/place-placeholder.svg' }];
(async () => {
  const browser = await chromium.launch({ headless:true, executablePath:'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' });
  const rows = [];
  for (const [width,height] of viewports) {
    const context = await browser.newContext({ viewport:{width,height}, serviceWorkers:'block' });
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    const errors = [], google = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource.*404/i.test(m.text())) errors.push(m.text()); });
    page.on('request', r => { if (/maps\.googleapis\.com|places\.googleapis\.com|maps\.google\.com/i.test(r.url())) google.push(r.url()); });
    await page.goto(`http://127.0.0.1:4175/index.html?phase7c=${width}`, {waitUntil:'domcontentloaded', timeout:30000});
    await page.evaluate(() => document.querySelectorAll('link[href*="fonts.googleapis.com"],link[href*="cdnjs.cloudflare.com"]').forEach(n => n.remove()));
    await page.waitForTimeout(500);
    await page.getByRole('button', {name:/直接進入網頁版/}).click().catch(()=>{});
    await page.evaluate(data => { window.jiaPlacesData=data; window.restaurantData=data; window.JiaInteractiveMap?.setPlaces(data); window.switchTab?.('map', true); }, fixture);
    await page.waitForTimeout(800);
    const mapCard = page.locator('[data-map-restaurant-id="qa-1"]');
    await mapCard.click().catch(()=>{});
    const before = await page.evaluate(() => window.JiaInteractiveMap?.getState());
    await page.locator('[data-map-detail="qa-1"]').click().catch(()=>{});
    await page.waitForTimeout(100);
    const detail = await page.locator('#card-detail-modal').isVisible().catch(()=>false);
    const sections = await page.evaluate(() => ['detail-opening-section','detail-community-section','detail-photo-section','detail-reviews-section','detail-gatherings-section'].every(id => { const n=document.getElementById(id); return n && !n.classList.contains('hidden'); }));
    const id = await page.evaluate(() => window.currentDetailPlace?.jiaPlaceId || null);
    if ([320,375,390,414,1440].includes(width)) await page.screenshot({path:path.join(evidence,`detail-${width}.png`), animations:'disabled'});
    await page.locator('#card-detail-modal button').first().click().catch(()=>{}); await page.waitForTimeout(100);
    const returned = await page.evaluate(() => ({ mapVisible: !document.getElementById('jia-map-view')?.classList.contains('hidden'), selected: window.JiaInteractiveMap?.getState().selectedRestaurantId }));
    if (width === 1440) await page.screenshot({path:path.join(evidence,'map-return-1440.png'), animations:'disabled'});
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
    rows.push({viewport:[width,height], detail, sections, canonicalId:id, mapSelectedBefore:before?.selectedRestaurantId, mapReturned:returned.mapVisible, selectedAfter:returned.selected, overflow, googleRequests:google, errors});
    await context.close();
  }
  await browser.close(); console.log(JSON.stringify(rows,null,2));
  if (rows.some(r => !r.detail || !r.sections || r.canonicalId !== 'qa-1' || !r.mapReturned || r.selectedAfter !== 'qa-1' || !r.overflow || r.googleRequests.length || r.errors.length)) process.exitCode=1;
})();
