global.window=global; global.navigator={}; const store=new Map(); global.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
global.fetch=async()=>({ok:true,json:async()=>[]}); require('./osm-adapter.js');
(async()=>{
  const saved=[]; const firebase=[{jiaPlaceId:'jia_demo',name:'測試餐廳',normalizedName:'測試餐廳',city:'屏東縣',district:'屏東市',location:{lat:22.6761,lng:120.4942},categories:['restaurant']}];
  let calls=[]; window.JiaPlaces.configureFirebase({load:async()=>firebase,commercialSearch:async(provider)=>{calls.push(provider);return provider==='here'?[{name:'外部測試店',place_id:'here:1',formatted_address:'屏東',geometry:{location:{lat:()=>22.68,lng:()=>120.49}},types:['restaurant'],_provider:'here'}]:[];},save:async place=>{const row={jiaPlaceId:'jia_saved',name:place.name,location:{lat:22.68,lng:120.49},source:place._provider};firebase.push(row);saved.push(row);return row;}});
  const first=await window.JiaPlaces.searchPlaces({query:'測試餐廳',location:{lat:22.676,lng:120.494},desiredResults:5}); if(first[0]?._provider!=='firebase'||calls.length)throw new Error('Firebase-first failed');
  const external=await window.JiaPlaces.searchPlaces({query:'外部測試店',desiredResults:1}); if(calls.join(',')!=='foursquare,here'||external[0]?._provider!=='here')throw new Error('fallback order failed');
  await window.JiaPlaces.selectPlace(external[0]); calls=[]; const second=await window.JiaPlaces.searchPlaces({query:'外部測試店',desiredResults:1}); if(second[0]?._provider!=='firebase'||calls.length)throw new Error('second search API=0 failed');
  window.JiaPlaces.quota.foursquare.used=window.JiaPlaces.quota.foursquare.safeLimit; calls=[]; await window.JiaPlaces.searchPlaces({query:'不存在店家',desiredResults:1}); if(calls.includes('foursquare'))throw new Error('quota stop failed');
  console.log(JSON.stringify({firebaseHit:true,fallback:['foursquare','here'],writeback:saved.length,secondSearchApiCalls:0,quotaStop:true}));
})().catch(e=>{console.error(e);process.exitCode=1;});
