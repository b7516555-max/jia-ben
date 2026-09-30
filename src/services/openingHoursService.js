(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JiaOpeningHours = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const DAY_NAMES = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const TZ = 'Asia/Taipei';
  const pad = n => String(n).padStart(2, '0');
  const clean = value => value == null ? '' : String(value).trim();

  function parseTime(value) {
    const match = clean(value).match(/^(\d{1,2})(?::?(\d{2}))?$/);
    if (!match) return null;
    const hour = Number(match[1]), minute = Number(match[2] || 0);
    return hour <= 23 && minute <= 59 ? hour * 60 + minute : null;
  }
  function formatTime(minutes) { return minutes == null ? '' : `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`; }
  function normalizeRanges(value) {
    if (Array.isArray(value)) return value.map(normalizeRanges).flat().filter(Boolean);
    if (value && typeof value === 'object') {
      const open = parseTime(value.open || value.start || value.from);
      const close = parseTime(value.close || value.end || value.to);
      return open == null ? [] : [{ open, close }];
    }
    return clean(value).split(/[;,；、|]+/).map(item => {
      const pair = item.trim().split(/\s*[–—-]\s*/);
      const open = parseTime(pair[0]), close = parseTime(pair[1]);
      return open == null ? null : { open, close };
    }).filter(Boolean);
  }
  function extract(place) {
    const source = place?.openingHours || place?.opening_hours || place?.hours || place || {};
    const rows = Array.from({ length: 7 }, (_, day) => ({ day, label: DAY_NAMES[day], closed: false, ranges: [] }));
    const weekdayText = Array.isArray(source.weekday_text) ? source.weekday_text : (Array.isArray(place?.weekdayText) ? place.weekdayText : []);
    if (weekdayText.length) weekdayText.forEach((line, index) => {
      const text = clean(line), body = text.replace(/^[^:：]+[:：]\s*/, '');
      rows[index] = { ...rows[index], closed: /休息|關閉|closed/i.test(body), ranges: normalizeRanges(body) };
    });
    if (Array.isArray(source.periods)) source.periods.forEach(period => {
      const day = Number(period?.open?.day);
      const open = parseTime(period?.open?.time), close = parseTime(period?.close?.time);
      if (day >= 0 && day <= 6 && open != null) rows[day].ranges.push({ open, close });
    });
    if (!weekdayText.length && !source.periods && typeof source === 'string') rows.forEach(row => { row.ranges = normalizeRanges(source); row.closed = !row.ranges.length; });
    rows.forEach(row => { row.ranges = row.ranges.filter((range, index, all) => all.findIndex(x => x.open === range.open && x.close === range.close) === index); if (!row.ranges.length && !row.closed) row.closed = true; });
    return rows;
  }
  function taipeiParts(now) {
    const date = now instanceof Date ? now : new Date(now || Date.now());
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
    const weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.find(p => p.type === 'weekday')?.value);
    return { day: weekday < 0 ? date.getDay() : weekday, minutes: Number(parts.find(p => p.type === 'hour')?.value || 0) * 60 + Number(parts.find(p => p.type === 'minute')?.value || 0) };
  }
  function getStatus(place, now) {
    if (place?.business_status === 'CLOSED_PERMANENTLY') return { status: 'closed_perm', label: '已永久停業', isOpen: false };
    if (place?.business_status === 'CLOSED_TEMPORARILY') return { status: 'closed_temp', label: '暫時停業', isOpen: false };
    const rows = extract(place), current = taipeiParts(now), row = rows[current.day];
    const overnight = rows[(current.day + 6) % 7].ranges.filter(x => x.close != null && x.close <= x.open);
    const activeOvernight = overnight.find(x => current.minutes < x.close);
    const active = row.ranges.find(x => x.close == null ? current.minutes >= x.open : (x.close > x.open ? current.minutes >= x.open && current.minutes < x.close : current.minutes >= x.open));
    if (active || activeOvernight) {
      const range = active || activeOvernight, close = activeOvernight ? range.close : (range.close <= range.open ? range.close + 1440 : range.close);
      const remaining = close == null ? null : close - current.minutes;
      return { status: remaining != null && remaining > 0 && remaining <= 60 ? 'closing_soon' : 'open', label: remaining != null && remaining > 0 && remaining <= 60 ? '即將打烊' : '營業中', isOpen: true, closesAt: close == null ? null : formatTime(close % 1440), today: row };
    }
    const next = [...Array(8)].map((_, offset) => rows[(current.day + offset) % 7]).flatMap(item => item.ranges.map(range => ({ item, range }))).find(({ item, range }) => item.day !== current.day || range.open > current.minutes);
    return { status: 'closed', label: '休息中', isOpen: false, nextOpening: next ? `${next.item.label} ${formatTime(next.range.open)}` : '', today: row };
  }
  function formatRows(place) { return extract(place).map(row => `${row.label}：${row.closed ? '休息' : (row.ranges.map(range => `${formatTime(range.open)}${range.close == null ? '' : `–${formatTime(range.close)}`}`).join('、') || '休息')}`); }
  return { DAY_NAMES, TIME_ZONE: TZ, parseTime, formatTime, extract, getStatus, formatRows };
});
