(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JiaMapProvider = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const METHODS = ['initialize','destroy','setCenter','setZoom','fitBounds','setMarkers','selectMarker','getBounds','setUserLocation','onMarkerClick','onViewportChange','resize'];
  function assertProvider(provider) { const missing=METHODS.filter(name=>typeof provider?.[name]!=='function'); if(missing.length) throw new Error(`MAP_PROVIDER_CONTRACT_MISSING:${missing.join(',')}`); return provider; }
  function create(options={}) { const primary=options.primary||null, fallback=options.fallback||null; let active=null; const state={provider:null, fallbackUsed:false}; async function initialize(...args){ try{if(primary){active=assertProvider(primary);await active.initialize(...args);state.provider='primary';return active;}}catch(error){state.primaryError=String(error?.message||error);} if(fallback){active=assertProvider(fallback);await active.initialize(...args);state.provider='fallback';state.fallbackUsed=true;return active;} throw new Error('NO_MAP_PROVIDER_AVAILABLE'); } const proxy={initialize, getState:()=>({...state}), getActive:()=>active}; METHODS.filter(n=>n!=='initialize').forEach(name=>proxy[name]=(...args)=>active?.[name]?.(...args)); return proxy; }
  return { METHODS, assertProvider, create };
});
