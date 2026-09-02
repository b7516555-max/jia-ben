/**
 * 檔案：Code.gs / 程式碼.js
 * 說明：Google Apps Script 伺服器代碼 & Google Sheets 資料庫 API & Google Drive 照片上傳 & Multi-Provider Enrichment Proxy
 * Google 試算表 ID: 1lNOBRQJTnbdtOnAbTv1C4An1_1MQOaoRSW-mmxOCgYY
 */

const SPREADSHEET_ID = '1lNOBRQJTnbdtOnAbTv1C4An1_1MQOaoRSW-mmxOCgYY';
// 評價照片存放資料夾名稱 (可透過 Script Properties 設定 REVIEW_PHOTO_FOLDER_ID 覆寫)
const DEFAULT_PHOTO_FOLDER_NAME = '一起吃飯_評價照片';

function doGet(e) {
  // 若包含 action 參數則作為 API 處理
  if (e && e.parameter) {
    if (e.parameter.action === 'image' && e.parameter.id) {
      try {
        const file = DriveApp.getFileById(e.parameter.id);
        return file.getBlob();
      } catch (err) {
        return ContentService.createTextOutput("Image not found: " + err.toString());
      }
    }
    if (e.parameter.action) {
      return handleApiRead(e.parameter);
    }
  }
  // 否則輸出為 index.html 網頁
  return HtmlService.createHtmlOutputFromFile('index')
      .setTitle('一起吃飯吧！')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getOrCreatePhotoFolder() {
  try {
    const prop = PropertiesService.getScriptProperties().getProperty('REVIEW_PHOTO_FOLDER_ID');
    if (prop) {
      try {
        return DriveApp.getFolderById(prop);
      } catch (e) {
        console.warn("指定之 REVIEW_PHOTO_FOLDER_ID 無效，將搜尋預設名稱資料夾:", e);
      }
    }
    
    const folders = DriveApp.getFoldersByName(DEFAULT_PHOTO_FOLDER_NAME);
    if (folders.hasNext()) {
      const folder = folders.next();
      try { folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (_) {}
      return folder;
    }
    
    const newFolder = DriveApp.createFolder(DEFAULT_PHOTO_FOLDER_NAME);
    try { newFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (_) {}
    try { PropertiesService.getScriptProperties().setProperty('REVIEW_PHOTO_FOLDER_ID', newFolder.getId()); } catch (_) {}
    return newFolder;
  } catch (err) {
    console.error("建立或取得 Google Drive 資料夾失敗:", err);
    throw err;
  }
}

/**
 * 上傳評價照片至 Google Drive 並設定公開檢視權限
 * @param {string} base64Data Base64 編碼圖片資料 (可含 data:image/... 前綴)
 * @param {string} mimeType 圖片 MIME 格式 (預設 image/jpeg)
 * @param {string} fileName 檔案名稱 (選填)
 * @returns {object} { status: 'success', fileId, imageUrl } 或 { status: 'error', message }
 */
function uploadReviewPhoto(base64Data, mimeType, fileName) {
  try {
    if (!base64Data || typeof base64Data !== 'string') {
      return { status: 'error', message: '無效的圖片資料' };
    }
    
    let cleanBase64 = base64Data;
    let detectedMime = mimeType || 'image/jpeg';
    
    if (base64Data.indexOf(',') !== -1) {
      const parts = base64Data.split(',');
      const mimeMatch = parts[0].match(/:(.*?);/);
      if (mimeMatch && mimeMatch[1]) {
        detectedMime = mimeMatch[1];
      }
      cleanBase64 = parts[1];
    }
    
    const ext = detectedMime.includes('png') ? '.png' : (detectedMime.includes('webp') ? '.webp' : '.jpg');
    const finalName = fileName || ('review_' + new Date().getTime() + ext);
    
    const decodedBytes = Utilities.base64Decode(cleanBase64);
    const blob = Utilities.newBlob(decodedBytes, detectedMime, finalName);
    
    const folder = getOrCreatePhotoFolder();
    const file = folder.createFile(blob);
    
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      console.warn("設定檔案共享權限警告:", shareErr);
    }
    
    const fileId = file.getId();
    // 使用 Google User Content 最佳化 CDN 網址，支援公開直讀
    const imageUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
    
    return {
      status: 'success',
      fileId: fileId,
      imageUrl: imageUrl
    };
  } catch (err) {
    console.error("uploadReviewPhoto error:", err);
    return {
      status: 'error',
      message: err.toString()
    };
  }
}

function doPost(e) {
  try {
    const contents = JSON.parse(e.postData.contents);
    const action = contents.action;
    
    // 支援獨立 POST API 上傳照片
    if (action === 'upload_photo') {
      const uploadRes = uploadReviewPhoto(contents.base64Data, contents.mimeType, contents.fileName);
      return jsonResponse(uploadRes);
    }

    // Jia-ben Place Enrichment proxy. API keys only live in Script Properties.
    if (action === 'enrich_place') {
      return jsonResponse(handlePlaceEnrichmentProxy(contents));
    }
    
    const sheetName = contents.sheetName || 'Restaurants';
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    
    if (action === 'add') {
      const data = contents.data;
      if (sheetName === 'Restaurants') {
        sheet.appendRow([
          data.id || Date.now().toString(),
          data.name || '',
          data.city || '',
          data.category || '',
          data.mapLink || '',
          data.rating || '',
          data.photoUrl || '',
          data.group || '',
          data.creator || '',
          data.notes || '',
          new Date().toISOString()
        ]);
      } else if (sheetName === 'Feed') {
        sheet.appendRow([
          data.id || Date.now().toString(),
          data.restaurantName || '',
          data.group || '',
          data.creator || '',
          data.rating || '',
          data.content || '',
          data.type || 'review',
          data.inviter || '',
          data.photoUrl || '',
          new Date().toISOString()
        ]);
      }
      return jsonResponse({ status: 'success', message: '已成功存入 Google Sheets' });
    }
    
    return jsonResponse({ status: 'error', message: '未知操作' });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

function handleApiRead(params) {
  const sheetName = params.sheetName || 'Restaurants';
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    return jsonResponse([]);
  }
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return jsonResponse([]); // 只包含標題列或無資料
  
  const headers = rows[0];
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx];
    });
    result.push(obj);
  }
  return jsonResponse(result);
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Multi-Provider Place Enrichment Proxy
 * Strictly checks quotas and script property keys for all providers.
 */
