(function (root) {
    'use strict';
    root.JIA_BEN_RELEASE_NOTES = Object.freeze({
        v126: {
            date: '2026-11-18',
            title: '📍 店家地址資料補齊啦',
            highlights: [
                '以商工登記開放資料補上 6 家店家的缺漏地址。',
                '新增本地 enrichment overlay，首頁、地圖與口袋名單會同步顯示完整地區。',
                'Overpass 改為多節點備援與批次查詢，電話與營業時間只採用可安全比對的 OSM 資料。'
            ]
        },
        v125: {
            date: '2026-11-18',
            title: '🎉 地圖列表照片補齊啦',
            highlights: [
                '地圖找餐廳左側列表現在與首頁共用同一套照片 fallback。',
                '沒有店家實拍時，會先搜尋 Openverse／Wikimedia，找不到再依料理分類顯示參考餐點照片。',
                '延續 v124 的地圖頁獨立隔離與拖曳後導覽切換修正。'
            ]
        },
        v124: {
            date: '2026-11-18',
            title: '🎉 地圖與店家照片更新啦',
            highlights: [
                '地圖頁與找餐廳現在完全隔離，拖曳地圖後也能正常切換功能。',
                '店家卡片會優先尋找免費網路美食照片，找不到時改用料理分類照片。',
                '店名內的時間數字空白已統一整理，閱讀更緊湊。'
            ]
        },
        v123: {
            date: '2026-11-18',
            title: '🎉 呷奔更新啦',
            highlights: [
                '吃貨主揪檔案換上更活潑的美食 App 風格與製作人頭像。',
                '新增改版公告，首次開啟提醒一次，也能隨時重看。',
                '店家詳情加入免費網路圖片搜尋與 Google 圖片／食記入口。',
                '修正瀏覽器上一頁畫面落後一拍的問題。'
            ]
        },
        v122: { date: '2026-11-18', title: '瀏覽體驗更新', highlights: ['修正獨立頁面路由與 popstate 返回同步。', '啟用 LINE LIFF 快速登入設定。'] }
    });
})(typeof window !== 'undefined' ? window : globalThis);
