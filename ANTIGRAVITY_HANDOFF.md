---
document_type: antigravity_handoff
schema_version: "1.0"
project_name: 一起吃飯吧
repository: https://github.com/b7516555-max/jia-ben
production_url: https://b7516555-max.github.io/jia-ben/
deployment_platform: github_pages
deployment_branch: gh-pages
last_updated: 2026-08-26
language: zh-TW
---

# Antigravity 專案交接與修改報告

## 1. 當前部署規則

```yaml
hosting:
  provider: GitHub Pages
  repository: b7516555-max/jia-ben
  source_branch: gh-pages
  production_url: https://b7516555-max.github.io/jia-ben/
  netlify_enabled: false
  rule: 不得建立或恢復任何 Netlify 設定、部署流程或站台連結
```

專案已改為只使用 GitHub Pages。後續修改請推送至原 GitHub 專案，正式網站必須沿用上方 production_url。

## 2. Netlify 清理結果

2026-08-22 已掃描整個版本庫，未發現以下項目：

- `netlify.toml`
- `.netlify/`
- Netlify CLI 指令
- Netlify 套件相依性
- Netlify Functions
- `.openai/hosting.json`
- 原始碼內的 Netlify 網址或設定值

因此無檔案需要刪除。後續代理程式不得把此專案判定為 Netlify 專案。

## 3. 照片上傳故障診斷

```yaml
issue:
  symptom: 使用者可選取並預覽照片，但發布時顯示照片上傳失敗
  reproduced: true
  failed_layer: Google Apps Script Web App
  root_cause: Apps Script 未取得 Google Drive OAuth 權限
  backend_error: DriveApp.getFoldersByName permission denied
  unrelated_causes:
    - iPhone 照片選取
    - 前端預覽
    - Canvas JPEG 壓縮
```

實際測試原 Web App API 時，後端回傳沒有呼叫 `DriveApp.getFoldersByName` 的權限。照片已在前端成功壓縮，故障發生在 Google Drive 寫入階段。

## 4. 已完成修改

### `appsscript.json`

新增明確 OAuth 權限：

```json
"oauthScopes": [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets"
]
```

### `index.html`

- 保留原照片壓縮與 Google Drive 上傳流程。
- 上傳失敗時顯示後端實際錯誤原因，方便後續診斷。

### Apps Script 部署

```yaml
apps_script:
  project_id: 1Hhe556jkdAPexGThjWiiCoZ1vdJKkBKVr446Z0fGu-Ov6uLe3VxzGI1V
  deployment_id: AKfycbwTg7lmireS-npCAzvDZVPVmI7u5jAFpslg7SNL59Ab3ulLOUr7cPB5wzIaTSyTUJpl
  deployed_version: 52
  deployment_url_changed: false
```

## 5. Google Drive 授權與後端驗證

```yaml
upload_verification:
  status: passed
  verified_at: 2026-08-22
  authorization: Google Drive 寫入與 Google 試算表權限已完成
  endpoint: Apps Script deployment version 50
  api_action: upload_photo
  response_status: success
  test_file_id: 1qXBWUPe7Kq9awZmDIRJU77vJp_jmDtV9
  public_image_url: https://lh3.googleusercontent.com/d/1qXBWUPe7Kq9awZmDIRJU77vJp_jmDtV9
  public_read_check:
    http_status: 200
    content_type: image/png
    decoded_file: PNG 1x1
```

Apps Script 後端照片寫入與公開圖片讀取已驗證成功。這項結果證明 Drive 儲存層已修復，但尚未等同 iPhone 使用者介面的完整端到端測試。

## 6. 後續驗證清單

- [x] 完成 Apps Script 的 Drive 與試算表 OAuth 授權。
- [x] 執行照片資料夾建立流程且沒有權限錯誤。
- [x] 呼叫既有 Web App 的 `upload_photo` API，確認回傳 `status: success`、`fileId` 與 `imageUrl`。
- [x] 直接讀取回傳的 `imageUrl`，確認 HTTP 200 且內容為 PNG 圖片。
- [x] 使用者已在 iPhone 實際選取照片並成功發布。
- [x] 確認 GitHub Pages 正式網址仍為 `https://b7516555-max.github.io/jia-ben/`。
- [x] 確認版本庫沒有任何 Netlify 設定或相依性。

## 7. 修改守則

1. 僅使用台灣繁體中文與台灣用語。
2. 保留既有 Apps Script deployment ID，避免 Web App 網址改變。
3. 正式前端只從 `gh-pages` 分支發布到原 GitHub Pages 網址。
4. 不得新增 Netlify 設定、Netlify CLI、Netlify Functions 或 Netlify 部署文件。
5. 測試、程式同步、版本部署與手機端端到端驗證必須分開陳述，不得混稱已完成。

