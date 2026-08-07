/**
 * 檔案：Code.gs
 * 說明：Google Apps Script 伺服器代碼 & Google Sheets 資料庫 API
 * Google 試算表 ID: 1lNOBRQJTnbdtOnAbTv1C4An1_1MQOaoRSW-mmxOCgYY
 */

const SPREADSHEET_ID = '1lNOBRQJTnbdtOnAbTv1C4An1_1MQOaoRSW-mmxOCgYY';

function doGet(e) {
  // 若包含 action 參數則作為 API 處理
  if (e && e.parameter && e.parameter.action) {
    return handleApiRead(e.parameter);
  }
  // 否則輸出為 index.html 網頁
  return HtmlService.createHtmlOutputFromFile('index')
      .setTitle('一起吃飯吧！')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    const contents = JSON.parse(e.postData.contents);
    const action = contents.action;
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