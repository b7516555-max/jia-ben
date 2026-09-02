/**
 * Taiwan Phone Normalizer (src/utils/taiwanPhoneNormalizer.js)
 * 
 * Standardizes Taiwan phone numbers:
 * - Mobile: 09xx-xxx-xxx
 * - Landlines: 02 (Taipei/Keelung/New Taipei), 03 (Taoyuan/Hsinchu/Yilan/Hualien), 037 (Miaoli),
 *   04 (Taichung/Changhua), 049 (Nantou), 05 (Yunlin/Chiayi), 06 (Tainan/Penghu),
 *   07 (Kaohsiung), 08 (Pingtung), 089 (Taitung), 082 (Kinmen), 0836 (Matsu)
 * - Returns comparable canonical digits + formatted user-friendly display
 */
(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.JiaTaiwanPhoneNormalizer = api;
    root.normalizeTaiwanPhone = api.normalizeTaiwanPhone;
  }
})(typeof window !== 'undefined' ? window : null, function(root) {
  'use strict';

  // Area Code definitions
  const AREA_CODES = [
    { code: '0836', len: 4 },
    { code: '037', len: 3 },
    { code: '049', len: 3 },
    { code: '089', len: 3 },
    { code: '082', len: 3 },
    { code: '02', len: 2 },
    { code: '03', len: 2 },
    { code: '04', len: 2 },
    { code: '05', len: 2 },
    { code: '06', len: 2 },
    { code: '07', len: 2 },
    { code: '08', len: 2 }
  ];

  function normalizeTaiwanPhone(rawPhone) {
    if (!rawPhone) return { valid: false, canonical: '', formatted: '' };

    let digits = String(rawPhone)
      .normalize('NFKC')
      .replace(/[^\d+]/g, '');

    // Convert international prefix +886 or 886 to standard 0
    if (digits.startsWith('+886')) {
      digits = '0' + digits.slice(4);
    } else if (digits.startsWith('886')) {
      digits = '0' + digits.slice(3);
    }

    // Clean remaining non-digits
    digits = digits.replace(/[^\d]/g, '');

    // 1. Mobile Phone (09xx-xxx-xxx, 10 digits)
    if (/^09\d{8}$/.test(digits)) {
      const formatted = `${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
      return {
        valid: true,
        isMobile: true,
        canonical: digits,
        formatted
      };
    }

    // 2. Landline Phone
    for (const area of AREA_CODES) {
      if (digits.startsWith(area.code)) {
        const rest = digits.slice(area.len);
        // Landlines usually have 7 or 8 digits after area code
        if (rest.length >= 6 && rest.length <= 8) {
          let formattedRest = rest;
          if (rest.length === 8) {
            formattedRest = `${rest.slice(0, 4)}-${rest.slice(4)}`;
          } else if (rest.length === 7) {
            formattedRest = `${rest.slice(0, 3)}-${rest.slice(3)}`;
          }
          return {
            valid: true,
            isMobile: false,
            areaCode: area.code,
            canonical: digits,
            formatted: `(${area.code}) ${formattedRest}`
          };
        }
      }
    }

    // Fallback: if at least 7 digits, accept as custom number
    if (digits.length >= 7) {
      return {
        valid: true,
        isMobile: false,
        canonical: digits,
        formatted: rawPhone.trim()
      };
    }

    return {
      valid: false,
      isMobile: false,
      canonical: digits,
      formatted: rawPhone.trim()
    };
  }

  return {
    AREA_CODES,
    normalizeTaiwanPhone
  };
});