## 8. 安裝流程簡化

```yaml
install_experience:
  updated_at: 2026-08-24
  deployment:
    github_pages_commit: 33250a8017808cbec44644ea2f24656737d328b7
    apps_script_version: 51
    original_urls_preserved: true
  android_chrome:
    behavior: 點安裝後優先直接開啟瀏覽器原生安裝確認視窗
    implementation: beforeinstallprompt
  ios_safari:
    behavior: 顯示兩步驟提示
    steps:
      - 點分享圖示
      - 選加入主畫面
  line_in_app_browser:
    behavior: 只提示改用 Safari 或 Chrome 開啟
  installed_mode:
    behavior: 隱藏安裝按鈕
  pwa_files:
    - manifest.webmanifest
    - sw.js
```

Android 的直接安裝依賴瀏覽器觸發 `beforeinstallprompt`。iOS Safari 不允許網頁直接叫出系統安裝確認，因此保留最短的兩步驟提示。

## 9. 手機版新朋友加入卡片修正

```yaml
mobile_welcome_card_fix:
  updated_at: 2026-08-26
  deployment:
    github_pages_commit: 76eb59f50e95c99a7c8984428aeafe29fba63f79
    apps_script_version: 52
    original_urls_preserved: true
  symptom: 動態牆的新朋友加入卡片高度遭壓縮，頭像與文字被裁切並呈現重疊
  root_cause: 行動瀏覽器將動態牆 CSS Grid 自動列高拉伸或壓縮，卡片的 overflow-hidden 讓內容遭裁切
  changes:
    - feed-container 手機版使用 grid-auto-rows max-content
    - feed-container 手機版改為 align-items start 與 align-content start
    - feed-welcome-card 使用自動高度與 5.5rem 安全最小高度
    - Service Worker 快取版本升為 together-eat-shell-v2
  desktop_layout_preserved: true
```

## 10. 電腦版美食人偶與空白區改善

```yaml
desktop_foodie_avatar:
  updated_at: 2026-08-26
  status: implemented
  deployment:
    github_pages_commit: ff688f1759b02496b6f96faeeee8f72522709fb9
    main_commit: d9bdd7609d387775c5c514e3a0988d29386bd520
    apps_script_version: 53
    original_urls_preserved: true
  purpose: 使用新朋友加入卡片在電腦版被同列高卡片撐出的空間，提供可辨識的個人角色
  choices:
    - host
    - explorer
    - cook
    - dessert
    - night
    - camera
  behavior:
    desktop: 卡片下半部顯示大型美食人偶，填補原本過多空白
    mobile: 只顯示小型圓形人偶，不增加卡片高度
    identity_form: 老朋友與新朋友皆可從六款人偶中選擇
    persistence: avatarId 儲存在個人 profile；新朋友同步寫入 system_welcome 動態
    legacy_data: 舊 welcome 動態依姓名穩定配置預設人偶，使用者重新儲存身分後會更新本人舊動態
  asset:
    file: assets/foodie-avatar-sprite.png
    layout: 3x2 CSS sprite
    source_type: AI generated raster image
    prompt_summary: 六款可愛 Q 版美食朋友角色，三欄兩列、淡藍純色背景、無文字與邊框
  cache:
    service_worker: together-eat-shell-v3
```

## 11. 附近美食旋轉輪盤

```yaml
nearby_food_wheel:
  updated_at: 2026-08-26
  status: implemented
  deployment:
    github_pages_commit: 1a96e7c804cf2de3542e7024b41f28751ce3cc53
    main_commit: addc5d39fde9d970adf35af078881536f3cf6e58
    apps_script_version: 54
    original_urls_preserved: true
  replaces: 原本的附近美食雷達結果清單
  compatibility:
    internal_view_id: nearby
    internal_search_type: radar
    note: 內部代號保留，避免破壞既有 Google Places 搜尋與價位篩選
  behavior:
    - 依使用者位置、關鍵字及價位搜尋附近餐廳
    - 最多取距離最近的 15 間作為輪盤選項
    - 使用 Canvas 畫出彩色餐廳輪盤
    - 以減速旋轉動畫隨機抽選一家餐廳
    - 揭曉後顯示店家卡片，可繼續查看店家資訊
    - 支援偏好減少動態效果的系統設定
  labels:
    navigation: 輪盤
    primary_action: 轉動輪盤
  cache:
    service_worker: together-eat-shell-v4
```
