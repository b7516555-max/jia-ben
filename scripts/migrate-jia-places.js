const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const apiKey = html.match(/apiKey:\s*["']([^"']+)["']/)?.[1];
const projectId = html.match(/projectId:\s*["']([^"']+)["']/)?.[1];
const plan = JSON.parse(fs.readFileSync(path.join(root, 'reports', 'migration-plan.json'), 'utf8'));
const EXPECTED = 52;
if (plan.length !== EXPECTED) throw new Error(`STOP: migration plan ${plan.length} != baseline ${EXPECTED}`);

const districtParents = {
  '三民區':'高雄市','大寮區':'高雄市','左營區':'高雄市','鳳山區':'高雄市','鹽埕區':'高雄市',
  '九如鄉':'屏東縣','里港鄉':'屏東縣','屏東市':'屏東縣','板橋區':'新北市','魚池鄉':'南投縣'
};
function txt(v){ return String(v || '').trim(); }
function admin(place) {
  const original = txt(place.city);
  if (!original || original === '未分類') return { city:'', district:'', original, needsReview:true };
  if (districtParents[original]) return { city:districtParents[original], district:original, original, needsReview:false };
  if (/[市縣]$/.test(original)) {
    if (original === '屏東市') return { city:'屏東縣', district:'屏東市', original, needsReview:false };
    return { city:original, district:txt(place.district), original, needsReview:false };
  }
  if (original === '東區' && /23\.4[67-9]/.test(String(place.lat)) && Number(place.lng) > 120.43 && Number(place.lng) < 120.52) return { city:'嘉義市', district:'東區', original, needsReview:false };
  if (original === '西區' && Number(place.lat) > 23.43 && Number(place.lat) < 23.52 && Number(place.lng) > 120.39 && Number(place.lng) < 120.47) return { city:'嘉義市', district:'西區', original, needsReview:false };
  return { city:'', district:original, original, needsReview:true };
}
function stableId(p){
  const key = p.legacyGooglePlaceId ? `google:${p.legacyGooglePlaceId}` : p.osmId ? `osm:${p.osmId}` : Number.isFinite(p.lat) && Number.isFinite(p.lng) ? `geo:${p.normalizedName}:${p.lat.toFixed(5)}:${p.lng.toFixed(5)}` : `name:${p.normalizedName}:${txt(p.city)}:${txt(p.address)}`;
  return `jia_${crypto.createHash('sha256').update(key).digest('hex').slice(0,20)}`;
}
function canonical(p){
  const a=admin(p), id=stableId(p), now=new Date().toISOString();
  return { jiaPlaceId:id, name:p.name, normalizedName:p.normalizedName, address:txt(p.address), city:a.city, district:a.district, country:txt(p.country)||'台灣',
    location:Number.isFinite(p.lat)&&Number.isFinite(p.lng)?{lat:p.lat,lng:p.lng}:null, categories:[txt(p.category)].filter(Boolean), phone:txt(p.phone), website:txt(p.website), openingHours:p.openingHours||null,
    source:p.legacyGooglePlaceId?'legacy_google_places':'legacy_jia_ben', sourceIds:{google:txt(p.legacyGooglePlaceId),osm:txt(p.osmId),foursquare:'',here:'',geoapify:''}, legacyGooglePlaceId:txt(p.legacyGooglePlaceId),
    legacyAdminValue:a.original, status:a.needsReview?'needs_review':'active', needsReview:a.needsReview, photos:p.photos||[], mapLink:txt(p.mapLink), reviewCount:Number(p.reviewCount||0), favoriteCount:Number(p.favoriteCount||0),
    legacyRefs:p.sources||[], dataQuality:{score:[p.name,p.address,p.phone,p.website,p.legacyGooglePlaceId,Number.isFinite(p.lat)].filter(Boolean).length,verifiedCount:0}, createdAt:now, updatedAt:now };
}
function fv(v){
  if(v===null||v===undefined)return {nullValue:null}; if(typeof v==='string')return {stringValue:v}; if(typeof v==='boolean')return {booleanValue:v}; if(typeof v==='number')return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
  if(Array.isArray(v))return {arrayValue:{values:v.map(fv)}}; if(typeof v==='object')return {mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,fv(x)]))}}; return {stringValue:String(v)};
}
function fields(obj){return Object.fromEntries(Object.entries(obj).map(([k,v])=>[k,fv(v)]));}
async function token(){const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnSecureToken:true})});if(!r.ok)throw new Error(`auth ${r.status}`);return (await r.json()).idToken;}
const base=c=>`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/${projectId}/public/data/${c}`;
async function list(t,c){const r=await fetch(`${base(c)}?pageSize=300`,{headers:{Authorization:`Bearer ${t}`}});if(r.status===404)return[];if(!r.ok)throw new Error(`list ${c} ${r.status} ${await r.text()}`);return (await r.json()).documents||[];}
async function put(t,c,id,data){const r=await fetch(`${base(c)}/${encodeURIComponent(id)}`,{method:'PATCH',headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json'},body:JSON.stringify({fields:fields(data)})});if(!r.ok)throw new Error(`write ${c}/${id} ${r.status} ${await r.text()}`);return r.json();}
async function patchJiaPlaceId(t,c,id,jiaPlaceId){const r=await fetch(`${base(c)}/${encodeURIComponent(id)}?updateMask.fieldPaths=jiaPlaceId`,{method:'PATCH',headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json'},body:JSON.stringify({fields:{jiaPlaceId:fv(jiaPlaceId)}})});if(!r.ok)throw new Error(`link ${c}/${id} ${r.status} ${await r.text()}`);}

(async()=>{
  const docs=plan.map(canonical); const ids=new Set(docs.map(x=>x.jiaPlaceId)); if(ids.size!==EXPECTED)throw new Error(`STOP: deterministic ids ${ids.size} != ${EXPECTED}`);
  console.log(`preflight canonical=${docs.length} uniqueIds=${ids.size}`);
  const t=await token(); const before=await list(t,'jiaPlaces');
  console.log(`firebase before=${before.length}`);
  const unexpectedBefore=before.filter(d=>!ids.has(d.name.split('/').pop())); if(unexpectedBefore.length)throw new Error(`STOP: jiaPlaces contains ${unexpectedBefore.length} unexpected pre-existing documents`);
  for(let i=0;i<docs.length;i++){await put(t,'jiaPlaces',docs[i].jiaPlaceId,docs[i]);if((i+1)%10===0||i===docs.length-1)console.log(`jiaPlaces ${i+1}/${docs.length}`);}
  const usage=[['foursquare',{provider:'foursquare',period:'month',safeLimit:450,used:0,enabled:false}],['here',{provider:'here',period:'day',safeLimit:900,used:0,enabled:false}],['geoapify',{provider:'geoapify',period:'day',safeLimit:2700,used:0,enabled:false}],['nominatim',{provider:'nominatim',period:'second',safeLimit:1,used:0,enabled:true}],['overpass',{provider:'overpass',period:'second',safeLimit:1,used:0,enabled:true}]];
  for(const [id,data] of usage)await put(t,'placesApiUsage',id,{...data,updatedAt:new Date().toISOString()});
  console.log('placesApiUsage 5/5');
  for(const doc of docs)for(const ref of doc.legacyRefs.filter(x=>x.source==='firebase'&&['restaurant','feed','party'].includes(x.kind)&&x.id))await patchJiaPlaceId(t,ref.kind==='restaurant'?'restaurants':ref.kind==='feed'?'feed':'parties',ref.id,doc.jiaPlaceId);
  const after=await list(t,'jiaPlaces'); if(after.length!==EXPECTED)throw new Error(`STOP: post-write count ${after.length} != ${EXPECTED}`);
  const report={generatedAt:new Date().toISOString(),baseline:EXPECTED,before:before.length,after:after.length,uniqueIds:ids.size,needsReview:docs.filter(x=>x.needsReview).length,withGps:docs.filter(x=>x.location).length,withLegacyGooglePlaceId:docs.filter(x=>x.legacyGooglePlaceId).length,bySource:Object.fromEntries([...new Set(docs.map(x=>x.source))].map(s=>[s,docs.filter(x=>x.source===s).length])),usageDocs:usage.length};
  fs.writeFileSync(path.join(root,'reports','migration-result.json'),JSON.stringify(report,null,2)); console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
