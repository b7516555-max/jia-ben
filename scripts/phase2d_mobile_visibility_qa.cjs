const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'reports', 'jia_ben_6_0j_phase2d_mobile_before');
const URL = 'https://b7516555-max.github.io/jia-ben/';
const viewports = [
  { name: '320', width: 320, height: 700 },
  { name: '360', width: 360, height: 800 },
  { name: '375', width: 375, height: 812 },
  { name: '390', width: 390, height: 844 },
  { name: '414', width: 414, height: 896 },
];

fs.mkdirSync(OUT, { recursive: true });

async function probe(page, selector, label) {
  return page.evaluate(({ selector, label }) => {
    const el = document.querySelector(selector);
    if (!el) return { label, selector, exists: false, visible: false, reason: 'missing' };
    const style = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    const centerX = Math.max(0, Math.min(innerWidth - 1, r.left + r.width / 2));
    const centerY = Math.max(0, Math.min(innerHeight - 1, r.top + Math.min(r.height / 2, innerHeight - 1)));
    const top = document.elementFromPoint(centerX, centerY);
    const covered = !!top && top !== el && !el.contains(top);
    const visible = style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && r.width > 0 && r.height > 0 && !covered && !!text;
    return { label, selector, exists: true, visible, text: text.slice(0, 1000), style: { display: style.display, visibility: style.visibility, opacity: style.opacity, overflow: style.overflow, position: style.position }, box: { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right }, covered };
  }, { selector, label });
}

async function waitForCards(page) {
  for (let i = 0; i < 45; i++) {
    if (await page.locator('.restaurant-card').count() > 0) return true;
    const entry = page.getByText('直接進入網頁版', { exact: false }).first();
    if (await entry.isVisible().catch(() => false)) await entry.click().catch(() => {});
    await page.waitForTimeout(1000);
  }
  return false;
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' });
  const results = [];
  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, serviceWorkers: 'block', deviceScaleFactor: 1 });
    const page = await context.newPage();
    const consoleErrors = [];
    const requests = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('request', r => { if (/maps\.googleapis|maps\.google\.com|places\.googleapis/i.test(r.url())) requests.push(r.url()); });
    await page.goto(`${URL}?phase2d=before-${vp.name}`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    const loaded = await waitForCards(page);
    const probes = [];
    probes.push(await probe(page, '.restaurant-card', 'restaurant card'));
    probes.push(await probe(page, '#list-container .contribution-context-cta, .contribution-context-cta', 'contribution CTA'));
    await page.screenshot({ path: path.join(OUT, `${vp.name}-home.png`), fullPage: false });
    const tabParty = page.locator('#tab-party');
    if (await tabParty.isVisible().catch(() => false)) {
      await tabParty.click().catch(() => {});
      await page.waitForTimeout(500);
      probes.push(await probe(page, '#party-container', 'party container'));
      await page.screenshot({ path: path.join(OUT, `${vp.name}-party.png`), fullPage: false });
    }
    results.push({ viewport: vp, loaded, probes, consoleErrors, googlePlacesRequests: requests, url: page.url(), title: await page.title() });
    await context.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'production-before.json'), JSON.stringify({ generatedAt: new Date().toISOString(), baseline: '6fd865d', results }, null, 2));
  console.log(JSON.stringify(results, null, 2));
})().catch(err => { console.error(err); process.exitCode = 1; });
