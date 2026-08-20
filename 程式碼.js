/**
 * 檔案：Code.gs
 * 說明：Google Apps Script 伺服器代碼 & Google Sheets 資料庫 API & Google Drive 照片上傳
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