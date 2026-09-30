const assert = require('assert');
const hours = require('../src/services/openingHoursService.js');

const taipei = (iso) => new Date(iso);
const place = { openingHours: { weekday_text: ['星期日：休息', '星期一：11:00–14:00、17:00–21:00', '星期二：11:00–21:00', '星期三：休息', '星期四：11:00–21:00', '星期五：11:00–22:00', '星期六：10:00–22:00'] } };
assert.deepStrictEqual(hours.parseTime('09:30'), 570);
assert.strictEqual(hours.getStatus(place, taipei('2026-09-28T04:00:00Z')).status, 'open'); // Taipei Mon 12:00
assert.strictEqual(hours.getStatus(place, taipei('2026-09-28T06:00:00Z')).status, 'closed'); // Taipei Mon 14:00 gap
assert.strictEqual(hours.getStatus(place, taipei('2026-09-27T04:00:00Z')).status, 'closed'); // Taipei Sun
assert.strictEqual(hours.getStatus({ openingHours: { periods: [{ open: { day: 1, time: '2200' }, close: { day: 2, time: '0200' } }] } }, taipei('2026-09-28T17:00:00Z')).isOpen, true); // Tue 01:00 Taipei
assert.strictEqual(hours.getStatus({ openingHours: '11:00–14:00;17:00–21:00' }, taipei('2026-09-28T04:30:00Z')).status, 'open');
assert.strictEqual(hours.getStatus({ openingHours: 'not-a-time' }, taipei('2026-09-28T04:30:00Z')).status, 'closed');
console.log('✅ opening hours deterministic service checks passed');
