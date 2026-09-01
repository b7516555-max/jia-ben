const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const apiKey = html.match(/apiKey:\s*["']([^"']+)["']/)?.[1];
const projectId = html.match(/projectId:\s*["']([^"']+)["']/)?.[1];
if (!apiKey || !projectId) throw new Error('Firebase config not found');

function decodeValue(value) {
  if (!value || typeof value !== 'object') return value;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('geoPointValue' in value) return value.geoPointValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k,v]) => [k, decodeValue(v)]));
  return null;
}
async function authToken() {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({returnSecureToken:true}) });
  if (!response.ok) throw new Error(`Firebase auth failed ${response.status}`);
  return (await response.json()).idToken;
}
async function listCollection(token, name) {
  const rows=[]; let pageToken='';
  do {
    const url=`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/${projectId}/public/data/${name}?pageSize=300${pageToken?`&pageToken=${encodeURIComponent(pageToken)}`:''}`;
    const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});
    if(response.status===404)return rows;
    if(!response.ok)throw new Error(`${name} read failed ${response.status}`);
    const payload=await response.json();
    for(const doc of payload.documents||[])rows.push({id:doc.name.split('/').pop(),...Object.fromEntries(Object.entries(doc.fields||{}).map(([k,v])=>[k,decodeValue(v)]))});
    pageToken=payload.nextPageToken||'';
  } while(pageToken);
  return rows;
}
const clean=v=>String(v||'').trim();
const validUrl=v=>/^https?:\/\//i.test(clean(v));
function flattenPhotos(row) {
  const values=[];
  for(const key of ['photos','communityPhotos','photoUrls','images']) if(Array.isArray(row[key])) values.push(...row[key]);
  for(const key of ['photoUrl','imageUrl','photo','image','restaurantPhoto']) if(row[key]) values.push(row[key]);
  return [...new Set(values.flatMap(v=>typeof v==='string'?[v]:v&&typeof v==='object'?[v.url,v.photoUrl,v.imageUrl].filter(Boolean):[]).map(clean).filter(v=>validUrl(v)||v.startsWith('data:image/')) )];
}
const ratingMap={push:7,'推爆':7,excellent:7,good:6,'好吃':6,'不錯':5,okay:4,'尚可':4,poor:3,'頗差':3,bad:2,'難吃':2,avoid:1,'避雷':1,negative:1,positive:6};
function ratingValue(row){const raw=row.rating??row.reviewRating??row.score??row.stars;const n=Number(raw);if(Number.isFinite(n)&&n>0)return n<=5?n:(n<=7?((n-1)*4/6+1):null);return ratingMap[clean(raw).toLowerCase()]||ratingMap[clean(raw)]||null;}
function spendValue(row){for(const key of ['spend','averageSpend','price','priceRange','priceLevel','cost','amount','perPersonSpend']){const raw=row[key];if(raw===null||raw===undefined||raw==='')continue;const nums=String(raw).replace(/,/g,'').match(/\d+(?:\.\d+)?/g);if(nums?.length){const values=nums.map(Number).filter(n=>Number.isFinite(n)&&n>0);if(values.length)return values.reduce((a,b)=>a+b,0)/values.length;}}return null;}
function first(...values){return values.flat().map(clean).find(Boolean)||'';}

