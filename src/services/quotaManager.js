(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JiaQuotaManager = api;
})(typeof window !== 'undefined' ? window : null, function(root) {
  'use strict';

  const LIMITS = {
    foursquare: { safeLimit: 450, period: 'month', warning: 360, high: 405 },
    here: { safeLimit: 900, period: 'day', warning: 720, high: 810 },
    geoapify: { safeLimit: 2700, period: 'day', warning: 2160, high: 2430 },
    nominatim: { safeLimit: 1, period: 'second', warning: 1, high: 1 },
    overpass: { safeLimit: 1, period: 'second', warning: 1, high: 1 },
    taiwan_open_data: { safeLimit: 5000, period: 'day', warning: 4000, high: 4500 },
    hotpepper: { safeLimit: 0, period: 'day', warning: 0, high: 0 },
    kakao_local: { safeLimit: 95000, period: 'day', warning: 80000, high: 90000, officialLimit: 100000 },
    naver_local: { safeLimit: 23750, period: 'day', warning: 20000, high: 22500, officialLimit: 25000 },
    naver_blog: { safeLimit: 23750, period: 'day', warning: 20000, high: 22500, officialLimit: 25000 }
  };

  let storage = null;

  function taipeiParts() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());
    return Object.fromEntries(parts.map(x => [x.type, x.value]));
  }

  function periodKey(provider) {
    const cfg = LIMITS[provider], p = taipeiParts();
    if (cfg?.period === 'month') return `${p.year}-${p.month}`;
    if (cfg?.period === 'second') return new Date().toISOString().slice(0, 19);
    return `${p.year}-${p.month}-${p.day}`;
  }

  function documentId(provider) {
    return `${provider}_${periodKey(provider)}`;
  }

  function configure(next) {
    storage = next || null;
    return api;
  }

  async function read(provider) {
    if (!storage?.get) return { used: 0 };
    return await storage.get(documentId(provider), provider) || { used: 0 };
  }

  async function status(provider) {
    const cfg = LIMITS[provider];
    if (!cfg) return { provider, allowed: false, state: 'unknown_provider', used: 0 };
    const row = await read(provider), used = Number(row.used ?? row.count ?? 0);
    return {
      provider,
      used,
      ...cfg,
      state: used >= cfg.safeLimit ? 'stop' : used >= cfg.high ? 'high' : used >= cfg.warning ? 'warning' : 'ok',
      allowed: used < cfg.safeLimit,
      periodKey: periodKey(provider)
    };
  }

  async function canConsume(provider) {
    return (await status(provider)).allowed;
  }

  async function consume(provider) {
    const before = await status(provider);
    if (!before.allowed) return { ...before, consumed: false };
    if (!storage?.set) return { ...before, consumed: true, used: before.used + 1, state: 'ok' };
    const used = before.used + 1;
    await storage.set(documentId(provider), {
      provider,
      used,
      count: used,
      period: before.period,
      periodKey: before.periodKey,
      safeLimit: before.safeLimit,
      updatedAt: new Date().toISOString()
    });
    return { ...await status(provider), consumed: true };
  }

  const api = {
    LIMITS,
    SAFE_LIMITS: LIMITS,
    configure,
    periodKey,
    documentId,
    status,
    canConsume,
    consume,
    recordUsage: consume,
    getCount: async p => (await status(p)).used
  };
  return api;
});
