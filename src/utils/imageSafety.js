(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.imageSafety=api;})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const patterns=[
    /(^|\/)maps\.googleapis\.com\//i,
    /places\.googleapis\.com/i,
    /\/maps\/api\/place\/photo/i,
    /[?&]photo_reference=/i,
    /googleapis\.com\/maps\/api\/(?:place|streetview|staticmap)/i
  ];
  function isBlockedLegacyGoogleImage(url){return typeof url==='string'&&patterns.some(pattern=>pattern.test(url));}
  function isKnownPlaceholder(value){
    const url=String(value||'');
    return /place-placeholder\.svg|\/assets\/(?:places\/ai-|food\/)/i.test(url);
  }
  function imageUrlFromValue(value){
    if(typeof value==='string') return value.trim();
    if(!value||typeof value!=='object'||value.isAiFallback||value.isPlaceholder||value.isReferenceFallback) return '';
    if(typeof value.getUrl==='function'){try{return String(value.getUrl({maxWidth:1200})||'').trim();}catch(_){return '';}}
    return String(value.url||value.imageUrl||value.photoUrl||value.src||value.downloadURL||value.fileUrl||value.href||'').trim();
  }
  function filterSafeImages(values){return [...new Set((values||[]).map(imageUrlFromValue).filter(value=>value&&!isKnownPlaceholder(value)&&!isBlockedLegacyGoogleImage(value)))];}
  const REFERENCE_FOOD_ASSETS = {
    '滷肉飯': './assets/food/lu_rou_fan.jpg',
    '小吃': './assets/food/lu_rou_fan.jpg',
    '台灣小吃': './assets/food/lu_rou_fan.jpg',
    '台式料理': './assets/food/lu_rou_fan.jpg',
    '飯食': './assets/food/lu_rou_fan.jpg',
    '拉麵': './assets/food/ramen.jpg',
    '麵食': './assets/food/ramen.jpg',
    '日式拉麵': './assets/food/ramen.jpg',
    '日式料理': './assets/food/ramen.jpg',
    '燒肉': './assets/food/yakiniku.jpg',
    '日式燒肉': './assets/food/yakiniku.jpg',
    '火鍋': './assets/food/hotpot.jpg',
    '麻辣鍋': './assets/food/hotpot.jpg',
    '鍋物': './assets/food/hotpot.jpg',
    '咖啡': './assets/food/cafe.jpg',
    '甜點': './assets/food/cafe.jpg',
    '下午茶': './assets/food/cafe.jpg',
    '甜點/飲料': './assets/food/cafe.jpg'
  };

  const DEFAULT_REFERENCE_FOOD_LIST = [
    './assets/food/lu_rou_fan.jpg',
    './assets/food/ramen.jpg',
    './assets/food/yakiniku.jpg',
    './assets/food/hotpot.jpg',
    './assets/food/cafe.jpg'
  ];

  // 本地靜態 AI 餐點示意圖：只在沒有真實／認證照片時使用，避免首頁啟動時大量外連搜圖。
  const STATIC_AI_FOOD_ASSETS = {
    noodles: './assets/places/ai-noodles.png',
    yakiniku: './assets/places/ai-yakiniku.png',
    sushi: './assets/places/ai-sushi.png',
    hotpot: './assets/places/ai-hotpot.png',
    cafe: './assets/places/ai-cafe.png',
    streetFood: './assets/places/ai-street-food.png'
  };
  const PLACE_AI_IMAGE_OVERRIDES = {
    '幼虎烘焙': STATIC_AI_FOOD_ASSETS.cafe,
    '野田壽司': STATIC_AI_FOOD_ASSETS.sushi,
    '老二腿庫飯': STATIC_AI_FOOD_ASSETS.streetFood,
    '老二腿庫飯屏東店': STATIC_AI_FOOD_ASSETS.streetFood,
    '米半 鐵板料理': STATIC_AI_FOOD_ASSETS.yakiniku,
    '靖海 日式手作食堂': STATIC_AI_FOOD_ASSETS.sushi,
    '麥料食堂': STATIC_AI_FOOD_ASSETS.streetFood,
    '正良麵店': STATIC_AI_FOOD_ASSETS.noodles
  };

  function getStaticAiFoodImageForPlace(place) {
    const name = String(place?.name || '');
    const text = `${name} ${(place?.categories || []).join(' ')} ${place?.category || ''}`;
    const override = Object.entries(PLACE_AI_IMAGE_OVERRIDES).find(([key]) => name.includes(key));
    if (override) return override[1];
    if (/壽司|生魚|刺身|日料|日式料理/.test(text)) return STATIC_AI_FOOD_ASSETS.sushi;
    if (/燒肉|烤肉|炭烤|鐵板/.test(text)) return STATIC_AI_FOOD_ASSETS.yakiniku;
    if (/火鍋|鍋物|麻辣鍋/.test(text)) return STATIC_AI_FOOD_ASSETS.hotpot;
    if (/咖啡|甜點|飲料|下午茶|烘焙|麵包|可頌/.test(text)) return STATIC_AI_FOOD_ASSETS.cafe;
    if (/拉麵|麵店|麵食|湯麵|餛飩|意麵/.test(text)) return STATIC_AI_FOOD_ASSETS.noodles;
    return STATIC_AI_FOOD_ASSETS.streetFood;
  }

  function getReferenceFoodImageForPlace(place) {
    const text = `${place?.name || ''} ${(place?.categories || []).join(' ')} ${place?.category || ''}`.toLowerCase();
    for (const [key, path] of Object.entries(REFERENCE_FOOD_ASSETS)) {
      if (text.includes(key.toLowerCase())) return path;
    }
    const name = place?.name || '美食';
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
    return DEFAULT_REFERENCE_FOOD_LIST[hash % DEFAULT_REFERENCE_FOOD_LIST.length];
  }

  function selectImage(place, placeholderUrl = './assets/place-placeholder.svg') {
    // 1. 真實照片優先級：coverPhoto > communityPhotos > legacyRestaurantPhotos / safe photos
    const realCandidates = [
      place?.coverPhoto,
      place?.cover,
      place?.imageUrl,
      place?.image,
      place?.photoUrl,
      ...(place?.realPhotos || []),
      ...(place?.communityPhotos || []),
      ...(place?.photos || []),
      ...(place?.legacyRestaurantPhotos || []),
      ...(place?.externalPhotos || []),
      ...(place?.linkedFeedPhotos || []),
      ...(place?.feedPhotos || [])
    ];
    const safeReal = filterSafeImages(realCandidates);
    if (safeReal.length > 0) {
      return { url: safeReal[0], isPlaceholder: false, isReferenceFallback: false, isAiFallback: false, label: '' };
    }

    // 2. 無真實照片時優先使用本地專屬料理 AI 示意圖，不啟動外部搜圖。
    const staticAiFoodImg = getStaticAiFoodImageForPlace(place);
    if (staticAiFoodImg) {
      return { url: staticAiFoodImg, isPlaceholder: true, isReferenceFallback: true, isAiFallback: true, label: 'AI 餐點示意' };
    }

    // 3. 最後才使用分類參考餐點照片
    const referenceFoodImg = getReferenceFoodImageForPlace(place);
    if (referenceFoodImg) {
      return { url: referenceFoodImg, isPlaceholder: true, isReferenceFallback: true, isAiFallback: true, label: '參考餐點照片' };
    }

    // 4. 通用 Placeholder
    return { url: placeholderUrl, isPlaceholder: true, isReferenceFallback: false, isAiFallback: false, label: '參考餐點照片' };
  }
  return { isBlockedLegacyGoogleImage, isBlocked: isBlockedLegacyGoogleImage, filterSafeImages, selectImage, getReferenceFoodImageForPlace, getStaticAiFoodImageForPlace, getAiFoodImageForPlace: getStaticAiFoodImageForPlace, REFERENCE_FOOD_ASSETS, STATIC_AI_FOOD_ASSETS, PLACE_AI_IMAGE_OVERRIDES, AI_FOOD_ASSETS: STATIC_AI_FOOD_ASSETS };
});