function handlePlaceEnrichmentProxy(request) {
  const provider = String(request.provider || '').toLowerCase();
  const properties = PropertiesService.getScriptProperties();

  // Yelp is strictly disabled due to billing policy
  if (provider === 'yelp') {
    return { status: 'disabled_billing_required', provider: 'yelp', message: 'Yelp is disabled due to billing requirement policy' };
  }

  // Taiwan Open Data pass-through
  if (provider === 'taiwan_open_data' || provider === 'taiwanopendata') {
    const place = request.place || {};
    return {
      status: 'success',
      provider: 'taiwan_open_data',
      name: place.name || '',
      address: place.address || '',
      city: place.city || '',
      category: place.category || '餐飲業'
    };
  }

  const keyNames = {
    foursquare: 'FOURSQUARE_API_KEY',
    here: 'HERE_API_KEY',
    geoapify: 'GEOAPIFY_API_KEY',
    hotpepper: 'HOTPEPPER_API_KEY',
    kakao_local: 'KAKAO_REST_API_KEY',
    kakao: 'KAKAO_REST_API_KEY',
    naver_local: 'NAVER_CLIENT_ID',
    naver_blog: 'NAVER_CLIENT_ID'
  };

  const safeLimits = {
    foursquare: 450,
    here: 900,
    geoapify: 2700,
    hotpepper: 9000,
    kakao_local: 250000,
    kakao: 250000,
    naver_local: 20000,
    naver_blog: 20000
  };

  const normalizedProvider = provider === 'kakao' ? 'kakao_local' : provider;

  if (!keyNames[normalizedProvider]) {
    return { status: 'unsupported_provider', provider: provider };
  }

  const apiKey = properties.getProperty(keyNames[normalizedProvider]);
  if (!apiKey) {
    return { status: 'disabled_no_key', provider: normalizedProvider };
  }

  const place = request.place || {};
  if (!place.name) {
    return { status: 'invalid_place', provider: normalizedProvider };
  }

  const period = normalizedProvider === 'foursquare' ? Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM') : Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  const usageKey = 'JIA_USAGE_' + normalizedProvider.toUpperCase() + '_' + period;
  const used = Number(properties.getProperty(usageKey) || 0);

  if (used >= (safeLimits[normalizedProvider] || 1000)) {
    return { status: 'quota_stop', provider: normalizedProvider, used: used, safeLimit: safeLimits[normalizedProvider] };
  }

  try {
    let result = null;
    if (normalizedProvider === 'foursquare') {
      result = fetchFoursquareEnrichment_(apiKey, place);
    } else if (normalizedProvider === 'here') {
      result = fetchHereEnrichment_(apiKey, place);
    } else if (normalizedProvider === 'geoapify') {
      result = fetchGeoapifyEnrichment_(apiKey, place);
    } else if (normalizedProvider === 'hotpepper') {
      result = fetchHotPepperEnrichment_(apiKey, place);
    } else if (normalizedProvider === 'kakao_local') {
      result = fetchKakaoEnrichment_(apiKey, place);
    } else if (normalizedProvider === 'naver_local') {
      const secret = properties.getProperty('NAVER_CLIENT_SECRET') || '';
      result = fetchNaverLocalEnrichment_(apiKey, secret, place);
    } else if (normalizedProvider === 'naver_blog') {
      const secret = properties.getProperty('NAVER_CLIENT_SECRET') || '';
      result = fetchNaverBlogEnrichment_(apiKey, secret, place);
    }

    properties.setProperty(usageKey, String(used + 1));
    return result || { status: 'no_match', provider: normalizedProvider };
  } catch (error) {
    console.error('Enrichment proxy error (' + normalizedProvider + '):', error);
    return { status: 'provider_error', provider: normalizedProvider, message: String(error) };
  }
}

