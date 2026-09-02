/**
 * Taiwan Address Normalizer (src/utils/taiwanAddressNormalizer.js)
 * 
 * Accurately standardizes and parses Taiwan postal addresses:
 * - 臺 / 台 normalization
 * - Administrative hierarchy splitting (縣市, 鄉鎮市區, 路街/段/巷/弄/號/樓)
 * - Removes country prefixes and postal codes
 * - Prevents duplicate concatenated prefixes (e.g. 臺南市, 臺南市 -> 台南市中西區)
 * - Distinguishes complete street addresses from city-only placeholders
 */
(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.JiaTaiwanAddressNormalizer = api;
    root.normalizeTaiwanAddress = api.normalizeTaiwanAddress;
  }
})(typeof window !== 'undefined' ? window : null, function(root) {
  'use strict';

  // Standard Taiwan Counties and Cities
  const TAIWAN_CITIES = [
    '台北市', '新北市', '桃園市', '台中市', '台南市', '高雄市',
    '基隆市', '新竹市', '嘉義市',
    '新竹縣', '苗栗縣', '彰化縣', '南投縣', '雲林縣', '嘉義縣',
    '屏東縣', '宜蘭縣', '花蓮縣', '台東縣', '澎湖縣', '金門縣', '連江縣'
  ];

  // Common district mappings for ambiguous or missing city context
  const COMMON_DISTRICTS = [
    '中正區', '大同區', '中山區', '松山區', '大安區', '萬華區', '信義區', '士林區', '北投區', '內湖區', '南港區', '文山區',
    '板橋區', '三重區', '中和區', '永和區', '新莊區', '新店區', '樹林區', '鶯歌區', '三峽區', '淡水區', '汐止區', '瑞芳區',
    '土城區', '蘆洲區', '五股區', '泰山區', '林口區', '深坑區', '石碇區', '坪林區', '三芝區', '石門區', '八里區', '平溪區',
    '雙溪區', '貢寮區', '金山區', '萬里區', '烏來區',
    '桃園區', '中壢區', '平鎮區', '八德區', '楊梅區', '蘆竹區', '大溪區', '龜山區', '大園區', '觀音區', '新屋區', '龍潭區', '復興區',
    '中區', '東區', '南區', '西區', '北區', '北屯區', '西屯區', '南屯區', '太平區', '大里區', '霧峰區', '烏日區', '豐原區',
    '后里區', '石岡區', '東勢區', '和平區', '新社區', '潭子區', '大雅區', '神岡區', '大肚區', '沙鹿區', '龍井區', '梧棲區',
    '清水區', '大甲區', '外埔區', '大安區',
    '安平區', '安南區', '中西區', '南區', '北區', '東區', '新營區', '鹽水區', '白河區', '柳營區', '後壁區', '東山區',
    '麻豆區', '下營區', '六甲區', '官田區', '大內區', '佳里區', '學甲區', '西港區', '七股區', '將軍區', '北門區', '新化區',
    '善化區', '新市區', '安定區', '山上區', '玉井區', '楠西區', '南化區', '左鎮區', '仁德區', '歸仁區', '關廟區', '龍崎區', '永康區',
    '新興區', '前金區', '苓雅區', '鹽埕區', '鼓山區', '旗津區', '前鎮區', '三民區', '楠梓區', '小港區', '左營區', '仁武區',
    '大社區', '岡山區', '路竹區', '阿蓮區', '田寮區', '燕巢區', '橋頭區', '梓官區', '彌陀區', '永安區', '湖內區', '鳳山區',
    '大寮區', '林園區', '鳥松區', '大樹區', '旗山區', '美濃區', '六龜區', '內門區', '杉林區', '甲仙區', '桃源區', '那瑪夏區',
    '茂林區', '茄萣區'
  ];

  function standardizeChars(input) {
    if (!input) return '';
    return String(input)
      .normalize('NFKC')
      .trim()
      .replace(/臺/g, '台')
      .replace(/[\u200B-\u200D\uFEFF]/g, '');
  }

  function normalizeTaiwanAddress(rawAddress, fallbackCity = '') {
    if (!rawAddress || typeof rawAddress !== 'string') {
      return {
        formattedAddress: '',
        city: fallbackCity ? standardizeChars(fallbackCity) : '',
        district: '',
        street: '',
        isComplete: false,
        placeholderOnly: true
      };
    }

    let clean = standardizeChars(rawAddress);

    // 1. Remove country prefixes
    clean = clean.replace(/^(中華民國|台灣省?|臺灣省?|Taiwan),?\s*/i, '');

    // 2. Remove postal codes (3 to 6 digits) at beginning
    clean = clean.replace(/^\d{3,6}\s*,?\s*/, '');

    // 3. Handle city-only placeholders
    const placeholderMatch = clean.match(/^(?:📍\s*)?([^\s()（）]+)(?:[\(（]尚無完整門牌地址[\)）])?$/);
    if (placeholderMatch && TAIWAN_CITIES.includes(placeholderMatch[1])) {
      const cityOnly = placeholderMatch[1];
      return {
        formattedAddress: `📍 ${cityOnly}（尚無完整門牌地址）`,
        city: cityOnly,
        district: '',
        street: '',
        isComplete: false,
        placeholderOnly: true
      };
    }

    // 4. Resolve duplicated city segments (e.g. 台南市, 台南市, 南門路60號 -> 台南市南門路60號)
    for (const city of TAIWAN_CITIES) {
      const doubleCityRegex = new RegExp(`^${city}[,\\s\\-_]+${city}[,\\s\\-_]*`, 'i');
      if (doubleCityRegex.test(clean)) {
        clean = clean.replace(doubleCityRegex, city);
      }
    }

    // 5. Extract City (from beginning or comma-separated components)
    let city = '';
    for (const c of TAIWAN_CITIES) {
      if (clean.startsWith(c)) {
        city = c;
        clean = clean.slice(c.length).trim();
        break;
      }
    }

    if (!city) {
      for (const c of TAIWAN_CITIES) {
        if (clean.includes(c)) {
          city = c;
          // Remove city mention from trailing segments
          clean = clean.replace(new RegExp(`[,，\\s\\-_]*${c}[,，\\s\\-_]*`), ' ').trim();
          break;
        }
      }
    }

    // Clean English words (e.g. Hualien, Taipei, Taiwan) and trailing isolated postal codes (e.g. 970 at end or before comma)
    clean = clean.replace(/[a-zA-Z]+/g, ' ')
      .replace(/(?:\s|^)\d{3,6}(?=\s*[,，\-_]|\s*$)/g, '')
      .replace(/[,，\s\-_]+/g, ' ')
      .trim();

    // Fallback city if address starts with district or street directly
    if (!city && fallbackCity) {
      const normFallback = standardizeChars(fallbackCity);
      if (TAIWAN_CITIES.includes(normFallback)) {
        city = normFallback;
      }
    }

    // Remove comma/space separators
    clean = clean.replace(/^[,，\s\-_]+/, '');

    // 6. Extract District (鄉鎮市區)
    let district = '';
    const districtMatch = clean.match(/^([^\s,，\d]+?[市區鄉鎮])/);
    if (districtMatch) {
      district = districtMatch[1];
      clean = clean.slice(district.length).trim();
    } else if (clean.length > 0) {
      // Look for common district names
      for (const d of COMMON_DISTRICTS) {
        if (clean.startsWith(d)) {
          district = d;
          clean = clean.slice(d.length).trim();
          break;
        }
      }
    }

    clean = clean.replace(/^[,，\s\-_]+/, '');

    // 7. Street & Number (路街段巷弄號樓)
    const street = clean.trim();
    const isComplete = Boolean(city && (district || street.includes('路') || street.includes('街') || street.includes('段')) && /\d+號?/.test(street));

    let formattedAddress = '';
    if (city && district && street) {
      formattedAddress = `${city}${district}${street}`;
    } else if (city && street) {
      formattedAddress = `${city}${street}`;
    } else if (street) {
      formattedAddress = street;
    } else if (city) {
      formattedAddress = `📍 ${city}（尚無完整門牌地址）`;
    }

    return {
      formattedAddress,
      city: city || '',
      district: district || '',
      street: street || '',
      isComplete,
      placeholderOnly: !isComplete && Boolean(city && !street)
    };
  }

  return {
    TAIWAN_CITIES,
    COMMON_DISTRICTS,
    standardizeChars,
    normalizeTaiwanAddress
  };
});