(async()=>{
  const token=await authToken();
  const names=['jiaPlaces','restaurants','feed','reviews','ratings','favorites','parties','chat','placesApiUsage','config'];
  const data={}; for(const name of names)data[name]=await listCollection(token,name);
  if(data.jiaPlaces.length!==52)throw new Error(`STOP: jiaPlaces ${data.jiaPlaces.length} != baseline 52`);
  const related=[...data.restaurants.map(x=>({...x,_collection:'restaurants'})),...data.feed.map(x=>({...x,_collection:'feed'})),...data.reviews.map(x=>({...x,_collection:'reviews'})),...data.ratings.map(x=>({...x,_collection:'ratings'})),...data.favorites.map(x=>({...x,_collection:'favorites'})),...data.parties.map(x=>({...x,_collection:'parties'})),...data.chat.map(x=>({...x,_collection:'chat'}))];
  const perPlace=data.jiaPlaces.map(place=>{
    const refs=related.filter(row=>row.jiaPlaceId===place.jiaPlaceId);
    const ownPhotos=flattenPhotos(place), legacyPhotos=[...new Set(refs.filter(x=>x._collection==='restaurants').flatMap(flattenPhotos))], communityPhotos=[...new Set(refs.filter(x=>['feed','reviews','ratings'].includes(x._collection)).flatMap(flattenPhotos))];
    const ratings=refs.filter(x=>['feed','reviews','ratings'].includes(x._collection)).map(ratingValue).filter(Number.isFinite);
    const spends=refs.map(spendValue).filter(Number.isFinite);
    const phone=first(place.phone,refs.map(x=>x.phone||x.formatted_phone_number||x.telephone));
    const website=first(place.website,refs.map(x=>x.website||x.url));
    const hours=place.openingHours||refs.map(x=>x.openingHours||x.hours||x.opening_hours).find(Boolean)||null;
    const address=first(place.address,refs.map(x=>x.address||x.formatted_address||x.locationAddress));
    const allPhotos=[...new Set([...ownPhotos,...legacyPhotos,...communityPhotos])];
    const safePhotos=allPhotos.filter(url=>!/^https?:\/\/maps\.googleapis\.com\//i.test(url));
    const missingFields=[]; if(!safePhotos.length)missingFields.push('photo');if(!ratings.length)missingFields.push('rating');if(!spends.length)missingFields.push('price');if(!phone)missingFields.push('phone');if(!website)missingFields.push('website');if(!hours)missingFields.push('openingHours');if(!address)missingFields.push('address');
    return {jiaPlaceId:place.jiaPlaceId,name:place.name,status:place.status,refs:refs.map(x=>({collection:x._collection,id:x.id})),photoUrls:allPhotos,safePhotoUrls:safePhotos,prohibitedGooglePhotoCount:allPhotos.length-safePhotos.length,ownPhotoCount:ownPhotos.length,legacyRestaurantPhotoCount:legacyPhotos.length,safeLegacyRestaurantPhotoCount:legacyPhotos.filter(url=>!/^https?:\/\/maps\.googleapis\.com\//i.test(url)).length,communityPhotoCount:communityPhotos.length,safeCommunityPhotoCount:communityPhotos.filter(url=>!/^https?:\/\/maps\.googleapis\.com\//i.test(url)).length,recoverablePhotoCount:allPhotos.length,safeRecoverablePhotoCount:safePhotos.length,
      ratingCount:ratings.length,ratingAverage:ratings.length?Number((ratings.reduce((a,b)=>a+b,0)/ratings.length).toFixed(2)):null,spendCount:spends.length,averageSpend:spends.length?Math.round(spends.reduce((a,b)=>a+b,0)/spends.length):null,
      hasPhone:Boolean(phone),phoneSource:place.phone?'jiaPlaces':phone?'legacy_related':'',hasWebsite:Boolean(website),websiteSource:place.website?'jiaPlaces':website?'legacy_related':'',hasOpeningHours:Boolean(hours),openingHoursSource:place.openingHours?'jiaPlaces':hours?'legacy_related':'',hasAddress:Boolean(address),addressSource:place.address?'jiaPlaces':address?'legacy_related':'',missingFields};
  });
  const count=fn=>perPlace.filter(fn).length;
  const photoOwners=new Map(); for(const place of perPlace)for(const url of place.photoUrls){if(!photoOwners.has(url))photoOwners.set(url,[]);photoOwners.get(url).push(place.name);}
  const sharedPhotos=[...photoOwners.entries()].filter(([,owners])=>new Set(owners).size>1).map(([url,owners])=>({url,places:[...new Set(owners)]}));
  const photoDomains=Object.fromEntries([...photoOwners.keys()].map(url=>{try{return new URL(url).hostname}catch{return 'inline-or-invalid'}}).reduce((map,domain)=>map.set(domain,(map.get(domain)||0)+1),new Map()));
  const suspectedIllustrations=[...photoOwners.keys()].filter(url=>/unsplash|picsum|placeholder|placehold|fallback|default|dummy|source\.bing|loremflickr/i.test(url));
  const summary={generatedAt:new Date().toISOString(),mode:'enrichment-dry-run',googlePlacesApiCalls:0,baseline:data.jiaPlaces.length,collections:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length])),relatedRecordsWithJiaPlaceId:related.filter(x=>x.jiaPlaceId).length,
    photos:{alreadyInJiaPlaces:count(x=>x.ownPhotoCount>0),containingProhibitedGoogleUrls:count(x=>x.prohibitedGooglePhotoCount>0),safeAfterGoogleExclusion:count(x=>x.safeRecoverablePhotoCount>0),safePresentInRestaurants:count(x=>x.safeLegacyRestaurantPhotoCount>0),safePresentInFeedReviews:count(x=>x.safeCommunityPhotoCount>0),additionalRecoverableFromRestaurants:count(x=>!x.ownPhotoCount&&x.safeLegacyRestaurantPhotoCount>0),additionalRecoverableFromFeedReviews:count(x=>!x.ownPhotoCount&&!x.legacyRestaurantPhotoCount&&x.safeCommunityPhotoCount>0),totalBeforeGoogleExclusion:count(x=>x.recoverablePhotoCount>0)},
    ratings:{placesWithJiaBenRating:count(x=>x.ratingCount>0),totalValidRatings:perPlace.reduce((s,x)=>s+x.ratingCount,0)},spend:{placesWithSpendData:count(x=>x.spendCount>0),totalSpendSamples:perPlace.reduce((s,x)=>s+x.spendCount,0)},
    phone:{already:count(x=>x.phoneSource==='jiaPlaces'),recoverable:count(x=>x.phoneSource==='legacy_related'),totalAfterRecovery:count(x=>x.hasPhone)},website:{already:count(x=>x.websiteSource==='jiaPlaces'),recoverable:count(x=>x.websiteSource==='legacy_related'),totalAfterRecovery:count(x=>x.hasWebsite)},openingHours:{already:count(x=>x.openingHoursSource==='jiaPlaces'),recoverable:count(x=>x.openingHoursSource==='legacy_related'),totalAfterRecovery:count(x=>x.hasOpeningHours)},address:{already:count(x=>x.addressSource==='jiaPlaces'),recoverable:count(x=>x.addressSource==='legacy_related'),totalAfterRecovery:count(x=>x.hasAddress)},
    photoSafety:{uniquePhotoUrls:photoOwners.size,sharedAcrossDifferentPlaces:sharedPhotos.length,suspectedIllustrationUrls:suspectedIllustrations.length,domains:photoDomains},
    missingFieldCounts:Object.fromEntries(['photo','rating','price','phone','website','openingHours','address'].map(field=>[field,count(x=>x.missingFields.includes(field))]))};
  const output={summary,photoAudit:{sharedPhotos,suspectedIllustrations},places:perPlace}; fs.mkdirSync(path.join(root,'reports'),{recursive:true});fs.writeFileSync(path.join(root,'reports','enrichment-dry-run.json'),JSON.stringify(output,null,2));console.log(JSON.stringify(summary,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
