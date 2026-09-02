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
  function filterSafeImages(values){return [...new Set((values||[]).filter(value=>typeof value==='string'&&value.trim()&&!isBlockedLegacyGoogleImage(value)))];}
  const AI_FOOD_ASSETS = {
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

  const DEFAULT_AI_FOOD_LIST = [
    './assets/food/lu_rou_fan.jpg',
    './assets/food/ramen.jpg',
    './assets/food/yakiniku.jpg',
    './assets/food/hotpot.jpg',
    './assets/food/cafe.jpg'
  ];

  function getAiFoodImageForPlace(place) {
    const text = `${place?.name || ''} ${(place?.categories || []).join(' ')} ${place?.category || ''}`.toLowerCase();
    for (const [key, path] of Object.entries(AI_FOOD_ASSETS)) {
      if (text.includes(key.toLowerCase())) return path;
    }
    const name = place?.name || '美食';
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
    return DEFAULT_AI_FOOD_LIST[hash % DEFAULT_AI_FOOD_LIST.length];
  }

  function selectImage(place, placeholderUrl) {
    const candidates = [...(place?.photos || []), ...(place?.legacyRestaurantPhotos || []), ...(place?.communityPhotos || []), ...(place?.externalPhotos || [])];
    const safe = filterSafeImages(candidates);
    if (safe.length) {
      return { url: safe[0], isPlaceholder: false, label: '' };
    }
    const aiFoodImg = getAiFoodImageForPlace(place);
    return { url: aiFoodImg, isPlaceholder: false, label: 'AI美食示意' };
  }
  return { isBlockedLegacyGoogleImage, isBlocked: isBlockedLegacyGoogleImage, filterSafeImages, selectImage, getAiFoodImageForPlace, AI_FOOD_ASSETS };
});
