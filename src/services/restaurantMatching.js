(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JiaRestaurantMatching = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const normalizeName = value => String(value||'').normalize('NFKC').replace(/[臺台]/g,'台').replace(/[\s　·•()（）【】「」『』.,，。／/\\-]/g,'').replace(/(有限公司|股份有限公司|商號|店)$/,'').toLowerCase();
  const normalizeAddress = value => String(value||'').normalize('NFKC').replace(/[臺]/g,'台').replace(/\s/g,'').replace(/號樓/g,'號');
  const normalizePhone = value => String(value||'').replace(/\D/g,'').replace(/^886/,'0');
  function distanceMeters(a,b) { if(!a||!b)return Infinity; const R=6371000, p=Math.PI/180, dLat=(b.lat-a.lat)*p,dLng=(b.lng-a.lng)*p; const x=Math.sin(dLat/2)**2+Math.cos(a.lat*p)*Math.cos(b.lat*p)*Math.sin(dLng/2)**2; return 2*R*Math.asin(Math.sqrt(x)); }
  function score(a,b) { const name=normalizeName(a.name)===normalizeName(b.name)?1:0; const address=normalizeAddress(a.address)&&normalizeAddress(a.address)===normalizeAddress(b.address)?1:0; const phone=normalizePhone(a.phone)&&normalizePhone(a.phone)===normalizePhone(b.phone)?1:0; const distance=distanceMeters(a.latitude&&a.longitude?{lat:a.latitude,lng:a.longitude}:null,b.latitude&&b.longitude?{lat:b.latitude,lng:b.longitude}:null); const geo=distance<=30?1:distance<=100?.5:0; const total=name*.35+address*.3+phone*.2+geo*.15; const decision=total>=.88?'AUTO_MATCH':total>=.55?'NEEDS_REVIEW':total>0?'CONFLICT':'NEW_CANDIDATE'; return {total:Number(total.toFixed(3)),name,address,phone,geo,distanceMeters:distance,decision}; }
  function preserveCanonical(canonical,candidate) { return { ...candidate, restaurantId:canonical.restaurantId, legacyRestaurantIds:[...(canonical.legacyRestaurantIds||[]),candidate.restaurantId].filter(Boolean), canonicalSource:'existing-jia-ben', fieldProvenance:{...(candidate.fieldProvenance||{}), ...(canonical.fieldProvenance||{})} }; }
  return { normalizeName, normalizeAddress, normalizePhone, distanceMeters, score, preserveCanonical };
});