function fetchFoursquareEnrichment_(apiKey, place) {
  const lat = Number(place.location && place.location.lat);
  const lng = Number(place.location && place.location.lng);
  const params = { query: place.name, limit: 3 };
  if (isFinite(lat) && isFinite(lng)) {
    params.ll = lat + ',' + lng;
    params.radius = 500;
  }
  const url = 'https://places-api.foursquare.com/places/search?' + toQueryString_(params);
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + apiKey, 'X-Places-Api-Version': '2025-06-17', Accept: 'application/json' } });
  if (response.getResponseCode() !== 200) throw new Error('Foursquare HTTP ' + response.getResponseCode());
  const payload = JSON.parse(response.getContentText()), item = (payload.results || payload.places || [])[0];
  if (!item) return null;
  const location = item.location || {}, geocodes = item.geocodes && (item.geocodes.main || item.geocodes.drop_off) || {};
  return { status: 'success', provider: 'foursquare', sourceId: item.fsq_place_id || item.fsq_id || item.id || '', name: item.name || '', address: location.formatted_address || [location.address, location.locality, location.region].filter(Boolean).join(', '), phone: item.tel || '', website: item.website || '', openingHours: item.hours || null, priceLevel: item.price || null, rating: Number(item.rating) || null, ratingCount: item.stats && item.stats.total_ratings || null, externalPhotos: [] , location: { lat: Number(geocodes.latitude), lng: Number(geocodes.longitude) } };
}

