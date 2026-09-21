const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const evidenceDir = path.join(root, 'reports', 'full-site-qa-evidence');
fs.mkdirSync(evidenceDir, { recursive: true });

const chromePath = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const viewports = [
  ['desktop-1920x1080', 1920, 1080],
  ['desktop-1440x900', 1440, 900],
  ['desktop-1366x768', 1366, 768],
  ['mobile-320x700', 320, 700],
  ['mobile-360x800', 360, 800],
  ['mobile-375x812', 375, 812],
  ['mobile-390x844', 390, 844],
  ['mobile-414x896', 414, 896]
];

function visible(locator) {
  return locator.isVisible().catch(() => false);
}

async function firstVisible(locators) {
  for (const locator of locators) if (await visible(locator)) return locator;
  return null;
}

async function clickIfVisible(locator) {
  if (locator && await visible(locator)) {
    await locator.click({ timeout: 3000 }).catch(() => {});
    return true;
  }
  return false;
}

async function dismissModal(page) {
  const close = page.locator('button').filter({ hasText: /取消|關閉|返回|×/ }).last();
  await clickIfVisible(close);
  await page.waitForTimeout(250);
}

const localFixture = [
  { jiaPlaceId: 'qa-hours', name: '海豐鱔魚意麵', address: '屏東縣屏東市海豐街1號', phone: '08-123-4567', categories: ['台灣小吃'], openingHours: '', coverPhoto: './assets/place-placeholder.svg', location: { lat: 22.68, lng: 120.49 } },
  { jiaPlaceId: 'qa-address', name: '時區', address: '', phone: '08-234-5678', categories: ['咖啡/甜點'], openingHours: '11:00~20:00', coverPhoto: './assets/place-placeholder.svg', location: { lat: 22.67, lng: 120.49 } },
  { jiaPlaceId: 'qa-phone', name: '丸京燒肉', address: '高雄市新興區中正三路100號', phone: '', categories: ['燒肉'], openingHours: '17:00~23:00', coverPhoto: './assets/place-placeholder.svg', location: { lat: 22.63, lng: 120.30 } },
  { jiaPlaceId: 'jia_4a0aa04dc144b9d537ca', name: '手酒咖啡', address: '屏東縣屏東市福建路124號', phone: '08-733-6580', categories: ['咖啡/甜點'], openingHours: '13:00~23:00', coverPhoto: './assets/place-placeholder.svg', location: { lat: 22.67, lng: 120.49 }, conflicts: ['openingHours'] },
  { jiaPlaceId: 'jia_2b7a7cf3a453a4336bdb', name: '金溫州餛飩大王', address: '高雄市鹽埕區新樂街163巷1號', phone: '07 551 1378', categories: ['台灣小吃'], openingHours: '14:00~21:00', coverPhoto: './assets/place-placeholder.svg', location: { lat: 22.63, lng: 120.28 }, conflicts: ['phone'] },
  { jiaPlaceId: 'jia_bdf8a92aeea10e5e6771', name: '義成伯の麵店', address: '屏東縣里港鄉大平村永樂路21之5號', phone: '08-775-1234', categories: ['台灣小吃'], openingHours: '11:00~20:00', coverPhoto: './assets/place-placeholder.svg', location: { lat: 22.78, lng: 120.49 }, communityStats: { averageSpend: 150, recommendedDishes: ['乾麵'] } }
];

async function ensureLocalFixture(page) {
  const count = await page.locator('.restaurant-card').count();
  if (count > 0) return { injected: false, count };
  await page.evaluate((fixture) => {
    window.jiaPlacesData = fixture;
    if (typeof window.renderHomeForYou === 'function') window.renderHomeForYou();
  }, localFixture);
  await page.waitForTimeout(900);
  return { injected: true, count: await page.locator('.restaurant-card').count() };
}

async function safeScreenshot(page, file) {
  await page.screenshot({ path: file, fullPage: false, timeout: 5000, animations: 'disabled' }).catch(() => {});
}

