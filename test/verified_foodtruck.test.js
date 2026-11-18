const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Card = require('../src/components/restaurantCard.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const appVersion = fs.readFileSync(path.join(__dirname, '..', 'src', 'config', 'appVersion.js'), 'utf8');
const robots = fs.readFileSync(path.join(__dirname, '..', 'robots.txt'), 'utf8');
const sitemap = fs.readFileSync(path.join(__dirname, '..', 'sitemap.xml'), 'utf8');

const card = Card.render({
  jiaPlaceId: 'truck-1',
  name: '測試餐車',
  category: '行動餐車',
  isFoodTruck: true,
  isVerified: true,
  truckStatus: '出攤中',
  truckTodayLocation: '中央公園入口',
  truckTodayStart: '11:00',
  truckTodayEnd: '18:00'
});

assert.ok(card.includes('店家認證'), 'Verified restaurant card shows the free verification badge');
assert.ok(card.includes('出攤中'), 'Food truck card shows today status');
assert.ok(card.includes('中央公園入口'), 'Food truck card shows today location');
assert.ok(html.includes('restaurantClaims'), 'Restaurant claim collection is wired');
assert.ok(html.includes('window.filterFoodTrucks()'), 'Homepage has a food truck quick filter');
assert.ok(html.includes('id="input-is-food-truck"'), 'New restaurant form can mark food trucks');
assert.ok(html.includes('id="claim-is-food-truck"'), 'Claim form can mark food trucks');
assert.ok(html.includes('id="intro-version"'), 'Welcome screen shows the app version');
assert.ok(html.includes('application/ld+json'), 'SEO JSON-LD is present');
assert.ok(html.includes('rel="canonical"'), 'Canonical URL is present');
assert.ok(html.includes('id="producer-modal"'), 'Producer information modal is present');
assert.ok(html.includes('window.openProducerModal()'), 'Producer modal has accessible entry points');
assert.ok(html.includes('id="view-creator"'), 'Producer information has a standalone page');
assert.ok(!html.includes('b7516555.netlify.app'), 'Producer external website is fully removed');
assert.ok(html.includes('min-h-[100dvh]'), 'Welcome screen uses dynamic viewport height');
assert.ok(html.includes('window.filterFoodTrucks()'), 'Food truck entry remains available');
assert.ok(html.includes('核准認證'), 'Admin claim approval action is present');
assert.ok(html.includes('isVerified: true'), 'Approval writes verified status');
assert.ok(html.includes('detail-owner-announcement'), 'Detail view supports owner announcements');
assert.ok(html.includes('detail-truck-nav'), 'Detail view supports truck navigation');
assert.ok(html.includes('navigator.geolocation'), 'Truck update supports current GPS location');
assert.strictEqual((sw.match(/together-eat-shell-v122/g) || []).length, 1, 'Service Worker cache is v122');
assert.ok(appVersion.includes("JIA_BEN_VERSION = 'v122'"), 'App version config is v122');
assert.ok(robots.includes('Sitemap: https://b7516555-max.github.io/jia-ben/sitemap.xml'), 'robots.txt points to sitemap');
assert.ok(sitemap.includes('<loc>https://b7516555-max.github.io/jia-ben/</loc>'), 'sitemap contains the site URL');

console.log('✅ Verified badge, claim review, and food truck contracts passed');