function fetchHereEnrichment_(apiKey, place) {
  const lat = Number(place.location && place.location.lat);
  const lng = Number(place.location && place.location.lng);
  const params = { q: place.name, limit: 3, apiKey: apiKey, lang: 'zh-TW' };
  if (isFinite(lat) && isFinite(lng)) {
    params.at = lat + ',' + lng;
  }
  const response = UrlFetchApp.fetch('https://discover.search.hereapi.com/v1/discover?' + toQueryString_(params), { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) throw new Error('HERE HTTP ' + response.getResponseCode());
  const item = (JSON.parse(response.getContentText()).items || [])[0]; if (!item) return null;
  const contacts = item.contacts || [], phone = contacts.flatMap(function(x){return x.phone || [];})[0], web = contacts.flatMap(function(x){return x.www || [];})[0];
  return { status:'success', provider:'here', sourceId:item.id || '', name:item.title || '', address:item.address && item.address.label || '', phone:phone && phone.value || '', website:web && web.value || '', openingHours:item.openingHours || null, priceLevel:null, externalPhotos:[], location:{lat:Number(item.position && item.position.lat),lng:Number(item.position && item.position.lng)} };
}

function fetchGeoapifyEnrichment_(apiKey, place) {
  const lat = Number(place.location && place.location.lat);
  const lng = Number(place.location && place.location.lng);
  const params = { categories:'catering.restaurant,catering.cafe,catering.fast_food', name:place.name, limit:3, lang:'zh', apiKey:apiKey };
  if (isFinite(lat) && isFinite(lng)) {
    params.filter = 'circle:' + lng + ',' + lat + ',500';
    params.bias = 'proximity:' + lng + ',' + lat;
  }
  const response = UrlFetchApp.fetch('https://api.geoapify.com/v2/places?' + toQueryString_(params), { muteHttpExceptions:true });
  if (response.getResponseCode() !== 200) throw new Error('Geoapify HTTP ' + response.getResponseCode());
  const feature = (JSON.parse(response.getContentText()).features || [])[0]; if (!feature) return null; const p = feature.properties || {}, coordinates = feature.geometry && feature.geometry.coordinates || [];
  return { status:'success', provider:'geoapify', sourceId:p.place_id || '', name:p.name || '', address:p.formatted || '', phone:p.contact && p.contact.phone || '', website:p.website || p.contact && p.contact.website || '', openingHours:p.opening_hours || null, priceLevel:null, externalPhotos:[], location:{lat:Number(coordinates[1]),lng:Number(coordinates[0])} };
}

function fetchHotPepperEnrichment_(apiKey, place) {
  const params = { key: apiKey, name_any: place.name, count: 3, format: 'json' };
  const lat = Number(place.location && place.location.lat);
  const lng = Number(place.location && place.location.lng);
  if (isFinite(lat) && isFinite(lng)) {
    params.lat = lat;
    params.lng = lng;
    params.range = 3;
  }
  const url = 'https://webservice.recruit.co.jp/hotpepper/gourmet/v1/?' + toQueryString_(params);
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) throw new Error('HotPepper HTTP ' + response.getResponseCode());
  const payload = JSON.parse(response.getContentText());
  const shop = payload.results && payload.results.shop && payload.results.shop[0];
  if (!shop) return null;
  return {
    status: 'success',
    provider: 'hotpepper',
    shop: shop
  };
}

function fetchKakaoEnrichment_(apiKey, place) {
  const params = { query: place.name, size: 3, category_group_code: 'FD6' }; // FD6 is restaurant in Kakao Local
  const lat = Number(place.location && place.location.lat);
  const lng = Number(place.location && place.location.lng);
  if (isFinite(lat) && isFinite(lng)) {
    params.x = lng;
    params.y = lat;
    params.radius = 1000;
  }
  const url = 'https://dapi.kakao.com/v2/local/search/keyword.json?' + toQueryString_(params);
  const response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { Authorization: 'KakaoAK ' + apiKey }
  });
  if (response.getResponseCode() !== 200) throw new Error('Kakao HTTP ' + response.getResponseCode());
  const payload = JSON.parse(response.getContentText());
  const doc = payload.documents && payload.documents[0];
  if (!doc) return null;
  return {
    status: 'success',
    provider: 'kakao_local',
    document: doc
  };
}

function fetchNaverLocalEnrichment_(clientId, clientSecret, place) {
  const params = { query: place.name, display: 3, start: 1, sort: 'random' };
  const url = 'https://openapi.naver.com/v1/search/local.json?' + toQueryString_(params);
  const response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret
    }
  });
  if (response.getResponseCode() !== 200) throw new Error('Naver Local HTTP ' + response.getResponseCode());
  const payload = JSON.parse(response.getContentText());
  const item = payload.items && payload.items[0];
  if (!item) return null;
  return {
    status: 'success',
    provider: 'naver_local',
    item: item
  };
}

function fetchNaverBlogEnrichment_(clientId, clientSecret, place) {
  const params = { query: place.name, display: 5, start: 1, sort: 'sim' };
  const url = 'https://openapi.naver.com/v1/search/blog.json?' + toQueryString_(params);
  const response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret
    }
  });
  if (response.getResponseCode() !== 200) throw new Error('Naver Blog HTTP ' + response.getResponseCode());
  const payload = JSON.parse(response.getContentText());
  return {
    status: 'success',
    provider: 'naver_blog',
    items: payload.items || [],
    total: payload.total || 0
  };
}

function toQueryString_(params) {
  return Object.keys(params).filter(function(key){ return params[key] !== '' && params[key] !== null && params[key] !== undefined; }).map(function(key){ return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]); }).join('&');
}