async function runViewport(browser, [label, width, height]) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
    geolocation: { latitude: 22.6273, longitude: 120.3014 },
    permissions: ['geolocation'],
    serviceWorkers: 'block'
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const consoleWarnings = [];
  const requestFailures = [];
  const badResponses = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
    if (msg.type() === 'warning') consoleWarnings.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(`PAGEERROR: ${err.message}`));
  page.on('requestfailed', req => requestFailures.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText || 'failed'}`));
  page.on('response', res => {
    if (res.status() >= 400 && !res.url().includes('/favicon.ico')) badResponses.push(`${res.status()} ${res.url()}`);
  });
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (/maps\.googleapis\.com|maps\.google\.com|places\.googleapis\.com/i.test(url)) return route.abort();
    return route.continue();
  });

  const result = { label, width, height, screenshots: [], cards: 0, ctas: 0, checks: {}, consoleErrors, consoleWarnings, requestFailures, badResponses };
  try {
    await page.goto('http://127.0.0.1:4175/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);
    const enter = page.getByRole('button', { name: /直接進入網頁版/ });
    await clickIfVisible(enter);
    await page.waitForTimeout(6500);

    const fixtureState = await ensureLocalFixture(page);
    result.fixtureInjected = fixtureState.injected;
    result.screenshots.push(`${label}-home.png`);
    await safeScreenshot(page, path.join(evidenceDir, `${label}-home.png`));

    result.cards = await page.locator('.restaurant-card').count();
    const ctaLocator = page.locator('button').filter({ hasText: /回報|補詳細|補上店家|已回報|資料完整/ });
    result.ctas = await ctaLocator.count();
    const metrics = await page.evaluate(() => ({
      bodyScrollWidth: document.body.scrollWidth,
      innerWidth: window.innerWidth,
      overflow: document.body.scrollWidth > window.innerWidth + 1,
      brokenImages: Array.from(document.querySelectorAll('.restaurant-card img')).filter(img => !img.complete || img.naturalWidth === 0).map(img => img.currentSrc || img.src).slice(0, 20),
      malformedText: /undefined|null|NaN|\[object Object\]|Invalid Date/.test(document.body.innerText),
      text: document.body.innerText.slice(0, 5000)
    }));
    result.metrics = metrics;
    result.checks.homeCards = result.cards > 0;
    result.checks.homeCTA = result.ctas > 0;
    result.checks.noHorizontalOverflow = !metrics.overflow;
    result.checks.noMalformedText = !metrics.malformedText;
    result.checks.imagesLoaded = metrics.brokenImages.length === 0;
    const firstCardForEvidence = page.locator('.restaurant-card').first();
    if (await visible(firstCardForEvidence)) {
      await firstCardForEvidence.scrollIntoViewIfNeeded().catch(() => {});
      result.screenshots.push(`${label}-card.png`);
      await safeScreenshot(page, path.join(evidenceDir, `${label}-card.png`));
    }

    const firstCta = await firstVisible([
      page.getByRole('button', { name: /回報營業時間|回報最新營業時間/ }).first(),
      page.getByRole('button', { name: /補詳細地址|補上店家電話|回報最新電話/ }).first(),
      ctaLocator.first()
    ]);
    result.checks.ctaModal = false;
    if (firstCta) {
      await firstCta.click();
      await page.waitForTimeout(400);
      result.checks.ctaModal = await visible(page.getByText('你想幫大家補充哪一項？', { exact: true }));
      result.checks.ctaDoesNotOpenDetail = !(await visible(page.locator('#card-detail-modal')));
      result.checks.modalNoHorizontalOverflow = await page.evaluate(() => document.body.scrollWidth <= window.innerWidth + 1);
      result.checks.modalSubmitVisible = await visible(page.getByRole('button', { name: /送出回報/ }).first());
      result.screenshots.push(`${label}-contribution-modal.png`);
      await safeScreenshot(page, path.join(evidenceDir, `${label}-contribution-modal.png`));
      const hoursPanel = await firstVisible([
        page.getByText('每週營業時段設定', { exact: true }),
        page.getByText('營業時間', { exact: true })
      ]);
      result.checks.hoursPanelVisible = !!hoursPanel;
      if (hoursPanel) {
        result.screenshots.push(`${label}-structured-hours.png`);
        await safeScreenshot(page, path.join(evidenceDir, `${label}-structured-hours.png`));
        const addShift = page.getByRole('button', { name: /二段/ }).first();
        result.checks.secondShiftControl = await visible(addShift);
        if (await visible(addShift)) {
          await addShift.click().catch(() => {});
          await page.waitForTimeout(200);
          result.checks.secondShiftAdded = await page.locator('input[type="time"]').count() >= 4;
        }
      }
      await dismissModal(page);
    }

    const firstCard = page.locator('.restaurant-card').first();
    const firstImage = firstCard.locator('img').first();
    result.checks.detailModal = false;
    if (await visible(firstImage)) {
      await firstImage.click().catch(() => {});
      await page.waitForTimeout(400);
      result.checks.detailModal = await visible(page.locator('#card-detail-modal')) || await visible(page.getByRole('heading').filter({ hasText: /金井|黑輪|時區|店/ }).first());
      result.checks.detailIdentityHasNoMalformedText = !(await page.locator('body').innerText()).match(/undefined|null|NaN|\[object Object\]/);
      result.screenshots.push(`${label}-detail.png`);
      await safeScreenshot(page, path.join(evidenceDir, `${label}-detail.png`));
      await dismissModal(page);
    }

    const searchInput = await firstVisible([
      page.locator('input[placeholder*="搜尋"]').first(),
      page.locator('input[type="search"]').first(),
      page.locator('#explore-keyword').first()
    ]);
    result.checks.searchInput = !!searchInput;
    if (searchInput) {
      await searchInput.fill('金井珈琲');
      const searchButton = page.getByRole('button', { name: /^搜尋$/ }).first();
      await clickIfVisible(searchButton);
      await page.waitForTimeout(800);
      result.checks.searchResultRendered = (await page.locator('.restaurant-card').count()) > 0 || (await page.locator('body').innerText()).includes('金井珈琲');
      result.screenshots.push(`${label}-search.png`);
      await safeScreenshot(page, path.join(evidenceDir, `${label}-search.png`));
    }
  } catch (err) {
    result.fatalError = String(err.stack || err);
  } finally {
    result.consoleErrors = consoleErrors;
    result.consoleWarnings = consoleWarnings;
    result.requestFailures = requestFailures;
    result.badResponses = badResponses;
    await context.close();
  }
  return result;
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chromePath, args: ['--disable-gpu', '--no-sandbox'] });
  const results = [];
  const selected = process.env.QA_VIEWPORT ? viewports.filter(v => v[0] === process.env.QA_VIEWPORT) : viewports;
  for (const viewport of selected) results.push(await runViewport(browser, viewport));
  await browser.close();
  fs.writeFileSync(path.join(evidenceDir, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
})().catch(err => { console.error(err.stack || err); process.exitCode = 1; });
