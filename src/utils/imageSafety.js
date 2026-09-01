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
  function selectImage(place,placeholderUrl){
    const candidates=[...(place?.photos||[]),...(place?.legacyRestaurantPhotos||[]),...(place?.communityPhotos||[]),...(place?.externalPhotos||[])];
    const safe=filterSafeImages(candidates);
    return safe.length?{url:safe[0],isPlaceholder:false,label:''}:{url:placeholderUrl||'./assets/place-placeholder.svg',isPlaceholder:true,label:'示意圖片'};
  }
  return {isBlockedLegacyGoogleImage,isBlocked:isBlockedLegacyGoogleImage,filterSafeImages,selectImage};
});
