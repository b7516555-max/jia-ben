/**
 * Country Provider Router & Multilingual Normalizers (src/services/countryProviderRouter.js)
 * 
 * Directs search and discovery requests to country-specific provider fallback chains.
 * Implements country-specific name, address, and phone normalizers for TW, US, JP, and KR.
 */
(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JiaCountryRouter = api;
})(typeof window !== 'undefined' ? window : null, function(root) {
  'use strict';

  // Country definitions
  const SUPPORTED_COUNTRIES = {
    TW: { code: 'TW', nameZh: '台灣', flag: '🇹🇼', defaultCity: '台北市' },
    US: { code: 'US', nameZh: '美國', flag: '🇺🇸', defaultCity: 'New York' },
    JP: { code: 'JP', nameZh: '日本', flag: '🇯🇵', defaultCity: '東京都' },
    KR: { code: 'KR', nameZh: '韓國', flag: '🇰🇷', defaultCity: '서울특별시' }
  };

  /**
   * Detect or normalize country code
   */
  function normalizeCountryCode(countryInput) {
    if (!countryInput) return 'TW';
    const str = String(countryInput).trim().toUpperCase();
    if (str === 'TW' || str === 'TAIWAN' || str.includes('台灣') || str.includes('臺灣')) return 'TW';
    if (str === 'US' || str === 'USA' || str === 'UNITED STATES' || str.includes('美國')) return 'US';
    if (str === 'JP' || str === 'JAPAN' || str.includes('日本')) return 'JP';
    if (str === 'KR' || str === 'KOREA' || str.includes('韓國') || str.includes('南韓')) return 'KR';
    return 'TW';
  }

  /**
   * Multilingual Name Normalization (TW / US / JP / KR)
   */
  function normalizeNameByCountry(name, countryCode) {
    if (!name) return '';
    const norm = String(name)
      .normalize('NFKC')
      .trim()
      .toLowerCase()
      .replace(/[\s\-_・·,，.。()（）【】\[\]「」『』:：]+/g, '');
    return norm;
  }

  /**
   * Country-Specific Address Normalization
   */
  function normalizeAddressByCountry(address, countryCode) {
    if (!address) return '';
    const code = normalizeCountryCode(countryCode);
    let str = String(address).normalize('NFKC').trim();

    if (code === 'TW') {
      // Taiwan: clean postal codes, standardize 臺/台, remove repeated country
      str = str.replace(/^(中華民國|台灣|臺灣)/, '');
      str = str.replace(/^\d{3,6}\s*/, '');
      str = str.replace(/臺/g, '台');
      return str.trim();
    } else if (code === 'US') {
      // United States: preserve street, city, state, zip format
      str = str.replace(/^(USA|United States of America|United States),?\s*/i, '');
      return str.trim();
    } else if (code === 'JP') {
      // Japan: preserve prefecture, city, chome-ban-go
      str = str.replace(/^(日本|Japan),?\s*/i, '');
      str = str.replace(/^〒\d{3}-\d{4}\s*/, '');
      return str.trim();
    } else if (code === 'KR') {
      // South Korea: preserve road name address or jibun address
      str = str.replace(/^(대한민국|South Korea|Korea),?\s*/i, '');
      str = str.replace(/^\d{5}\s*/, '');
      return str.trim();
    }

    return str;
  }

  /**
   * Country-Specific Phone Normalization
   */
  function normalizePhoneByCountry(phone, countryCode) {
    if (!phone) return { valid: false, normalized: '' };
    const code = normalizeCountryCode(countryCode);
    const raw = String(phone).trim();
    const digitsOnly = raw.replace(/[^\d+]/g, '');

    if (code === 'TW') {
      // Taiwan phone format: 02-xxxx-xxxx, 09xx-xxx-xxx, etc.
      let clean = raw.replace(/[^\d]/g, '');
      if (clean.startsWith('886')) clean = '0' + clean.slice(3);
      if (/^09\d{8}$/.test(clean)) {
        return { valid: true, normalized: clean.slice(0, 4) + '-' + clean.slice(4, 7) + '-' + clean.slice(7) };
      }
      if (/^0[2-8]\d{7,8}$/.test(clean)) {
        const prefixLen = clean.startsWith('02') || clean.startsWith('04') ? 2 : (clean.startsWith('037') ? 3 : 2);
        return { valid: true, normalized: clean.slice(0, prefixLen) + '-' + clean.slice(prefixLen) };
      }
      return { valid: clean.length >= 7, normalized: raw };
    } else if (code === 'US') {
      // US phone format: +1 (xxx) xxx-xxxx
      let clean = digitsOnly.replace(/^\+?1/, '');
      if (clean.length === 10) {
        return { valid: true, normalized: `(${clean.slice(0, 3)}) ${clean.slice(3, 6)}-${clean.slice(6)}` };
      }
      return { valid: clean.length >= 10, normalized: raw };
    } else if (code === 'JP') {
      // Japan phone format: 03-xxxx-xxxx, 090-xxxx-xxxx
      let clean = digitsOnly.replace(/^\+?81/, '0');
      if (clean.length >= 10) {
        return { valid: true, normalized: raw };
      }
      return { valid: clean.length >= 9, normalized: raw };
    } else if (code === 'KR') {
      // South Korea phone format: 02-xxx-xxxx, 010-xxxx-xxxx
      let clean = digitsOnly.replace(/^\+?82/, '0');
      if (clean.length >= 9) {
        return { valid: true, normalized: raw };
      }
      return { valid: clean.length >= 8, normalized: raw };
    }

    return { valid: digitsOnly.length >= 7, normalized: raw };
  }

  /**
   * Get provider resolution pipeline for a country
   */
  function getCountryPipeline(countryCode) {
    const code = normalizeCountryCode(countryCode);
    const registry = root?.JiaProviderRegistry;

    const basePipeline = {
      TW: ['taiwan_open_data', 'osm', 'geoapify', 'foursquare'],
      US: ['osm', 'geoapify', 'foursquare', 'yelp'],
      JP: ['hotpepper', 'osm', 'geoapify', 'foursquare'],
      KR: ['kakao_local', 'naver_local', 'naver_blog', 'osm', 'geoapify', 'foursquare']
    };

    const targetList = basePipeline[code] || basePipeline.TW;
    return targetList.map(id => {
      const info = registry ? registry.getProvider(id) : { id, status: 'enabled' };
      return {
        id,
        status: info?.status || 'enabled',
        canExecute: info?.status === 'enabled' || info?.status === 'enabled_search_only'
      };
    });
  }

  return {
    SUPPORTED_COUNTRIES,
    normalizeCountryCode,
    normalizeNameByCountry,
    normalizeAddressByCountry,
    normalizePhoneByCountry,
    getCountryPipeline
  };
});
