
        import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        import { getFirestore, collection, addDoc, onSnapshot, serverTimestamp, doc, setDoc, getDoc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

        let deferredPrompt;
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
        });

        window.addEventListener('DOMContentLoaded', () => {
            const feedContainer = document.getElementById('feed-container');
            if (feedContainer) {
                feedContainer.addEventListener('click', (event) => {
                    const restaurantLink = event.target.closest('a[href*="google.com/maps/search"]');
                    if (!restaurantLink || !feedContainer.contains(restaurantLink)) return;
                    event.preventDefault();
                    window.openRestaurantDetailByName(window.escapeForBtn(restaurantLink.textContent.trim()));
                });
            }
            if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
                const btnInstall = document.getElementById('btn-install-app');
                const btnEnter = document.getElementById('btn-enter-web');
                if(btnInstall) btnInstall.classList.add('hidden');
                if(btnEnter) {
                    btnEnter.innerHTML = '啟動雷達 <i class="fa-solid fa-rocket ml-1.5"></i>';
                    btnEnter.classList.replace('text-gray-500', 'text-white');
                    btnEnter.classList.replace('hover:text-gray-800', 'hover:bg-gray-800');
                    btnEnter.classList.add('bg-gray-900', 'rounded-full', 'py-4', 'shadow-lg', 'hover:scale-105', 'text-base');
                }
            }
            if (typeof window.handleExploreCountryChange === 'function') {
                window.handleExploreCountryChange();
            }
            if (typeof window.handleListCountryChange === 'function') {
                window.handleListCountryChange();
            }
        });

        window.handleInstallClick = async function() {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') { deferredPrompt = null; }
            } else {
                document.getElementById('install-guide-modal').classList.remove('hidden');
            }
        };

        const originalConsoleError = console.error;
        console.error = function(...args) {
            if (args[0] && typeof args[0] === 'string' && args[0].includes('LegacyApiNotActivatedMapError')) {
                setTimeout(() => window.showCustomMsg("⚠️ Google 地圖 API 權限未開通！\n\n主揪請注意：系統偵測到您尚未啟用經典版的「Places API」。\n\n👉 請至 Google Cloud Console 搜尋並啟用「Places API」（注意：請勿選帶有 (New) 字樣的版本）。\n啟用後請等待 3~5 分鐘讓系統同步，即可正常運作！"), 800);
            }
            originalConsoleError.apply(console, args);
        };

        let db, auth, appId, currentUser = null;
        const GAS_API_URL = "https://script.google.com/macros/s/AKfycbwTg7lmireS-npCAzvDZVPVmI7u5jAFpslg7SNL59Ab3ulLOUr7cPB5wzIaTSyTUJpl/exec";
        window.restaurantData = []; window.feedData = []; window.partyData = [];
        window.appConfig = { deleteCode: '850930', appUrl: '', groups: ['主揪', '玉泉', '屏東', '高雄', '台北', '老服', '社發'], creators: ['黃政誥'], membersMap: null }; 
        window.myIdentity = { group: '', name: '' }; 

        let pendingInteraction = null; let itemToDelete = null; let pendingPartyAction = null;
        let isAdminUnlocked = false; let previousTab = 'explore';  
        window.getAdminPassword = function() { return window.appConfig.adminPassword || "Bb19960930"; };

        const FOOD_IMAGES = [
            "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=400&q=80",
            "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=400&q=80",
            "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=400&q=80",
            "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=400&q=80",
            "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80"
        ];
        
        window.getFallbackImage = function(name) {
            if (!name) return FOOD_IMAGES[0];
            let hash = 0;
            for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
            return FOOD_IMAGES[hash % FOOD_IMAGES.length];
        };

        window.getSafeImage = function(url, fallbackName) {
            if (!url || typeof url !== 'string') return window.getFallbackImage(fallbackName);
            return url;
        };

        window.isGoogleMapsPhotoUrl = function(url) {
            if (!url || typeof url !== 'string') return false;
            return /(?:maps\.googleapis\.com\/maps\/api\/place\/photo|googleusercontent\.com|ggpht\.com|lh\d+\.google)/i.test(url);
        };

        window.escapeForBtn = function(str) { return str ? encodeURIComponent(String(str)) : ''; };

        // HTML 特殊字元跳脫防 XSS
        window.escapeHtml = function(str) {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        // 判斷是否為有效 URL
        window.isValidUrl = function(str) {
            if (!str || typeof str !== 'string') return false;
            const s = str.trim();
            if (/^https?:\/\//i.test(s)) return true;
            try {
                const u = new URL(s);
                return u.protocol === 'http:' || u.protocol === 'https:';
            } catch (_) {
                return false;
            }
        };

        // 格式化地點顯示：長 URL 轉為「📍 查看地點 (Google Maps)」，一般文字則保留文字並附帶地圖搜尋連結
        window.formatLocationDisplay = function(locationStr) {
            if (!locationStr) {
                return '<span class="text-gray-400">未指定地點</span>';
            }
            const loc = String(locationStr).trim();
            if (window.isValidUrl(loc)) {
                const targetUrl = loc.startsWith('http') ? loc : `https://${loc}`;
                const isGMap = /maps\.(google|app\.goo\.gl)|goo\.gl\/maps/i.test(loc);
                const labelText = isGMap ? '📍 查看地點 (Google Maps)' : '📍 查看地點連結';
                return `<a href="${window.escapeHtml(targetUrl)}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-700 transition font-bold underline inline-flex items-center gap-1.5 break-anywhere" title="點擊開啟地圖或地點連結"><span>${window.escapeHtml(labelText)}</span> <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i></a>`;
            } else {
                const searchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`;
                return `<a href="${searchUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-700 transition font-bold inline-block break-anywhere" title="點擊導航">${window.escapeHtml(loc)}</a>`;
            }
        };

        // Google Drive 圖片 CDN 網址生成器
        window.getDriveImageUrl = function(fileId) {
            if (!fileId) return '';
            return `https://lh3.googleusercontent.com/d/${fileId}`;
        };

        // 統一解析評價與動態牆圖片來源 (相容舊 URL、Google Drive File ID 與各類網址)
        window.resolveReviewImage = function(val, fallbackName = '') {
            if (!val || typeof val !== 'string') return window.getFallbackImage(fallbackName);
            const str = val.trim();
            if (!str) return window.getFallbackImage(fallbackName);
            
            // 1. 若已經是完整 http/https/data 網址
            if (str.startsWith('http://') || str.startsWith('https://') || str.startsWith('data:')) {
                // 如果是舊式 Google Drive 預覽連結，轉換為高效能 CDN
                const driveMatch = str.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=view&)?id=)([a-zA-Z0-9_-]+)/i);
                if (driveMatch && driveMatch[1]) {
                    return window.getDriveImageUrl(driveMatch[1]);
                }
                return str;
            }
            
            // 2. 若為純 Google Drive File ID (長度約 25~50 的英數混合無斜線字串)
            if (/^[a-zA-Z0-9_-]{20,60}$/.test(str)) {
                return window.getDriveImageUrl(str);
            }
            
            return str;
        };

        // 前端 Canvas 照片縮圖壓縮 (最長邊 1600px, quality 0.8)
        window.compressImageFile = function(file, maxWidth = 1600, maxHeight = 1600, quality = 0.8) {
            return new Promise((resolve, reject) => {
                if (!file || !file.type.startsWith('image/')) {
                    return reject(new Error('請選取有效的圖片檔案'));
                }
                const reader = new FileReader();
                reader.onerror = () => reject(new Error('讀取圖片失敗'));
                reader.onload = (e) => {
                    const img = new Image();
                    img.onerror = () => reject(new Error('載入圖片失敗'));
                    img.onload = () => {
                        let width = img.width;
                        let height = img.height;
                        if (width > maxWidth || height > maxHeight) {
                            if (width / height > maxWidth / maxHeight) {
                                height = Math.round((height * maxWidth) / width);
                                width = maxWidth;
                            } else {
                                width = Math.round((width * maxHeight) / height);
                                height = maxHeight;
                            }
                        }
                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);
                        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
                        resolve(compressedDataUrl);
                    };
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
            });
        };

        // 上傳照片至 Google Drive 後端
        window.uploadImageToDrive = function(base64Data, filename = 'review_photo.jpg') {
            return new Promise((resolve, reject) => {
                if (!base64Data || typeof base64Data !== 'string') {
                    return resolve({ status: 'skip', imageUrl: '' });
                }
                // 若已經是外部完整網址則不需重傳
                if (base64Data.startsWith('http://') || base64Data.startsWith('https://')) {
                    return resolve({ status: 'success', imageUrl: base64Data, fileId: '' });
                }

                let mimeType = 'image/jpeg';
                if (base64Data.startsWith('data:image/png')) mimeType = 'image/png';
                else if (base64Data.startsWith('data:image/webp')) mimeType = 'image/webp';

                // 優先使用 Google Apps Script 原生 google.script.run
                if (typeof google !== 'undefined' && google.script && google.script.run && typeof google.script.run.uploadReviewPhoto === 'function') {
                    google.script.run
                        .withSuccessHandler((res) => {
                            if (res && res.status === 'success') {
                                resolve(res);
                            } else {
                                reject(new Error(res?.message || 'Google Drive 上傳失敗'));
                            }
                        })
                        .withFailureHandler((err) => {
                            reject(err);
                        })
                        .uploadReviewPhoto(base64Data, mimeType, filename);
                    return;
                }

                // 若在非 iframe 獨立網頁環境，透過 POST API 至 GAS 後端
                if (GAS_API_URL) {
                    fetch(GAS_API_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify({
                            action: 'upload_photo',
                            base64Data: base64Data,
                            mimeType: mimeType,
                            fileName: filename
                        })
                    })
                    .then(res => res.json())
                    .then(data => {
                        if (data && data.status === 'success') {
                            resolve(data);
                        } else {
                            reject(new Error(data?.message || '伺服器上傳失敗'));
                        }
                    })
                    .catch(err => {
                        reject(err);
                    });
                    return;
                }

                // 本機離線備用
                resolve({ status: 'local', imageUrl: base64Data, fileId: '' });
            });
        };

        window.setPhotoUploaderValue = function(prefix, url) {
            const hiddenInput = document.getElementById(prefix === 'edit-res' ? 'edit-res-photo' : (prefix === 'int-photo' ? 'int-photo-url' : (prefix === 'party-recap' ? 'party-recap-photo' : 'input-photo')));
            const imgEl = document.getElementById(prefix === 'edit-res' ? 'edit-res-photo-img' : (prefix === 'int-photo' ? 'int-photo-img' : (prefix === 'party-recap' ? 'party-recap-img' : 'admin-add-img')));
            const placeholderEl = document.getElementById(prefix === 'edit-res' ? 'edit-res-photo-placeholder' : (prefix === 'int-photo' ? 'int-photo-placeholder' : (prefix === 'party-recap' ? 'party-recap-placeholder' : null)));
            const actionsEl = document.getElementById(prefix === 'edit-res' ? 'edit-res-photo-actions' : (prefix === 'int-photo' ? 'int-photo-actions' : (prefix === 'party-recap' ? 'party-recap-actions' : null)));
            const thumbEl = document.getElementById('admin-add-photo-thumb');
            const urlInputEl = document.getElementById(prefix === 'edit-res' ? 'edit-res-photo-url-input' : (prefix === 'int-photo' ? 'int-photo-url-input' : (prefix === 'party-recap' ? 'party-recap-photo-url-input' : 'admin-add-url-input')));

            if (hiddenInput) hiddenInput.value = url || '';
            if (urlInputEl && (!url || url.startsWith('http'))) urlInputEl.value = url || '';

            if (url) {
                if (imgEl) { imgEl.src = window.resolveReviewImage(url); imgEl.classList.remove('hidden'); }
                if (placeholderEl) placeholderEl.classList.add('hidden');
                if (actionsEl) actionsEl.classList.remove('hidden');
                if (thumbEl) thumbEl.classList.remove('hidden');
            } else {
                if (imgEl) { imgEl.src = ''; imgEl.classList.add('hidden'); }
                if (placeholderEl) placeholderEl.classList.remove('hidden');
                if (actionsEl) actionsEl.classList.add('hidden');
                if (thumbEl) thumbEl.classList.add('hidden');
            }
        };

        window.clearPhoto = function(prefix) {
            window.setPhotoUploaderValue(prefix, '');
            const fileInput = document.getElementById(prefix === 'edit-res' ? 'edit-res-file' : (prefix === 'int-photo' ? 'int-photo-file' : (prefix === 'party-recap' ? 'party-recap-file' : 'input-photo-file')));
            if (fileInput) fileInput.value = '';
        };

        window.handlePhotoSelected = async function(input, prefix) {
            if (!input.files || input.files.length === 0) return;
            const file = input.files[0];
            try {
                window.showCustomMsg("📸 正在為您優化與壓縮照片中...");
                const compressedDataUrl = await window.compressImageFile(file, 1600, 1600, 0.8);
                window.closeModal('custom-alert-modal');
                window.setPhotoUploaderValue(prefix, compressedDataUrl);
            } catch (err) {
                console.error("圖片壓縮失敗:", err);
                window.showCustomMsg("⚠️ 圖片處理失敗，請改用其他照片。");
            }
        };

        window.handlePhotoUrlInput = function(prefix, val) {
            const trimmed = (val || '').trim();
            window.setPhotoUploaderValue(prefix, trimmed);
        };

        window.handleDropdownSync = function(element, type) {
            if (!element) return;
            if (type !== 'group' && type !== 'creator') return;
            const prefix = element.id.split('-')[0];
            const groupEl = document.getElementById(prefix + '-group');
            const creatorEl = document.getElementById(prefix + '-creator');
            if(!creatorEl || !groupEl || !window.appConfig.membersMap) return;
            
            const selectedGroup = groupEl.value;
            let allowedCreators = window.appConfig.membersMap[selectedGroup] || [];
            
            if (selectedGroup === '主揪') { allowedCreators = ['黃政誥']; } 
            else { allowedCreators = allowedCreators.filter(c => c !== '黃政誥'); }
            
            if (allowedCreators.length === 0) allowedCreators = ['(無成員)'];

            const oldCreator = creatorEl.value;
            creatorEl.innerHTML = allowedCreators.map(c => `<option value="${c}">${c}</option>`).join('');
            
            if (allowedCreators.includes(oldCreator)) creatorEl.value = oldCreator;
            else creatorEl.selectedIndex = 0;
        };

        function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
            if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
            const R = 6371; const dLat = (lat2-lat1)*(Math.PI/180); const dLon = (lon2-lon1)*(Math.PI/180); 
            const a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*(Math.PI/180))*Math.cos(lat2*(Math.PI/180))*Math.sin(dLon/2)*Math.sin(dLon/2); 
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
        }

        window.enterApp = function() {
            const intro = document.getElementById('intro-screen');
            intro.classList.add('intro-exit');
            setTimeout(() => {
                intro.classList.add('hidden');
                document.getElementById('main-app').classList.remove('hidden');
            }, 800);
        };

        window.closeModal = function(id) { document.getElementById(id).classList.add('hidden'); }
        window.showCustomMsg = function(msg) { 
            document.getElementById('custom-alert-message').textContent = msg;
            document.getElementById('custom-alert-modal').classList.remove('hidden');
        };

        let currentPromptCallback = null;
        window.showCustomPrompt = function(title, placeholder, callback) {
            document.getElementById('custom-prompt-title').textContent = title;
            const input = document.getElementById('custom-prompt-input');
            input.placeholder = placeholder; input.value = '';
            currentPromptCallback = callback;
            document.getElementById('custom-prompt-modal').classList.remove('hidden');
            setTimeout(() => input.focus(), 100);

            document.getElementById('custom-prompt-confirm').onclick = function() {
                const val = input.value.trim();
                window.closeModal('custom-prompt-modal');
                if (currentPromptCallback) currentPromptCallback(val);
            };
        };

        async function initFirebase() {
            try {
                const firebaseConfig = {
                    apiKey: "AIzaSyAR3myWMfP8-qsink6r3zn_88yZ1aZPrb4",
                    authDomain: "letseat-366e9.firebaseapp.com",
                    projectId: "letseat-366e9",
                    storageBucket: "letseat-366e9.firebasestorage.app",
                    messagingSenderId: "537413671646",
                    appId: "1:537413671646:web:a82209f52d79e736ac404f",
                    measurementId: "G-F5TCS4WMNG"
                };
                appId = firebaseConfig.projectId; 
                const app = initializeApp(firebaseConfig); auth = getAuth(app); db = getFirestore(app);
                await signInAnonymously(auth); 
                onAuthStateChanged(auth, (user) => { currentUser = user; if (user) startRealtimeSync(); });
            } catch (err) { 
                if (err.code === 'auth/configuration-not-found' || err.code === 'auth/operation-not-allowed') {
                    window.showCustomMsg("⚠️ 資料庫連線失敗！\n\n主揪請注意：您尚未在 Firebase 開啟「匿名登入」權限。\n\n請到 Firebase 控制台 -> 點擊 Authentication (驗證) -> Sign-in method (登入方式) -> 啟用「匿名 (Anonymous)」，然後重新整理網頁！");
                } else { window.showCustomMsg("⚠️ 系統連線發生異常，目前將暫時切換為展示模式。"); }
                setupMockData(); 
            }
        }
        initFirebase();

        window.saveConfigToCloud = async function() {
            if (db && currentUser) {
                const payload = {
                    adminPassword: window.appConfig.adminPassword || 'Bb19960930',
                    deleteCode: window.appConfig.deleteCode || '850930',
                    appUrl: window.appConfig.appUrl || '',
                    groups: window.appConfig.groups || ['主揪'],
                    creators: window.appConfig.creators || ['黃政誥'],
                    membersMap: window.appConfig.membersMap || { '主揪': ['黃政誥'] }
                };
                if (window.appConfig.id) {
                    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'config', window.appConfig.id), payload);
                } else {
                    const res = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'config'), payload);
                    window.appConfig.id = res.id;
                }
            }
        };

        function startRealtimeSync() {
            if (!currentUser) return;
            
            const handleSyncError = (err) => {
                console.error("即時同步錯誤:", err);
                if(err.code === 'permission-denied') {
                    window.showCustomMsg("⚠️ 資料庫讀取權限被拒！\n系統連線已中斷，請確認 Firebase 規則開放後，重新整理網頁。");
                }
            };

            getDoc(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'settings', 'auth')).then(docSnap => {
                if (docSnap.exists() && docSnap.data().unlocked) { isAdminUnlocked = true; }
            }).catch(e => {});

            getDoc(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'settings', 'profile')).then(docSnap => {
                if (docSnap.exists() && docSnap.data().name) { window.myIdentity = docSnap.data(); }
            }).catch(e => {});

            onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'restaurants'), (snap) => { 
                window.restaurantData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); 
                document.getElementById('db-count').textContent = window.restaurantData.length; 
                if (!document.getElementById('view-list').classList.contains('hidden')) window.renderList(); 
            }, handleSyncError);
            
            onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'config'), async (snap) => { 
                if(!snap.empty) { 
                    let conf = snap.docs[0].data(); 
                    window.appConfig = { 
                        id: snap.docs[0].id, 
                        deleteCode: conf.deleteCode || '850930', 
                        appUrl: conf.appUrl || '', 
                        groups: conf.groups || ['主揪', '玉泉', '屏東', '高雄', '台北', '老服', '社發'], 
                        creators: conf.creators || ['黃政誥'], 
                        membersMap: conf.membersMap || { '主揪': ['黃政誥'] } 
                    }; 
                } else { 
                    try {
                        const newDoc = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'config'), window.appConfig); 
                        window.appConfig.id = newDoc.id;
                    } catch(e) {}
                } 
                updateConfigDropdowns(); 
            }, handleSyncError);
            
            onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'feed'), (snap) => { 
                window.feedData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); 
                if (!document.getElementById('view-feed').classList.contains('hidden')) window.renderFeed(); 
            }, handleSyncError);
            
            onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'parties'), (snap) => { 
                window.partyData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); 
                if (!document.getElementById('view-party').classList.contains('hidden')) window.renderParties(); 
            }, handleSyncError);
        }

        function updateConfigDropdowns() {
            let safeGroups = Array.isArray(window.appConfig.groups) && window.appConfig.groups.length > 0 ? window.appConfig.groups : ['未分類'];
            window.appConfig.groups = safeGroups;

            if (!window.appConfig.membersMap) {
                window.appConfig.membersMap = {};
                const mapped = new Set();
                
                [...(window.feedData||[]), ...(window.restaurantData||[])].forEach(item => {
                    if (item.group && item.creator) {
                        if (!window.appConfig.membersMap[item.group]) window.appConfig.membersMap[item.group] = [];
                        if (!window.appConfig.membersMap[item.group].includes(item.creator)) {
                            window.appConfig.membersMap[item.group].push(item.creator);
                            mapped.add(item.creator);
                        }
                    }
                });

                const unmapped = (window.appConfig.creators||[]).filter(c => !mapped.has(c));
                if (unmapped.length > 0) {
                    const fallbackGroup = safeGroups[0];
                    if (!window.appConfig.membersMap[fallbackGroup]) window.appConfig.membersMap[fallbackGroup] = [];
                    unmapped.forEach(c => {
                        if (!window.appConfig.membersMap[fallbackGroup].includes(c)) window.appConfig.membersMap[fallbackGroup].push(c);
                    });
                }
            }

            if (!window.appConfig.membersMap['主揪']) window.appConfig.membersMap['主揪'] = [];
            if (!window.appConfig.membersMap['主揪'].includes('黃政誥')) window.appConfig.membersMap['主揪'].push('黃政誥');

            const gHtml = safeGroups.map(g => `<option value="${g}">${g}</option>`).join('');
            
            ['id-group', 'admin-group', 'input-group'].forEach(id => { 
                const el = document.getElementById(id); 
                if(el) {
                    const oldVal = el.value;
                    el.innerHTML = gHtml;
                    if (oldVal && safeGroups.includes(oldVal)) el.value = oldVal;
                }
            });

            ['id', 'admin', 'input'].forEach(prefix => {
                const groupEl = document.getElementById(prefix + '-group');
                if (groupEl) window.handleDropdownSync(groupEl, 'group');
            });

            const allCreatorsSet = new Set();
            Object.values(window.appConfig.membersMap).forEach(list => list.forEach(c => allCreatorsSet.add(c)));
            const allCreators = Array.from(allCreatorsSet);
            const cHtml = allCreators.length > 0 ? allCreators.map(c => `<option value="${c}">${c}</option>`).join('') : '<option value="(無成員)">(無成員)</option>';
            ['new-id-inviter'].forEach(id => { 
                const el = document.getElementById(id); if(el) el.innerHTML = cHtml; 
            });

            if(document.getElementById('system-url')) document.getElementById('system-url').value = window.appConfig.appUrl || '';
        }

        window.switchTab = function(tabName, forceRefresh = false) {
            if (!forceRefresh && document.getElementById('tab-' + tabName) && document.getElementById('tab-' + tabName).classList.contains('active')) return;
            ['explore', 'nearby', 'random', 'party', 'feed', 'list', 'admin', 'guide'].forEach(name => { document.getElementById('view-' + name)?.classList.add('hidden'); if(document.getElementById('tab-' + name)) document.getElementById('tab-' + name).classList.remove('active'); });
            document.getElementById('view-' + tabName)?.classList.remove('hidden'); if(document.getElementById('tab-' + tabName)) document.getElementById('tab-' + tabName).classList.add('active');
            if(tabName !== 'admin' && tabName !== 'guide') previousTab = tabName;
            if(tabName === 'list') window.renderList(); if(tabName === 'feed') window.renderFeed(); if(tabName === 'party') window.renderParties();
            if(tabName === 'admin') window.renderAdminDataList();
        };

        window.switchAdminSubTab = function(tab) {
            const btnRes = document.getElementById('admin-subtab-res');
            const btnFeed = document.getElementById('admin-subtab-feed');
            const listRes = document.getElementById('admin-data-list-restaurants');
            const listFeed = document.getElementById('admin-data-list-feed');

            if (tab === 'restaurants') {
                btnRes.className = "px-3 py-1.5 rounded-xl text-xs font-bold bg-orange-500 text-white shadow-sm transition";
                btnFeed.className = "px-3 py-1.5 rounded-xl text-xs font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 transition";
                listRes.classList.remove('hidden');
                listFeed.classList.add('hidden');
            } else {
                btnFeed.className = "px-3 py-1.5 rounded-xl text-xs font-bold bg-orange-500 text-white shadow-sm transition";
                btnRes.className = "px-3 py-1.5 rounded-xl text-xs font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 transition";
                listFeed.classList.remove('hidden');
                listRes.classList.add('hidden');
            }
        };

        window.renderAdminDataList = function() {
            const resCountEl = document.getElementById('admin-res-count');
            const feedCountEl = document.getElementById('admin-feed-count');
            const listRes = document.getElementById('admin-data-list-restaurants');
            const listFeed = document.getElementById('admin-data-list-feed');

            if (resCountEl) resCountEl.textContent = window.restaurantData.length;
            if (feedCountEl) feedCountEl.textContent = window.feedData.length;

            if (listRes) {
                if (window.restaurantData.length === 0) {
                    listRes.innerHTML = `<div class="text-center text-gray-400 py-6 text-xs font-medium">尚無口袋店家紀錄</div>`;
                } else {
                    listRes.innerHTML = window.restaurantData.map(r => {
                        const safeName = window.escapeForBtn(r.name);
                        return `
                        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border border-gray-100 hover:border-orange-200 transition">
                            <div class="flex items-center gap-3 overflow-hidden">
                                <div class="w-8 h-8 rounded-xl bg-orange-100 text-orange-500 flex items-center justify-center font-bold text-xs shrink-0">${(r.city||'全').substring(0,2)}</div>
                                <div class="truncate">
                                    <h4 class="text-xs font-bold text-gray-800 truncate">${r.name}</h4>
                                    <p class="text-[10px] text-gray-400 truncate">${r.group || '一般'} • ${r.creator || '主揪'} | ⭐ ${r.rating || '無'}</p>
                                </div>
                            </div>
                            <div class="flex items-center gap-1.5 shrink-0 ml-2">
                                <button onclick="window.editRestaurant('${safeName}')" class="px-2.5 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-bold transition flex items-center gap-1"><i class="fa-solid fa-pen text-[10px]"></i> 編輯</button>
                                <button onclick="window.confirmDelete('${safeName}')" class="px-2.5 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-xs font-bold transition flex items-center gap-1"><i class="fa-solid fa-trash text-[10px]"></i> 刪除</button>
                            </div>
                        </div>`;
                    }).join('');
                }
            }

            if (listFeed) {
                if (window.feedData.length === 0) {
                    listFeed.innerHTML = `<div class="text-center text-gray-400 py-6 text-xs font-medium">尚無動態評價紀錄</div>`;
                } else {
                    listFeed.innerHTML = window.feedData.map(f => {
                        const safeId = window.escapeForBtn(f.id || '');
                        const isLike = f.rating === 'like' || f.rating === '推' || f.rating === '超推' || f.rating === 1;
                        return `
                        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border border-gray-100 hover:border-orange-200 transition">
                            <div class="flex items-center gap-3 overflow-hidden">
                                <div class="w-8 h-8 rounded-xl ${isLike ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'} flex items-center justify-center font-bold text-xs shrink-0"><i class="fa-solid ${isLike ? 'fa-thumbs-up' : 'fa-thumbs-down'}"></i></div>
                                <div class="truncate">
                                    <h4 class="text-xs font-bold text-gray-800 truncate">${f.restaurantName || '好店評價'}</h4>
                                    <p class="text-[10px] text-gray-400 truncate">${f.creator || '好友'} (${f.group || '社群'})：${f.content || '無評語'}</p>
                                </div>
                            </div>
                            <button onclick="window.deleteFeedItemInAdmin('${safeId}')" class="px-2.5 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-xs font-bold transition flex items-center gap-1 shrink-0 ml-2"><i class="fa-solid fa-trash text-[10px]"></i> 刪除</button>
                        </div>`;
                    }).join('');
                }
            }
        };

        window.deleteFeedItemInAdmin = async function(feedId) {
            if (!feedId) return;
            try { feedId = decodeURIComponent(feedId); } catch(e) {}
            try {
                if (db && currentUser) {
                    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'feed', feedId));
                }
                window.feedData = window.feedData.filter(f => f.id !== feedId && window.escapeForBtn(f.id || '') !== feedId);
                window.renderAdminDataList();
                window.renderFeed();
                window.showCustomMsg("🗑️ 已成功刪除該筆評價動態。");
            } catch (e) {
                console.error(e);
                window.showCustomMsg("刪除失敗，請檢查網路。");
            }
        };

        window.attemptAdminAccess = function() {
            if (isAdminUnlocked) { 
                window.switchTab('admin'); 
            } else { 
                document.getElementById('password-modal')?.classList.remove('hidden'); 
                document.getElementById('admin-password')?.focus(); 
            }
        };
        
        window.verifyPassword = function() {
            if (document.getElementById('admin-password').value === window.getAdminPassword()) { 
                document.getElementById('password-error').classList.add('hidden'); 
                window.closeModal('password-modal'); 
                document.getElementById('admin-password').value = ''; 
                isAdminUnlocked = true; 
                
                if (db && currentUser) {
                    setDoc(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'settings', 'auth'), { unlocked: true }, { merge: true }).catch(e=>{});
                }

                if(pendingInteraction) openInteractionModal(); 
                else if(pendingPartyAction) pendingPartyAction(); 
                else window.switchTab('admin'); 
            } else { 
                document.getElementById('password-error').classList.remove('hidden'); 
            }
        };
        
        window.openQuizModal = function() {
            document.getElementById('quiz-error').classList.add('hidden');
            document.getElementById('quiz-modal').classList.remove('hidden');
        };
        
        window.checkQuizAnswer = function(ans, btn) {
            if (ans === '官田') {
                document.getElementById('quiz-error').classList.add('hidden');
                btn.classList.remove('bg-white', 'text-gray-600', 'border-gray-200');
                btn.classList.add('bg-emerald-500', 'text-white', 'border-emerald-500');
                window.closeModal('quiz-modal');
                window.showCustomMsg('🎉 破關成功！\n\n系統已自動為您輸入邀請碼，即將開啟大門！');
                document.getElementById('admin-password').value = APP_PASSWORD;
                
                setTimeout(() => {
                    window.verifyPassword();
                    window.closeModal('custom-alert-modal');
                    btn.classList.remove('bg-emerald-500', 'text-white', 'border-emerald-500');
                    btn.classList.add('bg-white', 'text-gray-600', 'border-gray-200');
                }, 2000);
            } else {
                const err = document.getElementById('quiz-error');
                err.classList.remove('hidden');
                btn.classList.remove('border-gray-200', 'text-gray-600', 'bg-white');
                btn.classList.add('border-red-400', 'text-white', 'bg-red-500');
                
                setTimeout(() => {
                    btn.classList.add('border-gray-200', 'text-gray-600', 'bg-white');
                    btn.classList.remove('border-red-400', 'text-white', 'bg-red-500');
                }, 600);
            }
        };

        window.lockAdmin = function() { 
            isAdminUnlocked = false; 
            pendingInteraction = null; 
            if(db && currentUser) {
                setDoc(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'settings', 'auth'), { unlocked: false }, { merge: true }).catch(e=>{});
            }
            window.switchTab(previousTab); 
            window.showCustomMsg("後台模式已鎖定。"); 
        };
        
        window.openInviteModal = function() { document.getElementById('invite-modal').classList.remove('hidden'); };
        
        window.shareToLine = function(encodedText) {
            const text = decodeURIComponent(encodedText);
            window.open(`https://line.me/R/msg/text/?${encodeURIComponent(text)}`, '_blank');
        };

        window.shareVIPInvite = function() {
            const url = window.appConfig.appUrl || window.location.href;
            const text = `💌 【一起吃飯吧！】發送了一張 VIP 邀請卡給您！\n\n嗨！我是黃政誥。這是一個專屬的美食探索與揪團神器。\n\n我們最近在用一個超酷的專屬美食社交 App，想邀請你加入我們的吃貨圈，看大家推薦了什麼好料，還能一起參加聚會喔！\n\n👇 點擊下方連結立即開啟大門：\n${url}`;
            window.shareToLine(encodeURIComponent(text));
        };

        window.requireIdentity = function(callback) {
            if (window.myIdentity.name !== '') { callback(); } else { pendingPartyAction = callback; document.getElementById('identity-modal').classList.remove('hidden'); updateConfigDropdowns(); }
        };
        window.openIdentityModal = function() {
            updateConfigDropdowns();
            document.getElementById('identity-modal').classList.remove('hidden');
        };
        window.toggleIdTab = function(mode) {
            const btnOld = document.getElementById('tab-id-old'); const btnNew = document.getElementById('tab-id-new');
            const formOld = document.getElementById('form-id-old'); const formNew = document.getElementById('form-id-new');
            if(mode === 'old') {
                btnOld.classList.add('bg-white', 'shadow-sm', 'text-orange-500'); btnOld.classList.remove('text-gray-500');
                btnNew.classList.remove('bg-white', 'shadow-sm', 'text-orange-500'); btnNew.classList.add('text-gray-500');
                formOld.classList.remove('hidden'); formNew.classList.add('hidden');
            } else {
                btnNew.classList.add('bg-white', 'shadow-sm', 'text-orange-500'); btnNew.classList.remove('text-gray-500');
                btnOld.classList.remove('bg-white', 'shadow-sm', 'text-orange-500'); btnOld.classList.add('text-gray-500');
                formNew.classList.remove('hidden'); formOld.classList.add('hidden');
            }
        };

        window.saveIdentity = async function() {
            let isNew = !document.getElementById('form-id-new').classList.contains('hidden');
            let nName = '', nGroup = '', nInviter = '';
            
            if(!isNew) {
                nGroup = document.getElementById('id-group').value; nName = document.getElementById('id-creator').value;
                if(!nName || nName === '(無成員)') return window.showCustomMsg("請選擇有效的名字喔！");
            } else {
                nName = document.getElementById('new-id-name').value.trim(); nGroup = document.getElementById('new-id-group').value.trim(); nInviter = document.getElementById('new-id-inviter').value;
                if(!nName || !nGroup) return window.showCustomMsg("請填寫你的名字與想建立的群組！");
            }

            if (nName === '黃政誥' && nGroup !== '主揪') {
                document.getElementById('id-group').value = '主揪';
                if(!isNew) window.handleDropdownSync(document.getElementById('id-creator'), 'creator');
                return window.showCustomMsg("⚠️ 「黃政誥」的專屬群組必須是「主揪」喔！");
            }
            if (nGroup === '主揪' && nName !== '黃政誥') {
                document.getElementById('id-creator').value = '黃政誥';
                if(!isNew) window.handleDropdownSync(document.getElementById('id-group'), 'group');
                return window.showCustomMsg("⚠️ 「主揪」是專屬群組，只有黃政誥可以使用喔！");
            }

            const lineId = document.getElementById('id-line-id') ? document.getElementById('id-line-id').value.trim() : '';
            const bio = document.getElementById('id-bio') ? document.getElementById('id-bio').value.trim() : '';

            window.myIdentity = { name: nName, group: nGroup, lineId: lineId, bio: bio };
            
            if(db && currentUser) {
                setDoc(doc(db, 'artifacts', appId, 'users', currentUser.uid, 'settings', 'profile'), window.myIdentity, { merge: true }).catch(e=>{});
            }
            
            if(isNew) {
                if(!window.appConfig.membersMap) window.appConfig.membersMap = { '主揪': ['黃政誥'] };
                if(!Array.isArray(window.appConfig.groups)) window.appConfig.groups = [];
                if(!Array.isArray(window.appConfig.creators)) window.appConfig.creators = [];

                if(!window.appConfig.groups.includes(nGroup)) window.appConfig.groups.push(nGroup);
                if(!window.appConfig.creators.includes(nName)) window.appConfig.creators.push(nName);
                
                if(!window.appConfig.membersMap[nGroup]) window.appConfig.membersMap[nGroup] = [];
                if(!window.appConfig.membersMap[nGroup].includes(nName)) window.appConfig.membersMap[nGroup].push(nName);
                
                try {
                    await window.saveConfigToCloud();
                    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'feed'), { type: 'system_welcome', creator: nName, group: nGroup, inviter: nInviter, timestamp: serverTimestamp() });
                } catch(e) {
                    updateConfigDropdowns(); window.feedData.unshift({ id: Date.now(), type: 'system_welcome', creator: nName, group: nGroup, inviter: nInviter, timestamp: new Date() });
                }
            }
            window.closeModal('identity-modal'); if(pendingPartyAction) { pendingPartyAction(); pendingPartyAction = null; } window.showCustomMsg(`設定完成！系統已記住你的身分：${window.myIdentity.group}的${window.myIdentity.name}。`);
        };

        let calcPeopleCount = 1;
        window.openCalculator = function() { document.getElementById('calc-total').value = ''; document.getElementById('calc-service').checked = false; calcPeopleCount = 1; document.getElementById('calc-people').textContent = calcPeopleCount + ' 人'; document.getElementById('calc-result').textContent = '$0'; document.getElementById('calculator-modal').classList.remove('hidden'); };
        window.adjustCalcPeople = function(delta) { calcPeopleCount += delta; if(calcPeopleCount < 1) calcPeopleCount = 1; document.getElementById('calc-people').textContent = calcPeopleCount + ' 人'; window.runCalculator(); };
        window.runCalculator = function() { let total = parseFloat(document.getElementById('calc-total').value) || 0; if(document.getElementById('calc-service').checked) total *= 1.1; document.getElementById('calc-result').textContent = `$${Math.ceil(total / calcPeopleCount)}`; };
        window.copyCalcResult = function() { let text = `【分帳計算機】\n結帳總額: $${document.getElementById('calc-service').checked ? (parseFloat(document.getElementById('calc-total').value)||0)*1.1 : (parseFloat(document.getElementById('calc-total').value)||0)}\n參加人數: ${calcPeopleCount} 人\n---\n💵 每人應付: ${document.getElementById('calc-result').textContent}`; navigator.clipboard.writeText(text).then(() => { window.showCustomMsg("✅ 已複製分帳結果！可直接貼上 Line 群組。"); }).catch(err => { window.showCustomMsg("複製失敗，請手動輸入。"); }); };

        window.showAdvancedAuth = function() { document.getElementById('advanced-auth-modal').classList.remove('hidden'); document.getElementById('advanced-auth-input').focus(); };
        
        window.verifyAdvancedAuth = function() {
            const input = document.getElementById('advanced-auth-input').value;
            if(input === window.appConfig.deleteCode) {
                document.getElementById('advanced-auth-error').classList.add('hidden'); window.closeModal('advanced-auth-modal'); document.getElementById('advanced-auth-input').value = '';
                document.getElementById('advanced-unlock-section').classList.add('hidden'); document.getElementById('advanced-settings-section').classList.remove('hidden');
                document.querySelectorAll('.advanced-only').forEach(el => el.classList.remove('hidden'));
            } else { document.getElementById('advanced-auth-error').classList.remove('hidden'); }
        };
        
        window.lockAdvanced = function() { 
            document.getElementById('advanced-settings-section').classList.add('hidden'); 
            document.getElementById('advanced-unlock-section').classList.remove('hidden'); 
            document.querySelectorAll('.advanced-only').forEach(el => el.classList.add('hidden')); 
        };

        window.saveSystemSettings = async function() {
            const newAdminPass = document.getElementById('new-admin-pass')?.value;
            const newCode = document.getElementById('new-del-code').value; 
            const newUrl = document.getElementById('system-url').value;
            
            if (newAdminPass) {
                if (newAdminPass.length < 4) return window.showCustomMsg("後台密碼太短了，請設定4碼以上。");
                window.appConfig.adminPassword = newAdminPass;
            }

            let codeToSave = window.appConfig.deleteCode;
            if(newCode && newCode.length >= 4) { codeToSave = newCode; } else if (newCode) { return window.showCustomMsg("新防護碼太短了，請設定4碼以上。"); }
            window.appConfig.deleteCode = codeToSave; window.appConfig.appUrl = newUrl;
            
            try {
                await window.saveConfigToCloud();
                if (document.getElementById('new-admin-pass')) document.getElementById('new-admin-pass').value = '';
                document.getElementById('new-del-code').value = ''; 
                window.showCustomMsg("⚙️ 系統與後台密碼設定已成功更新！"); 
                window.lockAdvanced(); 
            } catch(e) {
                window.showCustomMsg(`設定失敗，請確認網路。\n(錯誤: ${e.message})`);
            }
        };

        window.addNewConfig = function(type) {
            const typeName = type === 'group' ? '群組' : '好友';
            const placeholder = type === 'group' ? '例如：桌遊團、羽球團' : '例如：王小明';
            const currentGroup = document.getElementById('admin-group').value;
            
            window.showCustomPrompt(`請輸入新的${typeName}名稱：`, placeholder, async (newVal) => {
                if (!newVal) return;
                try {
                    if (!window.appConfig.membersMap) window.appConfig.membersMap = { '主揪': ['黃政誥'] };

                    if (type === 'group') {
                        if (newVal === '主揪') return window.showCustomMsg("⚠️ 「主揪」是系統專屬保留群組，無法新增喔！");
                        if (window.appConfig.groups.includes(newVal)) return window.showCustomMsg(`這個群組已經存在囉！`);
                        
                        window.appConfig.groups.push(newVal);
                        window.appConfig.membersMap[newVal] = []; 
                    } else {
                        if (currentGroup === '主揪') return window.showCustomMsg("⚠️ 「主揪」群組不能加入其他人喔！");
                        if (newVal === '黃政誥') return window.showCustomMsg("⚠️ 「黃政誥」已經存在囉！");

                        if (!window.appConfig.membersMap[currentGroup]) window.appConfig.membersMap[currentGroup] = [];
                        if (window.appConfig.membersMap[currentGroup].includes(newVal)) return window.showCustomMsg(`這個好友已經在「${currentGroup}」群組中囉！`);
                        
                        window.appConfig.membersMap[currentGroup].push(newVal);
                        if (!window.appConfig.creators.includes(newVal)) window.appConfig.creators.push(newVal);
                    }

                    await window.saveConfigToCloud();
                    updateConfigDropdowns();
                    window.showCustomMsg(`✅ 成功新增${typeName}：${newVal}`);
                } catch (e) {
                    console.error("Add Error:", e);
                    window.showCustomMsg(`新增失敗，請確認網路連線。\n(錯誤代碼: ${e.message})`);
                }
            });
        };

        window.editConfig = function(type) {
            const typeName = type === 'group' ? '群組' : '好友';
            const selectId = type === 'group' ? 'admin-group' : 'admin-creator';
            const oldVal = document.getElementById(selectId).value;
            const currentGroup = document.getElementById('admin-group').value;

            if (!oldVal || oldVal === '(無成員)') return window.showCustomMsg(`請先選擇要編輯的${typeName}！`);
            if (oldVal === '主揪' || oldVal === '黃政誥') return window.showCustomMsg(`⚠️ 這是最高權限保留字，無法編輯喔！`);

            window.showCustomPrompt(`修改「${oldVal}」的名稱：`, '輸入新名稱', async (newVal) => {
                if (!newVal || newVal === oldVal) return;
                try {
                    if (type === 'group' && newVal === '主揪') return window.showCustomMsg("⚠️ 不能把群組改名為「主揪」喔！");
                    if (type === 'creator' && newVal === '黃政誥') return window.showCustomMsg("⚠️ 不能把好友改名為「黃政誥」喔！");

                    if (!window.appConfig.membersMap) window.appConfig.membersMap = { '主揪': ['黃政誥'] };

                    if (type === 'group') {
                        if (window.appConfig.groups.includes(newVal)) return window.showCustomMsg(`這個群組名稱已經存在囉！`);
                        const idx = window.appConfig.groups.indexOf(oldVal);
                        if (idx > -1) {
                            window.appConfig.groups[idx] = newVal;
                            window.appConfig.membersMap[newVal] = window.appConfig.membersMap[oldVal] || [];
                            delete window.appConfig.membersMap[oldVal];
                        }
                    } else {
                        if (!window.appConfig.membersMap[currentGroup]) window.appConfig.membersMap[currentGroup] = [];
                        let arr = window.appConfig.membersMap[currentGroup];
                        if (arr.includes(newVal)) return window.showCustomMsg(`這個好友名稱已經在此群組囉！`);
                        const idx = arr.indexOf(oldVal);
                        if (idx > -1) arr[idx] = newVal;
                        
                        const cIdx = window.appConfig.creators.indexOf(oldVal);
                        if (cIdx > -1) window.appConfig.creators[cIdx] = newVal;
                    }

                    await window.saveConfigToCloud();
                    updateConfigDropdowns();
                    window.showCustomMsg(`✅ 成功將 ${oldVal} 修改為：${newVal}`);
                } catch (e) {
                    console.error("Edit Error:", e);
                    window.showCustomMsg(`修改失敗，請確認網路連線。\n(錯誤代碼: ${e.message})`);
                }
            });
        };

        window.deleteConfig = function(type) {
            const typeName = type === 'group' ? '群組' : '好友';
            const selectId = type === 'group' ? 'admin-group' : 'admin-creator';
            const valToDelete = document.getElementById(selectId).value;
            const currentGroup = document.getElementById('admin-group').value;

            if (!valToDelete || valToDelete === '(無成員)') return window.showCustomMsg(`請先選擇要刪除的${typeName}！`);
            if (valToDelete === '主揪' || valToDelete === '黃政誥') return window.showCustomMsg(`⚠️ 為了維持系統穩定與您的最高權限，此核心身分無法刪除喔！`);

            if (type === 'group' && window.appConfig.groups.length <= 1) {
                return window.showCustomMsg(`⚠️ 至少要保留一個群組喔！不然系統會壞掉。`);
            }

            window.showCustomPrompt(`確定要刪除「${valToDelete}」嗎？\n(確認請輸入 y )`, '輸入 y', async (ans) => {
                if (ans && ans.toLowerCase() === 'y') {
                    try {
                        if (!window.appConfig.membersMap) window.appConfig.membersMap = { '主揪': ['黃政誥'] };

                        if (type === 'group') {
                            const idx = window.appConfig.groups.indexOf(valToDelete);
                            if (idx > -1) window.appConfig.groups.splice(idx, 1);
                            delete window.appConfig.membersMap[valToDelete];
                        } else {
                            if (window.appConfig.membersMap[currentGroup]) {
                                const idx = window.appConfig.membersMap[currentGroup].indexOf(valToDelete);
                                if (idx > -1) window.appConfig.membersMap[currentGroup].splice(idx, 1);
                            }
                            
                            const cIdx = window.appConfig.creators.indexOf(valToDelete);
                            if (cIdx > -1) window.appConfig.creators.splice(cIdx, 1);
                        }

                        await window.saveConfigToCloud();
                        updateConfigDropdowns();
                        window.showCustomMsg(`🗑️ 已刪除${typeName}：${valToDelete}`);
                    } catch (e) {
                        console.error("Delete Error:", e);
                        window.showCustomMsg(`刪除失敗，請確認網路連線。\n(錯誤代碼: ${e.message})`);
                    }
                }
            });
        };

        window.initCreateParty = function() { 
            document.getElementById('create-party-modal')?.classList.remove('hidden'); 
        };
        
        window.submitParty = async function(e) { 
            e.preventDefault(); 
            const btn = document.getElementById('btn-submit-party'); if (btn) { btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 發布中...'; btn.disabled = true; }
            const optionsInput = document.getElementById('party-options');
            const optionsArray = optionsInput ? optionsInput.value.split(',').map(s => s.trim()).filter(s => s) : [];
            if(optionsArray.length === 0) { if (btn) { btn.innerHTML = '正式發布邀請'; btn.disabled = false; } return window.showCustomMsg("至少要提供一個選項喔！"); } 
            
            window.requireIdentity(async () => {
                const newParty = { 
                    title: document.getElementById('party-title')?.value || '', 
                    date: document.getElementById('party-date')?.value || '', 
                    time: document.getElementById('party-time')?.value || '', 
                    location: document.getElementById('party-location')?.value || '', 
                    group: window.myIdentity.group, 
                    options: optionsArray, 
                    costMode: document.getElementById('party-cost-mode')?.value || 'split', 
                    amount: parseFloat(document.getElementById('party-cost-amount')?.value) || 0, 
                    creator: window.myIdentity.name, 
                    joined: [window.myIdentity.name], 
                    votes: {} 
                }; 
                try { 
                    if (db && currentUser) { await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'parties'), { ...newParty, timestamp: serverTimestamp() }); } 
                    else { window.partyData.unshift({ id: Date.now().toString(), ...newParty }); window.renderParties(); } 
                    window.closeModal('create-party-modal'); document.getElementById('create-party-modal')?.querySelector('form')?.reset(); 
                    window.showCustomMsg('✨ 聚會邀請已發布！快去發 Line 叫大家投票！'); 
                } catch (err) { window.showCustomMsg('發布失敗。'); } finally { if (btn) { btn.innerHTML = '正式發布邀請'; btn.disabled = false; } } 
            });
        };
        
        window.renderParties = function() {
            const container = document.getElementById('party-container'); if (window.partyData.length === 0) return container.innerHTML = '<div class="text-center text-gray-400 py-10 col-span-full"><i class="fa-solid fa-face-grin-beam-sweat text-5xl mb-4 opacity-30"></i><p class="text-sm">目前還沒有人發起聚會喔！</p></div>';
            container.innerHTML = [...window.partyData].sort((a,b) => new Date(a.date) - new Date(b.date)).map(p => {
                const isJoined = p.joined && p.joined.includes(window.myIdentity.name); const joinCount = p.joined ? p.joined.length : 0;
                let costStr = ''; if(p.costMode === 'split') { const perPerson = joinCount > 0 ? Math.ceil(p.amount / joinCount) : p.amount; costStr = `總額 $${p.amount} · <span class="text-orange-600 font-bold">每人約 $${perPerson}</span>`; } else { costStr = `每人固定 <span class="text-orange-600 font-bold">$${p.amount}</span> · 已收 $${p.amount * joinCount}`; }
                let totalVotes = 0; const voteCounts = {}; p.options.forEach(opt => voteCounts[opt] = 0); if(p.votes) { Object.values(p.votes).forEach(opt => { if(voteCounts[opt] !== undefined) { voteCounts[opt]++; totalVotes++; } }); }
                const optionsHtml = p.options.map(opt => { const count = voteCounts[opt]; const percent = totalVotes > 0 ? (count / totalVotes) * 100 : 0; const isMyVote = (p.votes && p.votes[window.myIdentity.name] === opt); return `<button onclick="window.voteParty('${p.id}', decodeURIComponent('${window.escapeForBtn(opt)}'))" class="w-full relative overflow-hidden border ${isMyVote ? "border-orange-400 text-orange-600 bg-orange-50 shadow-inner" : "border-gray-200 text-gray-600 hover:border-orange-200 bg-white"} rounded-xl py-2.5 px-4 text-left transition text-sm flex justify-between items-center group mb-2"><div class="vote-bar" style="width: ${percent}%"></div><span class="relative z-10 font-bold ${isMyVote ? 'text-orange-600' : ''}">${isMyVote ? '<i class="fa-solid fa-circle-check mr-1.5"></i>' : ''}${opt}</span><span class="relative z-10 text-xs font-bold ${isMyVote ? 'text-orange-500' : 'text-gray-400 group-hover:text-orange-400'}">${count} 票</span></button>`; }).join('');
                const appUrl = window.appConfig.appUrl || window.location.href;
                const lineText = `🔥 【揪團通知】${p.title}\n📅 時間: ${p.date} ${p.time}\n📍 地點: ${p.location}\n---\n👇 趕快開啟「一起吃飯吧！」投票＋報名：\n${appUrl}`;
                return `
                <div class="restaurant-card soft-card bg-white rounded-[24px] border ${p.creator === '黃政誥' ? 'border-orange-200 host-highlight' : 'border-gray-100'} p-5 relative overflow-hidden h-full flex flex-col transition">
                    ${p.creator === '黃政誥' ? '<div class="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-orange-200 to-transparent rounded-bl-full opacity-30"></div><span class="absolute top-3 right-3 bg-orange-500 text-white text-[9px] px-2 py-0.5 rounded shadow-sm font-bold tracking-widest"><i class="fa-solid fa-crown mr-1"></i>主揪邀請</span>' : `<span class="absolute top-3 right-3 bg-gray-100 text-gray-500 text-[9px] px-2 py-0.5 rounded shadow-sm font-bold tracking-widest">${p.group} 團</span>`}
                    <h3 class="text-xl font-bold text-gray-800 mb-2 pr-20 leading-tight">${p.title}</h3><div class="space-y-1.5 mb-5 text-sm font-medium text-gray-600"><p class="flex items-center"><i class="fa-regular fa-calendar text-orange-400 w-5 text-center mr-1"></i> ${p.date} (${p.time})</p>
                    <div class="flex items-center gap-1.5 min-w-0" style="overflow-wrap: anywhere; word-break: break-word; max-width: 100%;"><i class="fa-solid fa-location-dot text-orange-400 w-5 text-center shrink-0"></i> <div class="min-w-0 flex-1 break-anywhere">${window.formatLocationDisplay(p.location)}</div></div></div>
                    <div class="bg-gray-50 p-4 rounded-2xl border border-gray-100 mb-4 flex-1"><div class="flex justify-between items-center mb-3"><p class="text-xs font-bold text-gray-500"><i class="fa-solid fa-check-to-slot mr-1 text-blue-500"></i>大家想做什麼？ (點擊投票)</p><span class="text-[10px] text-gray-400 bg-white px-2 py-0.5 border border-gray-200 rounded-full">總共 ${totalVotes} 票</span></div>${optionsHtml}</div>
                    <div class="flex flex-col gap-2 mt-auto pt-4 border-t border-gray-100">
                        <div class="flex items-center justify-between gap-2">
                            <button onclick="window.shareToLine('${window.escapeForBtn(lineText)}')" class="w-10 h-10 bg-[#00B900] text-white rounded-xl flex items-center justify-center hover:bg-[#009900] transition shadow-sm flex-shrink-0" title="LINE 分享邀請"><i class="fa-brands fa-line text-2xl"></i></button>
                            <div class="flex-1 px-2 border-l border-gray-100"><p class="text-[10px] font-bold text-gray-400 mb-0.5"><i class="fa-solid fa-users mr-1"></i>已參加 (${joinCount})</p><p class="text-xs font-bold text-gray-700 line-clamp-1 leading-relaxed">${joinCount > 0 ? p.joined.join('、') : '還沒有人報名喔'}</p></div>
                            <button onclick="window.toggleJoinParty('${p.id}')" class="px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition whitespace-nowrap flex-shrink-0 ${isJoined ? 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-red-50 hover:text-red-500' : 'bg-orange-500 text-white hover:bg-orange-600'}">${isJoined ? '取消參加' : '算我一個！'}</button>
                        </div>
                        <button onclick="window.openPartyRecapModal('${p.id}')" class="w-full bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold py-2 px-3 rounded-xl text-xs border border-amber-200 transition flex items-center justify-center gap-1.5 shadow-xs" title="聚會結束時貼出側拍花絮讓全站朋友看">
                            <i class="fa-solid fa-camera-retro"></i>
                            <span>📸 聚會結束紀錄 / 分享現場照片至動態牆</span>
                        </button>
                    </div>
                </div>`;
            }).join('');
        };
        window.toggleJoinParty = function(pid) { window.requireIdentity(async () => { const party = window.partyData.find(p => p.id === pid); if(!party) return; let newJoined = party.joined || []; if(newJoined.includes(window.myIdentity.name)) { newJoined = newJoined.filter(n => n !== window.myIdentity.name); } else { newJoined.push(window.myIdentity.name); } if (db && currentUser) { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'parties', pid), { joined: newJoined }); } else { party.joined = newJoined; window.renderParties(); } }); };
        window.voteParty = function(pid, option) { window.requireIdentity(async () => { const party = window.partyData.find(p => p.id === pid); if(!party) return; if(!party.joined || !party.joined.includes(window.myIdentity.name)) { return window.showCustomMsg("要先點擊「算我一個」報名才能投票喔！"); } let newVotes = party.votes || {}; newVotes[window.myIdentity.name] = option; if (db && currentUser) { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'parties', pid), { votes: newVotes }); } else { party.votes = newVotes; window.renderParties(); } }); };

        function useFallback(vT, lat, lng) {
            setTimeout(() => { 
                handleGoogleResults([{ name: "詹記麻辣火鍋 (展示資料)", rating: 4.7, price_level: 2, user_ratings_total: 9801, formatted_address: "台北市大安區", opening_hours: { isOpen: () => true }, geometry: { location: { lat:()=>25.025, lng:()=>121.550 } }, fakePhoto: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400&q=80" }], vT, lat, lng); 
            }, 1000);
        }

        const CITIES_BY_COUNTRY = {
            '台灣': ['不限縣市', '台北市', '新北市', '基隆市', '桃園市', '新竹縣', '新竹市', '苗栗縣', '台中市', '彰化縣', '南投縣', '雲林縣', '嘉義縣', '嘉義市', '台南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣', '台東縣', '澎湖縣', '金門縣', '連江縣'],
            '日本': ['不限都道府縣', '東京都', '大阪府', '京都府', '北海道', '沖繩縣', '福岡縣', '愛知縣', '神奈川縣', '埼玉縣', '千葉縣', '兵庫縣', '廣島縣', '宮城縣', '熊本縣', '靜岡縣', '長野縣', '岐阜縣', '三重縣', '滋賀縣', '奈良縣', '和歌山縣', '岡山縣', '山口縣', '香川縣', '愛媛縣', '高知縣', '德島縣', '大分縣', '宮崎縣', '鹿兒島縣', '佐賀縣', '長崎縣', '青森縣', '岩手縣', '秋田縣', '山形縣', '福島縣', '茨城縣', '栃木縣', '群馬縣', '新潟縣', '富山縣', '石川縣', '福井縣', '山梨縣', '鳥取縣', '島根縣'],
            '韓國': ['不限地區', '首爾特別市', '釜山廣域市', '仁川廣域市', '大邱廣域市', '濟州特別自治道'],
            '美國': ['不限地區', '紐約', '洛杉磯', '舊金山', '西雅圖', '芝加哥', '拉斯維加斯', '夏威夷']
        };

        window.handleExploreCountryChange = function() {
            const countryEl = document.getElementById('explore-country');
            const cityEl = document.getElementById('explore-city');
            if (!countryEl || !cityEl) return;
            const country = countryEl.value;
            let list = [];
            if (country === 'all') {
                list = ['不限縣市', ...CITIES_BY_COUNTRY['台灣'].slice(1), ...CITIES_BY_COUNTRY['日本'].slice(1)];
            } else {
                list = CITIES_BY_COUNTRY[country] || ['不限縣市'];
            }
            cityEl.innerHTML = list.map(c => `<option value="${c.startsWith('不限') ? 'all' : c}">${c}</option>`).join('');
        };

        window.handleListCountryChange = function() {
            const countryEl = document.getElementById('list-country');
            const cityEl = document.getElementById('list-city');
            if (!countryEl || !cityEl) return;
            const country = countryEl.value;
            let list = [];
            if (country === 'all') {
                list = ['不限縣市', ...CITIES_BY_COUNTRY['台灣'].slice(1), ...CITIES_BY_COUNTRY['日本'].slice(1)];
            } else {
                list = CITIES_BY_COUNTRY[country] || ['不限縣市'];
            }
            cityEl.innerHTML = list.map(c => `<option value="${c.startsWith('不限') ? 'all' : c}">${c}</option>`).join('');
            if (typeof window.renderList === 'function') window.renderList();
        };

        window.getCountryFromCity = function(city) {
            if (!city || city === '未分類' || city === 'all') return '';
            if (CITIES_BY_COUNTRY['台灣'].includes(city)) return '台灣';
            if (CITIES_BY_COUNTRY['日本'].includes(city)) return '日本';
            if (CITIES_BY_COUNTRY['韓國'].includes(city)) return '韓國';
            if (CITIES_BY_COUNTRY['美國'].includes(city)) return '美國';
            return '';
        };

        window.searchGooglePlaces = function(vT) { 
            let k = ""; let cId = "";
            if (!window.getSearchPriceRange(vT)) return;
            if (vT === 'explore') {
                const rawK = document.getElementById('explore-keyword').value.trim();
                const countryVal = document.getElementById('explore-country')?.value || 'all';
                const cityVal = document.getElementById('explore-city')?.value || 'all';
                
                let locationParts = [];
                if (countryVal !== 'all') locationParts.push(countryVal);
                if (cityVal !== 'all') locationParts.push(cityVal);
                
                if (!rawK && locationParts.length === 0) {
                    return window.showCustomMsg("今天想吃點什麼呢？請輸入關鍵字或選擇國家縣市！");
                }
                
                k = [...locationParts, rawK || '餐廳'].join(' ');
                cId = 'explore-results-container'; 
                document.getElementById(cId).innerHTML = `<div class="text-center text-orange-400 py-10 col-span-full"><i class="fa-brands fa-google fa-bounce text-4xl mb-3"></i><p class="font-bold tracking-widest text-sm mt-2">為您搜尋 ${k} ...</p></div>`; 
            } else {
                k = document.getElementById('radar-keyword').value; if(!k.trim()) k = "餐廳"; cId = 'nearby-container';
                document.getElementById(cId).innerHTML = `<div class="text-center text-orange-400 py-10 col-span-full"><i class="fa-brands fa-google fa-bounce text-4xl mb-3"></i><p class="font-bold tracking-widest text-sm mt-2">為您掃描最近的 15 間好店...</p></div>`; 
            }
            if (navigator.geolocation) { 
                navigator.geolocation.getCurrentPosition( 
                    (p) => { executeGoogleSearch(p.coords.latitude, p.coords.longitude, k, '50000', vT); }, 
                    (e) => { 
                        window.showCustomMsg("⚠️ 無法獲取您的位置！\n\n系統暫時以「屏東」為中心。若您在外縣市，請直接在搜尋框加上縣市名（例如：「台北 火鍋」）即可跨區搜尋！");
                        executeGoogleSearch(22.7380, 120.4810, k, '50000', vT); 
                    }, 
                    { enableHighAccuracy: true, timeout: 5000 } 
                ); 
            } else {
                window.showCustomMsg("⚠️ 您的裝置不支援定位功能。");
                executeGoogleSearch(22.7380, 120.4810, k, '50000', vT);
            }
        };
        
        window.getSearchPriceRange = function(viewType) {
            if (viewType !== 'explore' && viewType !== 'radar' && viewType !== 'random') return { min: null, max: null, active: false };
            const minEl = document.getElementById(`${viewType}-price-min`);
            const maxEl = document.getElementById(`${viewType}-price-max`);
            const minValue = minEl ? minEl.value : '';
            const maxValue = maxEl ? maxEl.value : '';
            const min = minValue === '' ? null : Number(minValue);
            const max = maxValue === '' ? null : Number(maxValue);
            if (min !== null && max !== null && min > max) {
                window.showCustomMsg("⚠️ 最低價位不能高於最高價位，請重新選擇。");
                return null;
            }
            return { min: min, max: max, active: min !== null || max !== null };
        };

        window.runQuickSearch = function(keyword) {
            const input = document.getElementById('explore-keyword');
            if (input) input.value = keyword;
            window.searchGooglePlaces('explore');
        };

        window.drawRandomFromGoogle = function() { 
            const priceRange = window.getSearchPriceRange('random');
            if (priceRange === null) return;
            const k = document.getElementById('random-keyword').value || "好吃的餐廳"; 
            const btn = document.getElementById('random-btn'); 
            btn.classList.add('animate-pulse'); 
            if (navigator.geolocation) { 
                navigator.geolocation.getCurrentPosition( 
                    (p) => { executeGoogleSearch(p.coords.latitude, p.coords.longitude, k, '50000', 'random'); }, 
                    (e) => { 
                        window.showCustomMsg("⚠️ 無法獲取您的位置！\n系統暫時以「屏東」為中心抽籤。若要抽其他縣市，請在框內輸入地點（例如：「高雄 燒肉」）！");
                        executeGoogleSearch(22.7380, 120.4810, k, '50000', 'random'); 
                    }, 
                    { enableHighAccuracy: true, timeout: 5000 } 
                ); 
            } else {
                executeGoogleSearch(22.7380, 120.4810, k, '50000', 'random');
            }
        };
        
        function executeGoogleSearch(lat, lng, k, rad, vT) { 
            if (typeof google !== 'undefined' && google.maps && google.maps.places) { 
                try {
                    const request = { location: new google.maps.LatLng(lat, lng), radius: rad, query: k };

                    new google.maps.places.PlacesService(document.createElement('div')).textSearch(request, (res, status) => { 
                        if (status === 'OK' && res.length > 0) { 
                            handleGoogleResults(res, vT, lat, lng); 
                        } else if (status === 'REQUEST_DENIED') {
                            window.showCustomMsg("⚠️ Google 地圖 API 權限錯誤！\n\n目前將暫時切換至展示模式。");
                            useFallback(vT, lat, lng);
                        } else { 
                            displayNoResults(vT); 
                        } 
                    }); 
                } catch(e) { useFallback(vT, lat, lng); }
            } else { 
                useFallback(vT, lat, lng);
            } 
        }

        function handleGoogleResults(res, vT, mLat, mLng) { 
            res.forEach(r => {
                r.dist = getDistanceFromLatLonInKm(mLat, mLng, r.geometry.location.lat(), r.geometry.location.lng());
                
                if (r.business_status === 'CLOSED_TEMPORARILY' || r.business_status === 'CLOSED_PERMANENTLY') {
                    r.openStatus = -1;
                } else if (r.opening_hours) {
                    let open = typeof r.opening_hours.isOpen === 'function' ? r.opening_hours.isOpen() : r.opening_hours.open_now;
                    r.openStatus = open === true ? 1 : (open === false ? -1 : 0);
                } else {
                    r.openStatus = 0; 
                }
            }); 
            
            const priceRange = window.getSearchPriceRange(vT);
            if (!priceRange) return;
            if (priceRange.active) {
                res = res.filter(r => Number.isInteger(r.price_level)
                    && (priceRange.min === null || r.price_level >= priceRange.min)
                    && (priceRange.max === null || r.price_level <= priceRange.max));
            }

            res = res.sort((a, b) => {
                if (a.openStatus !== b.openStatus) return b.openStatus - a.openStatus; 
                if (vT === 'explore' || vT === 'random') return (b.rating || 0) - (a.rating || 0); 
                else return a.dist - b.dist; 
            });

            if (vT === 'radar') res = res.slice(0, 15);
            if(res.length === 0) return displayNoResults(vT); 
            
            if(vT === 'random') { 
                renderRandomResult(res[Math.floor(Math.random() * res.length)]); 
            } else { 
                const cId = vT === 'explore' ? 'explore-results-container' : 'nearby-container'; 
                document.getElementById(cId).innerHTML = res.map(p => generatePlaceCardHtml(p)).join(''); 
            } 
        }
        
        function displayNoResults(vT) { 
            const msg = `<div class="text-center text-gray-500 py-10 col-span-full">附近找不到相關餐廳喔！<br>換個關鍵字試試？</div>`; 
            if(vT === 'explore') document.getElementById('explore-results-container').innerHTML = msg; 
            if(vT === 'radar') document.getElementById('nearby-container').innerHTML = msg; 
            if(vT === 'random') { document.getElementById('random-btn').classList.remove('animate-pulse'); window.showCustomMsg("附近找不到喔！"); } 
        }
        
        function extractCity(address) { const m = address ? address.match(/(基隆市|台北市|新北市|桃園市|新竹縣|新竹市|苗栗縣|台中市|彰化縣|南投縣|雲林縣|嘉義縣|嘉義市|台南市|高雄市|屏東縣|宜蘭縣|花蓮縣|台東縣|澎湖縣|金門縣|連江縣|東京都|大阪府|京都府|北海道|沖繩縣|福岡縣|愛知縣|神奈川縣|埼玉縣|千葉縣|兵庫縣|廣島縣|宮城縣|熊本縣|靜岡縣|長野縣|岐阜縣|三重縣|滋賀縣|奈良縣|和歌山縣|岡山縣|山口縣|香川縣|愛媛縣|高知縣|德島縣|大分縣|宮崎縣|鹿兒島縣|佐賀縣|長崎縣|青森縣|岩手縣|秋田縣|山形縣|福島縣|茨城縣|栃木縣|群馬縣|新潟縣|富山縣|石川縣|福井縣|山梨縣|鳥取縣|島根縣)/) : null; return m ? m[0] : '未分類'; }
        
        function generateRatingHtml(rating, reviews) { if(!rating) return `<span class="text-gray-400 text-[11px]">暫無評價</span>`; return `<span class="text-orange-500 font-bold text-[11px] bg-orange-50 px-1.5 py-0.5 rounded-lg flex items-center w-fit border border-orange-100"><i class="fa-solid fa-star text-[9px] mr-1"></i> ${parseFloat(rating).toFixed(1)} <span class="text-gray-500 text-[9px] ml-1 font-normal">(${reviews||0})</span></span>`; }
        
        function generatePlaceCardHtml(p) { 
            let rawImg = p.photos && p.photos.length > 0 ? p.photos[0].getUrl({maxWidth: 500}) : '';
            let img = window.getSafeImage(rawImg, p.name);
            
            const mUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name + ' ' + p.formatted_address)}`; 
            const cStr = extractCity(p.formatted_address); 
            const pDataStr = window.escapeForBtn(JSON.stringify({ name: p.name, placeId: p.place_id || '', mapLink: mUrl, lat: p.geometry.location.lat(), lng: p.geometry.location.lng(), rating: p.rating || 0, reviews: p.user_ratings_total || 0, photoUrl: '', city: cStr })); 
            const safeNameStr = window.escapeForBtn(p.name);

            return `<div class="restaurant-card bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden relative cursor-pointer group h-48 md:h-56 lg:h-64 transition" onclick="window.openRestaurantDetailByName('${safeNameStr}')">
                <img src="${img}" onerror="this.onerror=null; this.src=window.getFallbackImage('${safeNameStr}');" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110">
                <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent"></div>
                <div class="absolute top-2.5 left-2.5 bg-black/60 backdrop-blur-md text-white text-[10px] px-2.5 py-1 rounded-full z-10 font-bold tracking-widest border border-white/20"><i class="fa-solid fa-location-arrow mr-1 text-orange-400"></i>${p.dist.toFixed(1)} km</div>
                <div class="absolute bottom-0 left-0 right-0 p-3.5 md:p-4 z-10">
                    <h3 class="text-base md:text-lg font-bold text-white line-clamp-2 drop-shadow-md leading-tight">${p.name}</h3>
                </div>
            </div>`; 
        }
        
        function renderRandomResult(p) { 
            window.currentRandomPlaceName = p.name;
            let rawImg = p.photos && p.photos.length > 0 ? p.photos[0].getUrl({maxWidth: 600}) : '';
            let img = window.getSafeImage(rawImg, p.name);
            const mUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name + ' ' + p.formatted_address)}`;
            const cStr = extractCity(p.formatted_address);
            document.getElementById('res-photo').src = img;
            document.getElementById('res-photo').onerror = function() { this.onerror = null; this.src = window.getFallbackImage(p.name); };
            document.getElementById('res-name').textContent = p.name;
            document.getElementById('res-address').innerHTML = `<i class="fa-solid fa-location-dot mr-1"></i>${p.formatted_address}`;
            document.getElementById('res-address-full').innerHTML = `<i class="fa-solid fa-location-dot"></i>${p.formatted_address}`;
            document.getElementById('res-distance').innerHTML = `<i class="fa-solid fa-route"></i>${p.dist.toFixed(1)} km`;
            document.getElementById('res-rating').innerHTML = `<i class="fa-solid fa-star"></i> ${p.rating || '無'}`;
            document.getElementById('res-map').href = mUrl;
            const pDataStr = window.escapeForBtn(JSON.stringify({ name: p.name, placeId: p.place_id || '', mapLink: mUrl, lat: p.geometry.location.lat(), lng: p.geometry.location.lng(), rating: p.rating||0, reviews: p.user_ratings_total||0, photoUrl: '', city: cStr }));
            document.getElementById('res-save-btn').setAttribute('onclick', `window.initInteraction("save", decodeURIComponent("${pDataStr}"))`);
            document.getElementById('random-btn').classList.add('hidden');
            document.getElementById('random-intro').classList.add('hidden');
            document.getElementById('random-result').classList.remove('hidden');
            
            let statusHtml = '';
            if (p.openStatus === 1) statusHtml = `<span class="bg-emerald-50 text-emerald-600 text-[10px] px-2.5 py-1 rounded-lg border border-emerald-100 font-bold shrink-0">營業中</span>`;
            else if (p.openStatus === -1) statusHtml = `<span class="bg-gray-100 text-gray-400 text-[10px] px-2.5 py-1 rounded-lg border border-gray-200 font-bold shrink-0">休息中</span>`;
            else statusHtml = `<span class="bg-blue-50 text-blue-500 text-[10px] px-2.5 py-1 rounded-lg border border-blue-100 font-bold shrink-0">看地圖確認</span>`;
            
            const infoDiv = document.querySelector('#random-result .p-5 .flex.items-center');
            if (infoDiv) {
                infoDiv.innerHTML = `<span id="res-rating" class="text-orange-500 font-bold text-sm bg-orange-50 px-2.5 py-1 rounded-lg border border-orange-100"><i class="fa-solid fa-star"></i> ${p.rating || '無'}</span>${statusHtml}`;
            }
        }

        window.resetRandom = function() { document.getElementById('random-btn').classList.remove('hidden'); document.getElementById('random-intro').classList.remove('hidden'); document.getElementById('random-result').classList.add('hidden'); };

        window.initInteraction = function(type, pDStr) { 
            const pD = typeof pDStr === 'string' ? JSON.parse(pDStr) : pDStr;
            pendingInteraction = { type: type, placeData: pD }; 
            window.requireIdentity(() => {
                openInteractionModal();
            });
        };
        window.selectIntRating = function(v) { document.getElementById('int-rating-value').value = v; const bG = document.getElementById('btn-rating-good'); const bB = document.getElementById('btn-rating-bad'); if(v === 'good') { bG.classList.add('bg-emerald-50','border-emerald-400','text-emerald-600'); bB.classList.remove('bg-red-50','border-red-400','text-red-600'); } else { bB.classList.add('bg-red-50','border-red-400','text-red-600'); bG.classList.remove('bg-emerald-50','border-emerald-400','text-emerald-600'); } };
        
        function openInteractionModal() { 
            if(!pendingInteraction) return; 
            document.getElementById('interaction-name').textContent = pendingInteraction.placeData.name; 
            const isS = pendingInteraction.type === 'save'; 
            document.getElementById('interaction-title').innerHTML = isS ? '把好店收進口袋' : '留下你的美食足跡'; 
            document.getElementById('interaction-rating-section').classList.toggle('hidden', isS); 
            document.getElementById('btn-confirm-int').innerHTML = isS ? '收進口袋名單' : '發布至動態牆'; 
            document.getElementById('int-notes').value = ''; 
            window.setPhotoUploaderValue('int-photo', '');
            window.selectIntRating('good'); 
            document.getElementById('interaction-modal').classList.remove('hidden'); 
        }

        async function syncToGoogleSheets(sheetName, data) {
            if (!GAS_API_URL) return;
            try {
                await fetch(GAS_API_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'add', sheetName: sheetName, data: data })
                });
            } catch (e) {
                console.error("Sheets Sync Error:", e);
            }
        }

        window.confirmInteraction = async function() {
            if(!pendingInteraction) return; 
            const n = document.getElementById('int-notes').value; 
            const rV = document.getElementById('int-rating-value').value;
            const photoVal = document.getElementById('int-photo-url') ? document.getElementById('int-photo-url').value.trim() : '';
            const btn = document.getElementById('btn-confirm-int');
            const originalBtnHtml = btn ? btn.innerHTML : '發布';

            window.requireIdentity(async () => {
                const g = window.myIdentity.group; 
                const c = window.myIdentity.name;
                const pType = pendingInteraction.type;
                const pData = { ...pendingInteraction.placeData };
                
                let safePhoto = window.isGoogleMapsPhotoUrl(photoVal) ? "" : photoVal;
                
                // 若有拍照/選擇相簿照片 (Base64 Data URL)，先上傳至 Google Drive
                if (safePhoto && safePhoto.startsWith('data:')) {
                    if (btn) { btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> 照片上傳中...'; btn.disabled = true; }
                    try {
                        const uploadRes = await window.uploadImageToDrive(safePhoto, `review_${pData.name || 'food'}_${Date.now()}.jpg`);
                        if (uploadRes && (uploadRes.imageUrl || uploadRes.fileId)) {
                            safePhoto = uploadRes.imageUrl || window.getDriveImageUrl(uploadRes.fileId);
                        }
                    } catch (uploadErr) {
                        console.error("照片上傳 Drive 失敗:", uploadErr);
                        if (btn) { btn.innerHTML = originalBtnHtml; btn.disabled = false; }
                        return window.showCustomMsg("⚠️ 照片上傳失敗，請重新選擇照片或稍後再試。");
                    }
                } else if (safePhoto && !safePhoto.startsWith('http://') && !safePhoto.startsWith('https://')) {
                    safePhoto = window.resolveReviewImage(safePhoto);
                }

                if (btn) { btn.innerHTML = originalBtnHtml; btn.disabled = false; }
                window.closeModal('interaction-modal');
                pendingInteraction = null;

                try {
                    if(pType === 'review') {
                        const cityVal = pData.city || extractCity(pData.name + " " + (pData.formatted_address || ""));
                        const countryVal = pData.country || window.getCountryFromCity(cityVal);
                        const reviewItem = { restaurantName: pData.name, group: g, creator: c, rating: rV, content: n, city: cityVal, country: countryVal, photoUrl: safePhoto };
                        syncToGoogleSheets('Feed', reviewItem);
                        if(db && currentUser) {
                            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'feed'), { ...reviewItem, timestamp: serverTimestamp() });
                            window.showCustomMsg(`✅ 評價已成功發布並同步至 Google 試算表！`);
                        } else {
                            window.feedData.unshift({ id: Date.now().toString(), ...reviewItem, timestamp: {seconds: Date.now()/1000} });
                            window.renderFeed();
                            window.showCustomMsg(`✅ 評價已存入並寫入 Google 試算表！`);
                        }
                        window.renderFeed();
                        window.switchTab('feed');
                    } else {
                        const restaurantItem = { ...pData, city: pData.city || "未分類", hours: "", category: "未分類", status: "想去", notes: n, group: g, creator: c, photoUrl: safePhoto || pData.photoUrl || '' };
                        syncToGoogleSheets('Restaurants', restaurantItem);
                        if(db && currentUser) {
                            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'restaurants'), { ...restaurantItem, timestamp: serverTimestamp() });
                        }
                        const tempId = Date.now().toString();
                        const existingIdx = window.restaurantData.findIndex(r => r.name === restaurantItem.name && r.creator === restaurantItem.creator && r.group === restaurantItem.group);
                        if (existingIdx >= 0) {
                            window.restaurantData[existingIdx] = { id: window.restaurantData[existingIdx].id || tempId, ...restaurantItem };
                        } else {
                            window.restaurantData.unshift({ id: tempId, ...restaurantItem, timestamp: {seconds: Date.now()/1000} });
                        }
                        window.renderList();
                        if (typeof window.renderAdminDataList === 'function') window.renderAdminDataList();
                        window.showCustomMsg(`❤️ 「${pData.name}」已成功收進口袋名單！`);
                    }
                } catch (e) {
                    console.error("寫入錯誤:", e);
                    window.showCustomMsg('❌ 儲存失敗！請檢查連線。');
                }
            });
        };

        window.getGroupColorTheme = function(groupName) {
            const COLOR_PALETTES = [
                { border: 'border-2 border-amber-300', bg: 'bg-amber-50/40', badge: 'bg-amber-100 text-amber-800 border border-amber-200', avatar: 'bg-amber-100 text-amber-700', quoteBorder: 'border-amber-400' },
                { border: 'border-2 border-emerald-300', bg: 'bg-emerald-50/40', badge: 'bg-emerald-100 text-emerald-800 border border-emerald-200', avatar: 'bg-emerald-100 text-emerald-700', quoteBorder: 'border-emerald-400' },
                { border: 'border-2 border-cyan-300', bg: 'bg-cyan-50/40', badge: 'bg-cyan-100 text-cyan-800 border border-cyan-200', avatar: 'bg-cyan-100 text-cyan-700', quoteBorder: 'border-cyan-400' },
                { border: 'border-2 border-purple-300', bg: 'bg-purple-50/40', badge: 'bg-purple-100 text-purple-800 border border-purple-200', avatar: 'bg-purple-100 text-purple-700', quoteBorder: 'border-purple-400' },
                { border: 'border-2 border-blue-300', bg: 'bg-blue-50/40', badge: 'bg-blue-100 text-blue-800 border border-blue-200', avatar: 'bg-blue-100 text-blue-700', quoteBorder: 'border-blue-400' },
                { border: 'border-2 border-rose-300', bg: 'bg-rose-50/40', badge: 'bg-rose-100 text-rose-800 border border-rose-200', avatar: 'bg-rose-100 text-rose-700', quoteBorder: 'border-rose-400' },
                { border: 'border-2 border-teal-300', bg: 'bg-teal-50/40', badge: 'bg-teal-100 text-teal-800 border border-teal-200', avatar: 'bg-teal-100 text-teal-700', quoteBorder: 'border-teal-400' },
                { border: 'border-2 border-indigo-300', bg: 'bg-indigo-50/40', badge: 'bg-indigo-100 text-indigo-800 border border-indigo-200', avatar: 'bg-indigo-100 text-indigo-700', quoteBorder: 'border-indigo-400' },
                { border: 'border-2 border-pink-300', bg: 'bg-pink-50/40', badge: 'bg-pink-100 text-pink-800 border border-pink-200', avatar: 'bg-pink-100 text-pink-700', quoteBorder: 'border-pink-400' }
            ];

            if (!groupName || groupName === '主揪') {
                return { border: 'border-2 border-orange-400', bg: 'bg-orange-50/50', badge: 'bg-orange-500 text-white font-bold', avatar: 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md', quoteBorder: 'border-orange-400' };
            }

            const KNOWN_MAP = {
                '玉泉': COLOR_PALETTES[1], // emerald
                '屏東': COLOR_PALETTES[2], // cyan
                '高雄': COLOR_PALETTES[3], // purple
                '台北': COLOR_PALETTES[4], // blue
                '老服': COLOR_PALETTES[5], // rose
                '社發': COLOR_PALETTES[6]  // teal
            };

            if (KNOWN_MAP[groupName]) return KNOWN_MAP[groupName];

            let hash = 0;
            for (let i = 0; i < groupName.length; i++) hash += groupName.charCodeAt(i);
            return COLOR_PALETTES[hash % COLOR_PALETTES.length];
        };

        window.openPartyRecapModal = function(pid) {
            const party = window.partyData.find(p => p.id === pid);
            if (!party) return;
            window.requireIdentity(() => {
                document.getElementById('party-recap-id').value = pid;
                document.getElementById('party-recap-title').value = party.title;
                document.getElementById('party-recap-location').value = party.location || '';
                document.getElementById('party-recap-subtitle').textContent = `🎉 ${party.title} (${party.group}團)`;
                window.setPhotoUploaderValue('party-recap', '');
                document.getElementById('party-recap-content').value = '';
                document.getElementById('party-recap-modal').classList.remove('hidden');
            });
        };

        window.submitPartyRecap = async function(e) {
            if (e && e.preventDefault) e.preventDefault();
            const btn = document.getElementById('btn-submit-recap');
            const originalText = btn ? btn.innerHTML : '發布至動態牆讓全站看到';
            if (btn) { btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> 照片上傳中...'; btn.disabled = true; }

            try {
                const partyId = document.getElementById('party-recap-id').value;
                const partyTitle = document.getElementById('party-recap-title').value;
                const partyLocation = document.getElementById('party-recap-location').value;
                let photoUrl = document.getElementById('party-recap-photo').value.trim();
                const content = document.getElementById('party-recap-content').value.trim();

                if (!photoUrl) {
                    if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
                    return window.showCustomMsg("請拍照或上傳一張聚會活動照片喔！");
                }

                if (photoUrl.startsWith('data:')) {
                    try {
                        const uploadRes = await window.uploadImageToDrive(photoUrl, `party_recap_${Date.now()}.jpg`);
                        if (uploadRes && (uploadRes.imageUrl || uploadRes.fileId)) {
                            photoUrl = uploadRes.imageUrl || window.getDriveImageUrl(uploadRes.fileId);
                        }
                    } catch (uploadErr) {
                        console.error("聚會照片上傳失敗:", uploadErr);
                        if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
                        return window.showCustomMsg("⚠️ 照片上傳失敗，請重新選擇照片或稍後再試。");
                    }
                }

                const party = window.partyData.find(p => p.id === partyId);
                const g = window.myIdentity?.group || party?.group || '聚會團';
                const c = window.myIdentity?.name || '好友';

                const feedItem = {
                    type: 'party_recap',
                    partyId: partyId,
                    partyTitle: partyTitle,
                    restaurantName: partyLocation || partyTitle,
                    location: partyLocation || '',
                    group: g,
                    creator: c,
                    content: content || '聚會圓滿落幕！現場氣氛超棒！',
                    photoUrl: photoUrl,
                    rating: 'good',
                    joinedUsers: party && Array.isArray(party.joinedUsers) ? party.joinedUsers : []
                };

                syncToGoogleSheets('Feed', {
                    restaurantName: feedItem.partyTitle,
                    group: feedItem.group,
                    creator: feedItem.creator,
                    rating: 'good',
                    content: feedItem.content,
                    type: 'party_recap',
                    inviter: '',
                    photoUrl: feedItem.photoUrl
                });

                if (db && currentUser) {
                    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'feed'), {
                        ...feedItem,
                        timestamp: serverTimestamp()
                    });
                    window.showCustomMsg("🎉 聚會紀錄已成功發布至美食動態牆！");
                } else {
                    window.feedData.unshift({
                        id: Date.now().toString(),
                        ...feedItem,
                        timestamp: { seconds: Date.now() / 1000 }
                    });
                    window.renderFeed();
                    window.showCustomMsg("🎉 聚會紀錄已發布！");
                }

                window.closeModal('party-recap-modal');
                window.switchTab('feed');
            } catch (err) {
                console.error("發布聚會花絮失敗:", err);
                window.showCustomMsg("發布失敗，請確認網路連線。");
            } finally {
                if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
            }
        };

        let currentProfileUser = null;
        window.openUserProfile = function(userName, groupName) {
            if (!userName) return;
            try { userName = decodeURIComponent(userName); } catch(e) {}
            try { groupName = decodeURIComponent(groupName || ''); } catch(e) {}
            currentProfileUser = { name: userName, group: groupName || '' };
            const modal = document.getElementById('user-profile-modal');
            if (!modal) return;

            document.getElementById('profile-name').textContent = userName;
            document.getElementById('profile-group').textContent = `${groupName || '好朋友'} 團`;
            
            // 尋找此用戶的 Line ID 及 Bio
            let lineId = '';
            let bio = '';
            let inviter = '';
            
            if (window.myIdentity && window.myIdentity.name === userName) {
                lineId = window.myIdentity.lineId || '';
                bio = window.myIdentity.bio || '';
            }
            
            const matchedFeed = window.feedData.find(f => f.creator === userName && f.type === 'system_welcome');
            if (matchedFeed) inviter = matchedFeed.inviter || '';
            
            document.getElementById('profile-inviter').textContent = inviter ? `(由 ${inviter} 引薦)` : '';
            document.getElementById('profile-bio').textContent = bio ? `「${bio}」` : '「無辣不歡，熱愛尋找高 C/P 值隱藏版美食！」';
            document.getElementById('profile-line-id').textContent = lineId ? lineId : '尚未設定 LINE ID';

            const copyBtn = document.getElementById('profile-copy-line-btn');
            if (copyBtn) {
                copyBtn.setAttribute('data-line-id', lineId);
                copyBtn.style.display = lineId ? 'inline-flex' : 'none';
            }

            // 列出此人推薦的餐廳
            const recs = window.restaurantData.filter(r => r.creator === userName);
            document.getElementById('profile-rec-count').textContent = `${recs.length} 間`;
            const recListEl = document.getElementById('profile-rec-list');
            if (recs.length === 0) {
                recListEl.innerHTML = '<p class="text-xs text-gray-400 py-2 text-center">尚未新增口袋美食</p>';
            } else {
                recListEl.innerHTML = recs.map(r => `
                    <div class="bg-gray-50 p-2 rounded-xl border border-gray-100 flex items-center justify-between text-xs">
                        <span class="font-bold text-gray-800 truncate">${r.name}</span>
                        <span class="text-[10px] text-orange-500 font-bold bg-orange-50 px-2 py-0.5 rounded-full border border-orange-100 shrink-0">${r.category || '口袋名單'}</span>
                    </div>`).join('');
            }

            modal.classList.remove('hidden');
        };

        window.copyProfileLineId = function() {
            const btn = document.getElementById('profile-copy-line-btn');
            const lineId = btn ? btn.getAttribute('data-line-id') : '';
            if (!lineId) return window.showCustomMsg("該好友尚未提供 LINE ID 喔！");
            navigator.clipboard.writeText(lineId).then(() => {
                window.showCustomMsg(`✅ 已成功複製 ${currentProfileUser?.name || ''} 的 LINE ID：${lineId}`);
            }).catch(() => {
                window.showCustomMsg(`LINE ID: ${lineId}`);
            });
        };

        window.sendWaveToUser = function() {
            const name = currentProfileUser?.name;
            if (!name) return;
            window.requireIdentity(async () => {
                const me = window.myIdentity.name;
                const waveItem = {
                    type: 'system_welcome',
                    creator: me,
                    group: window.myIdentity.group,
                    inviter: name,
                    timestamp: { seconds: Date.now() / 1000 }
                };
                window.feedData.unshift({ id: Date.now().toString(), ...waveItem });
                window.showCustomMsg(`👋 已向 ${name} 揮手打招呼！`);
                window.closeModal('user-profile-modal');
                window.renderFeed();
            });
        };

        window.openFriendDirectoryModal = function() {
            const modal = document.getElementById('friend-directory-modal');
            if (!modal) return;
            
            // 填充群組下拉選單
            const groupFilter = document.getElementById('friend-group-filter');
            if (groupFilter && window.appConfig.groups) {
                groupFilter.innerHTML = '<option value="all">所有群組</option>' + 
                    window.appConfig.groups.map(g => `<option value="${g}">${g} 團</option>`).join('');
            }
            
            window.filterFriendDirectory();
            modal.classList.remove('hidden');
        };

        window.filterFriendDirectory = function() {
            const container = document.getElementById('friend-directory-container');
            if (!container) return;
            
            const keyword = (document.getElementById('friend-search-input')?.value || '').toLowerCase().trim();
            const groupVal = document.getElementById('friend-group-filter')?.value || 'all';

            // 匯集全站所有成員
            const allMembers = [];
            const membersMap = window.appConfig.membersMap || {};
            
            Object.keys(membersMap).forEach(grp => {
                if (groupVal !== 'all' && grp !== groupVal) return;
                const members = membersMap[grp] || [];
                members.forEach(name => {
                    if (keyword && !name.toLowerCase().includes(keyword) && !grp.toLowerCase().includes(keyword)) return;
                    if (!allMembers.some(m => m.name === name && m.group === grp)) {
                        allMembers.push({ name: name, group: grp });
                    }
                });
            });

            if (allMembers.length === 0) {
                container.innerHTML = '<p class="text-xs text-gray-400 py-8 text-center">沒有找到符合條件的美食好友喔！</p>';
                return;
            }

            container.innerHTML = allMembers.map(m => {
                const theme = window.getGroupColorTheme(m.group);
                return `
                <div class="bg-gray-50/90 hover:bg-orange-50/50 p-3 rounded-2xl border border-gray-100/80 flex items-center justify-between gap-2 transition">
                    <div class="flex items-center gap-3 min-w-0 cursor-pointer" onclick="window.openUserProfile('${window.escapeForBtn(m.name)}', '${window.escapeForBtn(m.group)}')">
                        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-sm">
                            <i class="fa-solid fa-user"></i>
                        </div>
                        <div class="min-w-0">
                            <p class="text-sm font-bold text-gray-900 truncate leading-snug">${m.name}</p>
                            <span class="${theme.badge} px-2 py-0.5 rounded-md font-bold text-[10px] inline-block mt-0.5">${m.group} 團</span>
                        </div>
                    </div>
                    <button onclick="window.openUserProfile('${window.escapeForBtn(m.name)}', '${window.escapeForBtn(m.group)}')" class="bg-white border border-gray-200 hover:border-orange-300 text-gray-700 hover:text-orange-600 text-xs font-bold px-3 py-1.5 rounded-xl shadow-2xs transition shrink-0">
                        <i class="fa-solid fa-address-card mr-1 text-orange-400"></i>看名片
                    </button>
                </div>`;
            }).join('');
        };

        window.toggleFeedLike = function(feedId) {
            window.requireIdentity(async () => {
                const item = window.feedData.find(f => f.id === feedId);
                if (!item) return;
                if (!Array.isArray(item.likes)) item.likes = [];
                
                const myName = window.myIdentity.name;
                const idx = item.likes.indexOf(myName);
                if (idx > -1) item.likes.splice(idx, 1);
                else item.likes.push(myName);

                if (db && currentUser) {
                    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'feed', feedId), { likes: item.likes });
                }
                window.renderFeed();
            });
        };

        window.toggleFeedComments = function(feedId) {
            const el = document.getElementById(`feed-comments-${feedId}`);
            if (el) el.classList.toggle('hidden');
        };

        window.addFeedComment = function(feedId) {
            const input = document.getElementById(`feed-input-${feedId}`);
            const text = input ? input.value.trim() : '';
            if (!text) return;

            window.requireIdentity(async () => {
                const item = window.feedData.find(f => f.id === feedId);
                if (!item) return;
                if (!Array.isArray(item.comments)) item.comments = [];

                const commentObj = {
                    creator: window.myIdentity.name,
                    group: window.myIdentity.group,
                    text: text,
                    timestamp: new Date().toISOString()
                };

                item.comments.push(commentObj);
                if (input) input.value = '';

                if (db && currentUser) {
                    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'feed', feedId), { comments: item.comments });
                }
                window.renderFeed();
            });
        };

        window.renderFeed = function() {
            const container = document.getElementById('feed-container'); 
            if (!container) return;
            if (window.feedData.length === 0) {
                container.innerHTML = '<div class="text-center text-gray-400 py-12 col-span-full"><i class="fa-solid fa-utensils text-5xl mb-3 opacity-20"></i><p class="text-sm font-medium text-gray-500">動態牆目前靜悄悄的...<br>去口袋名單挑一間店寫下心得吧！</p></div>';
                return;
            }

            container.innerHTML = [...window.feedData].sort((a,b)=>(b.timestamp?.seconds||0)-(a.timestamp?.seconds||0)).map(item => {
                const dateStr = item.timestamp?.seconds ? new Date(item.timestamp.seconds * 1000).toLocaleDateString('zh-TW', {month:'short', day:'numeric'}) : '剛剛';
                
                // 1. 歡迎廣播卡片
                if (item.type === 'system_welcome') {
                    return `
                    <div class="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-2xl border border-blue-100 shadow-sm relative overflow-hidden">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center shadow shrink-0">
                                <i class="fa-solid fa-hand-wave text-base"></i>
                            </div>
                            <div class="min-w-0 flex-1">
                                <p class="text-[11px] text-blue-600 font-bold mb-0.5">🎉 新朋友加入 · ${dateStr}</p>
                                <p class="text-xs sm:text-sm text-gray-800 font-bold leading-snug">
                                    歡迎 <span class="text-blue-600 font-extrabold">${item.creator}</span> 加入 <span class="text-blue-600 font-extrabold">${item.group}</span>！
                                </p>
                                <p class="text-[11px] text-gray-500 mt-0.5">(由 ${item.inviter} 引薦進來 🙌)</p>
                            </div>
                        </div>
                    </div>`;
                }

                // 2. 🌟 聚會結束照片廣播卡片 (Party Recap)
                if (item.type === 'party_recap') {
                    const joinedStr = Array.isArray(item.joined) && item.joined.length > 0 ? item.joined.join('、') : item.creator;
                    const theme = window.getGroupColorTheme(item.group);
                    return `
                    <div class="rounded-3xl p-5 shadow-sm bg-gradient-to-br from-amber-50/90 via-orange-50/50 to-white border-2 border-amber-300 flex flex-col gap-3 transition hover:shadow-md relative overflow-hidden">
                        <div class="flex items-center justify-between gap-2 border-b border-amber-200/60 pb-3">
                            <div class="flex items-center gap-3 min-w-0">
                                <div class="w-10 h-10 rounded-full bg-amber-500 text-white flex items-center justify-center text-sm shrink-0 shadow-md">
                                    <i class="fa-solid fa-camera-retro"></i>
                                </div>
                                <div class="min-w-0">
                                    <div class="flex items-center gap-1.5 flex-wrap">
                                        <span class="text-sm font-extrabold text-gray-900 truncate">${item.creator}</span>
                                        <span class="bg-amber-500 text-white text-[9px] px-1.5 py-0.5 rounded font-black tracking-wider shadow-xs">聚會花絮</span>
                                    </div>
                                    <div class="flex items-center gap-1.5 text-[11px] text-gray-500 mt-0.5">
                                        <span class="${theme.badge} px-2 py-0.5 rounded-md font-bold text-[10px]">${item.group} 團</span>
                                        <span>•</span>
                                        <span>${dateStr}</span>
                                    </div>
                                </div>
                            </div>
                            <span class="inline-flex items-center gap-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white px-2.5 py-1 rounded-full font-bold text-[10px] shadow-sm shrink-0">
                                <i class="fa-solid fa-fire text-[9px]"></i> 聚會記錄
                            </span>
                        </div>

                        <div class="bg-white/90 backdrop-blur-sm p-4 rounded-2xl border border-amber-100 shadow-xs flex flex-col gap-3">
                            <div>
                                <h3 class="text-base font-bold text-gray-900 leading-snug"><i class="fa-solid fa-champagne-glasses text-amber-500 mr-1.5"></i>${item.partyTitle || '聚會活動紀錄'}</h3>
                                ${item.location ? `<p class="text-xs text-gray-500 font-medium mt-1"><i class="fa-solid fa-location-dot text-orange-400 mr-1"></i>${item.location}</p>` : ''}
                            </div>

                            ${item.photoUrl ? `
                            <div class="relative rounded-xl overflow-hidden shadow-sm max-h-72 border border-gray-100 group">
                                <img src="${window.resolveReviewImage(item.photoUrl, item.partyTitle)}" onerror="this.onerror=null; this.src=window.getFallbackImage('${window.escapeForBtn(item.partyTitle)}');" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
                            </div>` : ''}

                            <p class="text-xs sm:text-sm text-gray-800 leading-relaxed font-medium pl-3 border-l-2 border-amber-400">
                                ${item.content || '聚會圓滿落幕！附上記錄畫面。'}
                            </p>

                            <div class="bg-amber-50/60 p-2.5 rounded-xl border border-amber-100/80 flex items-center gap-1.5 text-[11px] text-amber-800 font-bold">
                                <i class="fa-solid fa-users text-amber-500 shrink-0"></i>
                                <span class="shrink-0">同行夥伴：</span>
                                <span class="truncate text-gray-700 font-medium">${joinedStr}</span>
                            </div>
                        </div>
                    </div>`;
                }

                // 3. 一般評價動態卡片 (依群組提供專屬色彩外框與樣式)
                const isHost = item.creator === '黃政誥' || item.group === '主揪';
                const isGood = item.rating === 'good';
                const theme = window.getGroupColorTheme(item.group);
                
                const likes = Array.isArray(item.likes) ? item.likes : [];
                const isLiked = window.myIdentity && likes.includes(window.myIdentity.name);
                const comments = Array.isArray(item.comments) ? item.comments : [];

                const commentsHtml = comments.map(c => `
                    <div class="text-xs bg-white p-2 rounded-xl border border-gray-100">
                        <span class="font-bold text-gray-900 cursor-pointer hover:text-orange-500" onclick="window.openUserProfile('${window.escapeForBtn(c.creator)}', '${window.escapeForBtn(c.group)}')">${c.creator}</span>
                        <span class="text-[10px] text-gray-400">(${c.group})</span>: 
                        <span class="text-gray-700 font-medium">${c.text}</span>
                    </div>`).join('');
                
                const badgeRating = isGood 
                    ? `<span class="inline-flex items-center gap-1 bg-emerald-500 text-white px-2.5 py-1 rounded-full font-bold text-[11px] shadow-sm shrink-0"><i class="fa-solid fa-thumbs-up text-[10px]"></i> 推爆</span>` 
                    : `<span class="inline-flex items-center gap-1 bg-rose-500 text-white px-2.5 py-1 rounded-full font-bold text-[11px] shadow-sm shrink-0"><i class="fa-solid fa-thumbs-down text-[10px]"></i> 避雷</span>`;

                const cardStyle = `${theme.border} ${theme.bg}`;
                const avatarStyle = isHost 
                    ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md' 
                    : `${theme.avatar} border border-white/60`;

                const matchedRes = window.restaurantData.find(r => r.name === item.restaurantName);
                const feedCity = item.city || (matchedRes ? matchedRes.city : extractCity(item.restaurantName)) || '';
                const feedCountry = item.country || (matchedRes ? matchedRes.country : window.getCountryFromCity(feedCity)) || window.getCountryFromCity(feedCity);
                let feedLocTag = '';
                if (feedCountry && feedCity && feedCity !== '未分類') {
                    feedLocTag = `${feedCountry} · ${feedCity}`;
                } else if (feedCity && feedCity !== '未分類') {
                    feedLocTag = feedCity;
                } else if (feedCountry) {
                    feedLocTag = feedCountry;
                }

                return `
                <div class="rounded-2xl p-4 shadow-sm ${cardStyle} flex flex-col gap-3 transition hover:shadow-md">
                    <!-- 卡片頂部：發文者身分與評價標籤 -->
                    <div class="flex items-center justify-between gap-2 border-b border-gray-100/60 pb-3">
                        <div class="flex items-center gap-3 min-w-0 cursor-pointer" onclick="window.openUserProfile('${window.escapeForBtn(item.creator)}', '${window.escapeForBtn(item.group)}')">
                            <div class="w-10 h-10 rounded-full flex items-center justify-center text-sm shrink-0 ${avatarStyle}">
                                <i class="fa-solid ${isHost ? 'fa-crown' : 'fa-user'}"></i>
                            </div>
                            <div class="min-w-0">
                                <div class="flex items-center gap-1.5 flex-wrap">
                                    <span class="text-sm font-bold text-gray-900 truncate leading-none hover:text-orange-500 transition">${item.creator}</span>
                                    ${isHost ? '<span class="bg-orange-500 text-white text-[9px] px-1.5 py-0.5 rounded font-black tracking-wider shadow-xs">主揪</span>' : ''}
                                </div>
                                <div class="flex items-center gap-1.5 text-[11px] text-gray-400 mt-1">
                                    <span class="${theme.badge} px-2 py-0.5 rounded-md font-bold text-[10px]">${item.group} 團</span>
                                    <span>•</span>
                                    <span>${dateStr}</span>
                                </div>
                            </div>
                        </div>
                        ${badgeRating}
                    </div>

                    <!-- 卡片下半部：店家名稱、照片與評語 -->
                    <div class="bg-white/90 backdrop-blur-sm p-3.5 rounded-xl border border-gray-100/80 shadow-xs flex flex-col gap-2">
                        <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.restaurantName)}" target="_blank" class="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center flex-wrap gap-1.5 transition break-all leading-snug">
                            <i class="fa-solid fa-location-dot text-orange-500 shrink-0"></i>
                            <span>${item.restaurantName}</span>
                            ${feedLocTag ? `<span class="inline-flex items-center text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md border border-orange-100 shrink-0 ml-0.5"><i class="fa-solid fa-earth-asia mr-1 text-[9px] text-orange-400"></i>${feedLocTag}</span>` : ''}
                        </a>
                        ${item.photoUrl ? `
                        <div class="relative rounded-xl overflow-hidden shadow-sm max-h-60 border border-gray-100 my-1">
                            <img src="${window.resolveReviewImage(item.photoUrl, item.restaurantName)}" onerror="this.onerror=null; this.src=window.getFallbackImage('${window.escapeForBtn(item.restaurantName)}');" class="w-full h-full object-cover">
                        </div>` : ''}
                        <p class="text-xs sm:text-sm text-gray-700 leading-relaxed break-words font-medium pl-3 border-l-2 ${theme.quoteBorder}">
                            ${item.content || '目前沒有撰寫文字心得喔！'}
                        </p>
                    </div>

                    <!-- 🌟 互動列：按讚與留言按鈕 -->
                    <div class="border-t border-gray-100/80 pt-2 flex items-center justify-between text-xs text-gray-500 font-bold">
                        <button onclick="window.toggleFeedLike('${item.id}')" class="flex items-center gap-1.5 px-2.5 py-1 rounded-xl hover:bg-rose-50 hover:text-rose-500 transition ${isLiked ? 'text-rose-500 bg-rose-50' : 'text-gray-500'}">
                            <i class="fa-${isLiked ? 'solid' : 'regular'} fa-heart text-sm"></i>
                            <span>${likes.length > 0 ? likes.length : '讚'}</span>
                        </button>
                        <button onclick="window.toggleFeedComments('${item.id}')" class="flex items-center gap-1.5 px-2.5 py-1 rounded-xl hover:bg-blue-50 hover:text-blue-500 transition">
                            <i class="fa-regular fa-comment text-sm"></i>
                            <span>留言 ${comments.length > 0 ? `(${comments.length})` : ''}</span>
                        </button>
                        <button onclick="window.openUserProfile('${window.escapeForBtn(item.creator)}', '${window.escapeForBtn(item.group)}')" class="flex items-center gap-1 px-2 py-1 rounded-xl hover:bg-orange-50 text-orange-600 transition text-[11px]">
                            <i class="fa-solid fa-address-card"></i>
                            <span>看名片</span>
                        </button>
                    </div>

                    <!-- 展開的留言討論區塊 -->
                    <div id="feed-comments-${item.id}" class="${comments.length > 0 ? '' : 'hidden'} bg-white/80 p-3 rounded-xl border border-gray-100 space-y-2 mt-1">
                        <div class="space-y-1.5 max-h-36 overflow-y-auto no-scrollbar">
                            ${commentsHtml || '<p class="text-[11px] text-gray-400 text-center py-1">還沒有留言，快來搶頭香吧！</p>'}
                        </div>
                        <div class="flex items-center gap-1.5 mt-2">
                            <input type="text" id="feed-input-${item.id}" onkeypress="if(event.key==='Enter') window.addFeedComment('${item.id}')" placeholder="發布留言聊聊..." class="flex-1 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-blue-400 font-medium">
                            <button onclick="window.addFeedComment('${item.id}')" class="bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-xs hover:bg-blue-600 transition">發布</button>
                        </div>
                    </div>
                </div>`;
            }).join('');
        };

        window.openRestaurantDetailByName = function(encodedName) {
            const name = decodeURIComponent(encodedName || '');
            if (!name) return;
            const matches = window.restaurantData.filter(item => item.name === name);
            const restaurant = matches[0] || {};
            const mUrl = restaurant.mapLink || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
            const recommenders = [];
            matches.forEach(item => {
                if (!recommenders.some(rec => rec.group === item.group && rec.creator === item.creator)) {
                    recommenders.push({ group: item.group, creator: item.creator });
                }
            });
            const tags = recommenders.length
                ? recommenders.map(rec => `<span class="bg-gray-50 text-gray-600 border-gray-200 text-[10px] px-2 py-1 rounded-lg border inline-block font-bold">${rec.group} - ${rec.creator}</span>`).join('')
                : '<span class="text-xs text-gray-400">來自動態牆的店家推薦</span>';
            const safeNameStr = window.escapeForBtn(name);
            const appUrl = window.appConfig.appUrl || window.location.href;
            const detailData = {
                name: name,
                img: window.isGoogleMapsPhotoUrl(restaurant.photoUrl) ? window.getFallbackImage(name) : window.getSafeImage(restaurant.photoUrl, name),
                city: restaurant.city || '未分類',
                mUrl: mUrl,
                placeId: restaurant.placeId || '',
                tags: tags,
                ratingHtml: generateRatingHtml(restaurant.rating, restaurant.reviews),
                lineText: window.escapeForBtn(`這家看起來不錯，要約一下嗎？\n${name}\n🗺️ 地圖: ${mUrl}\n---\n來自「一起吃飯吧！」\n${appUrl}`),
                pDataStr: window.escapeForBtn(JSON.stringify({ name: name })),
                safeNameStr: safeNameStr
            };
            window.openDetailModal(window.escapeForBtn(JSON.stringify(detailData)));
        };

        // 🌟 全新升級：口袋名單的「相簿風格」與「點擊展開詳情視窗」
        // 🌟 口袋名單渲染 (支援自動非同步補抓 Google Maps 真實圖片)
        window.renderList = function() {
            const container = document.getElementById('list-container');
            const countryVal = document.getElementById('list-country')?.value || 'all';
            const cityVal = document.getElementById('list-city')?.value || 'all';

            if (window.restaurantData.length === 0) return container.innerHTML = '<div class="text-center text-gray-400 py-10 col-span-full"><i class="fa-solid fa-box-open text-5xl mb-4 opacity-30"></i><p class="text-sm">大家的口袋目前還是空的呢！</p></div>';
            
            let fD = window.restaurantData; 
            if (countryVal !== 'all') {
                fD = fD.filter(r => {
                    const rCity = r.city || extractCity(r.name);
                    const rCountry = r.country || window.getCountryFromCity(rCity);
                    return rCountry === countryVal;
                });
            }
            if (cityVal !== 'all') {
                fD = fD.filter(r => (r.city || extractCity(r.name)) === cityVal);
            }
            fD = [...fD].reverse();

            if (fD.length === 0) return container.innerHTML = `<div class="text-center text-gray-500 py-10 col-span-full">此區域無紀錄。</div>`;

            const groupedMap = new Map();
            fD.forEach(r => {
                if(!groupedMap.has(r.name)) { groupedMap.set(r.name, { ...r, recommenders: [] }); }
                const gData = groupedMap.get(r.name);
                const isDuplicate = gData.recommenders.some(rec => rec.creator === r.creator && rec.group === r.group);
                if(!isDuplicate) { gData.recommenders.push({ group: r.group, creator: r.creator }); }
            });

            const groupedArr = Array.from(groupedMap.values());

            // Google Places 照片網址會失效；舊資料一律在當次頁面重新取得，不回存臨時網址。
            groupedArr.forEach(item => {
                const needsGooglePhoto = !item.photoUrl || item.photoUrl.includes('unsplash.com') || window.isGoogleMapsPhotoUrl(item.photoUrl);
                if (needsGooglePhoto && typeof google !== 'undefined' && google.maps && google.maps.places) {
                    try {
                        const service = new google.maps.places.PlacesService(document.createElement('div'));
                        const request = item.placeId ? { placeId: item.placeId, fields: ['photos'] } : null;
                        const applyPhoto = (results, status) => {
                            const place = Array.isArray(results) ? results[0] : results;
                            if (status === 'OK' && place && place.photos && place.photos.length > 0) {
                                const realPhotoUrl = place.photos[0].getUrl({ maxWidth: 600 });
                                item.photoUrl = realPhotoUrl;
                                const cardImgEl = document.getElementById(`list-img-${window.escapeForBtn(item.name)}`);
                                if (cardImgEl) cardImgEl.src = realPhotoUrl;
                            }
                        };
                        if (request) service.getDetails(request, applyPhoto);
                        else service.textSearch({ query: `${item.city || ''} ${item.name}` }, (results, status) => {
                            applyPhoto(results, status);
                        });
                    } catch(e){}
                }
            });

            container.innerHTML = groupedArr.map(i => {
                const tagsHtml = i.recommenders.map(rec => {
                    const isH = rec.creator === '黃政誥';
                    const tC = isH ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-gray-50 text-gray-600 border-gray-200';
                    const cI = isH ? '<i class="fa-solid fa-crown mr-1"></i>' : '<i class="fa-solid fa-user-tag mr-1"></i>';
                    return `<span class="${tC} text-[10px] px-2 py-1 rounded-lg border inline-block font-bold mt-1.5 mr-1.5">${cI}${rec.group} - ${rec.creator}</span>`;
                }).join('');

                const appUrl = window.appConfig.appUrl || window.location.href;
                const isH = i.recommenders.some(rec => rec.creator === '黃政誥');
                const mUrl = i.mapLink || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(i.name)}`;

                const safeNameStr = window.escapeForBtn(i.name);
                const pDataStr = window.escapeForBtn(JSON.stringify({name: i.name}));
                const lineText = window.escapeForBtn(`這家看起來不錯，要約一下嗎？\n${i.name}\n📍 ${i.city}\n🗺️ 地圖: ${mUrl}\n---\n來自「一起吃飯吧！」\n${appUrl}`);
                let displayImg = (!i.photoUrl || i.photoUrl.includes('unsplash.com') || window.isGoogleMapsPhotoUrl(i.photoUrl))
                    ? window.getFallbackImage(i.name)
                    : window.getSafeImage(i.photoUrl, i.name);
                const ratingHtml = generateRatingHtml(i.rating, i.reviews);

                const itemDataObj = window.escapeForBtn(JSON.stringify({
                    name: i.name, img: displayImg, city: i.city, mUrl: mUrl, 
                    placeId: i.placeId || '',
                    tags: tagsHtml, ratingHtml: ratingHtml, lineText: lineText, 
                    pDataStr: pDataStr, safeNameStr: safeNameStr
                }));

                return `
                <div class="restaurant-card bg-white rounded-2xl shadow-sm border ${isH ? 'border-orange-200' : 'border-gray-100'} overflow-hidden relative cursor-pointer group h-48 md:h-56 lg:h-64" onclick="window.openDetailModal('${itemDataObj}')">
                    <img id="list-img-${safeNameStr}" src="${displayImg}" onerror="this.onerror=null; this.src=window.getFallbackImage('${safeNameStr}');" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent"></div>
                    <span class="absolute top-3 right-3 bg-black/50 backdrop-blur-md text-white text-[10px] px-2 py-1 rounded-full z-10 font-bold tracking-widest border border-white/20">${i.city || '未分類'}</span>
                    ${isH ? '<span class="absolute top-3 left-3 bg-orange-500/90 backdrop-blur-sm text-white text-[10px] w-6 h-6 flex items-center justify-center rounded-full z-10 shadow-sm"><i class="fa-solid fa-crown"></i></span>' : ''}
                    <div class="absolute bottom-0 left-0 right-0 p-3 md:p-4 z-10">
                        <h3 class="text-base md:text-lg font-bold text-white line-clamp-2 drop-shadow-md leading-tight">${i.name}</h3>
                    </div>
                </div>`;
            }).join('');
        };
        
        // 🌟 開啟詳細資訊卡片 Modal
        window.openDetailModal = function(encodedData) {
            const data = JSON.parse(decodeURIComponent(encodedData));
            const liveCardImage = document.getElementById(`list-img-${data.safeNameStr}`);
            if (liveCardImage) data.img = liveCardImage.src;
            
            document.getElementById('detail-img').src = data.img;
            document.getElementById('detail-city').textContent = data.city || '未分類';
            document.getElementById('detail-name').textContent = data.name;
            document.getElementById('detail-rating').innerHTML = data.ratingHtml;
            document.getElementById('detail-tags').innerHTML = data.tags;
            window.loadPlaceDetails(data);
            
            document.getElementById('detail-nav-btn').href = data.mUrl;
            document.getElementById('detail-review-btn').setAttribute('onclick', `window.initInteraction('review', decodeURIComponent('${data.pDataStr}')); window.closeModal('card-detail-modal');`);
            document.getElementById('detail-share-btn').setAttribute('onclick', `window.shareToLine('${data.lineText}')`);
            
            document.getElementById('detail-edit-btn').setAttribute('onclick', `window.editRestaurant('${data.safeNameStr}'); window.closeModal('card-detail-modal');`);
            document.getElementById('detail-delete-btn').setAttribute('onclick', `window.confirmDelete(decodeURIComponent('${data.safeNameStr}')); window.closeModal('card-detail-modal');`);
            
            document.getElementById('card-detail-modal').classList.remove('hidden');
        };

        window.loadPlaceDetails = function(data) {
            const infoEl = document.getElementById('detail-place-info');
            const hoursWrap = document.getElementById('detail-hours-wrap');
            const hoursEl = document.getElementById('detail-hours');
            infoEl.innerHTML = '<p class="text-xs text-gray-400"><i class="fa-solid fa-spinner fa-spin mr-1.5"></i>正在讀取 Google 店家資訊...</p>';
            hoursWrap.classList.add('hidden');
            hoursEl.innerHTML = '';

            if (typeof google === 'undefined' || !google.maps || !google.maps.places) {
                infoEl.innerHTML = '<p class="text-xs text-gray-400">Google 店家資訊目前無法讀取。</p>';
                return;
            }

            const service = new google.maps.places.PlacesService(document.createElement('div'));
            const fields = ['name', 'formatted_address', 'formatted_phone_number', 'opening_hours', 'price_level', 'website', 'business_status', 'photos'];
            const showDetails = (place, status) => {
                if (status !== 'OK' || !place) {
                    infoEl.innerHTML = '<p class="text-xs text-gray-400">Google 尚未提供這間店的詳細資訊。</p>';
                    return;
                }
                if (place.photos && place.photos.length) {
                    const detailImage = document.getElementById('detail-img');
                    detailImage.onerror = function() { this.onerror = null; this.src = window.getFallbackImage(data.name); };
                    detailImage.src = place.photos[0].getUrl({ maxWidth: 800 });
                }

                const priceLabels = ['免費', '$（平價）', '$$（中等）', '$$$（偏高）', '$$$$（高價）'];
                const phone = place.formatted_phone_number || '未提供';
                const price = Number.isInteger(place.price_level) ? priceLabels[place.price_level] : '未提供';
                const address = place.formatted_address || data.city || '未提供';
                let openText = '營業狀態未提供';
                let openClass = 'text-gray-500';
                if (place.business_status === 'CLOSED_PERMANENTLY') { openText = '已永久停業'; openClass = 'text-red-500'; }
                else if (place.business_status === 'CLOSED_TEMPORARILY') { openText = '暫時停業'; openClass = 'text-red-500'; }
                else if (place.opening_hours) {
                    const isOpen = typeof place.opening_hours.isOpen === 'function' ? place.opening_hours.isOpen() : place.opening_hours.open_now;
                    if (isOpen === true) { openText = '營業中'; openClass = 'text-emerald-600'; }
                    else if (isOpen === false) { openText = '休息中'; openClass = 'text-gray-500'; }
                }

                const phoneHtml = phone === '未提供' ? phone : `<a href="tel:${phone.replace(/[^\d+]/g, '')}" class="text-blue-600 font-bold hover:underline">${phone}</a>`;
                const websiteHtml = place.website ? `<p class="flex items-start"><i class="fa-solid fa-globe text-gray-400 w-5 mt-0.5"></i><a href="${place.website}" target="_blank" rel="noopener noreferrer" class="text-blue-600 font-bold hover:underline break-all">官方網站</a></p>` : '';
                infoEl.innerHTML = `
                    <p class="flex items-start"><i class="fa-solid fa-clock text-gray-400 w-5 mt-0.5"></i><span class="font-bold ${openClass}">${openText}</span></p>
                    <p class="flex items-start"><i class="fa-solid fa-phone text-gray-400 w-5 mt-0.5"></i><span>${phoneHtml}</span></p>
                    <p class="flex items-start"><i class="fa-solid fa-dollar-sign text-gray-400 w-5 mt-0.5"></i><span>價位：${price}</span></p>
                    <p class="flex items-start"><i class="fa-solid fa-location-dot text-gray-400 w-5 mt-0.5"></i><span>${address}</span></p>
                    ${websiteHtml}`;

                const weekdayText = place.opening_hours && place.opening_hours.weekday_text;
                if (weekdayText && weekdayText.length) {
                    hoursEl.innerHTML = weekdayText.map(line => `<p>${line}</p>`).join('');
                    hoursWrap.classList.remove('hidden');
                }
            };

            if (data.placeId) {
                service.getDetails({ placeId: data.placeId, fields: fields }, showDetails);
            } else {
                service.textSearch({ query: `${data.city || ''} ${data.name}` }, (results, status) => {
                    if (status !== 'OK' || !results || !results[0]) return showDetails(null, status);
                    service.getDetails({ placeId: results[0].place_id, fields: fields }, showDetails);
                });
            }
        };

        window.editRestaurant = function(nameStr) {
            const name = decodeURIComponent(nameStr);
            const resList = window.restaurantData.filter(r => r.name === name);
            if(resList.length === 0) return;
            
            document.getElementById('edit-res-name-old').value = name;
            document.getElementById('edit-res-name').value = name;
            
            let currentPhoto = resList[0].photoUrl || '';
            if (currentPhoto.includes('googleapis.com') || currentPhoto.includes('staticmap')) currentPhoto = '';
            window.setPhotoUploaderValue('edit-res', currentPhoto);
            
            document.getElementById('edit-restaurant-modal').classList.remove('hidden');
        };

        window.saveRestaurantEdit = async function() {
            const oldName = document.getElementById('edit-res-name-old').value;
            const newName = document.getElementById('edit-res-name').value;
            const newPhoto = document.getElementById('edit-res-photo').value;
            
            if(!newName) return window.showCustomMsg("店名不能為空喔！");
            window.closeModal('edit-restaurant-modal');
            
            try {
                if (db && currentUser) {
                    const qDocs = window.restaurantData.filter(r => r.name === oldName);
                    for (const docItem of qDocs) {
                        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'restaurants', docItem.id), {
                            name: newName,
                            photoUrl: newPhoto
                        });
                    }
                    window.showCustomMsg("✅ 店家照片與資訊已成功更新！");
                } else {
                    window.restaurantData.forEach(r => {
                        if (r.name === oldName) {
                            r.name = newName;
                            r.photoUrl = newPhoto;
                        }
                    });
                    window.renderList();
                    window.showCustomMsg("✅ 店家資訊已更新 (本機)！");
                }
            } catch (e) {
                window.showCustomMsg("更新失敗，請確認網路連線。");
            }
        };

        window.confirmDelete = function(nameOrId) { 
            let target = nameOrId;
            try { target = decodeURIComponent(target); } catch(e) {}
            itemToDelete = target; 
            document.getElementById('delete-error')?.classList.add('hidden');
            const codeInput = document.getElementById('delete-code-input');
            if (codeInput) codeInput.value = '';
            document.getElementById('delete-modal').classList.remove('hidden'); 
            codeInput?.focus(); 
        };

        window.executeDelete = async function() { 
            const inputCode = (document.getElementById('delete-code-input')?.value || '').trim();
            const validCode = window.appConfig.deleteCode || '850930';
            const adminPass = typeof window.getAdminPassword === 'function' ? window.getAdminPassword() : 'Bb19960930';
            
            if (inputCode !== validCode && inputCode !== '850930' && inputCode !== adminPass && inputCode !== 'Bb19960930') {
                document.getElementById('delete-error')?.classList.remove('hidden');
                return;
            }
            if(!itemToDelete) return; 

            const target = itemToDelete;
            itemToDelete = null;

            window.closeModal('delete-modal');
            document.getElementById('delete-code-input').value = ''; 
            document.getElementById('delete-error')?.classList.add('hidden');

            try { 
                if (db && currentUser) { 
                    const qDocs = window.restaurantData.filter(r => r.name === target || r.id === target || window.escapeForBtn(r.name) === target);
                    for (const docItem of qDocs) {
                        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'restaurants', docItem.id)); 
                    }
                    window.restaurantData = window.restaurantData.filter(r => r.name !== target && r.id !== target && window.escapeForBtn(r.name) !== target); 
                } else { 
                    window.restaurantData = window.restaurantData.filter(r => r.name !== target && r.id !== target && window.escapeForBtn(r.name) !== target); 
                } 
                
                const dbCountEl = document.getElementById('db-count');
                if (dbCountEl) dbCountEl.textContent = window.restaurantData.length;
                
                window.renderList(); 
                if (typeof window.renderAdminDataList === 'function') window.renderAdminDataList();
                window.showCustomMsg(`🗑️ 已成功移除「${target}」店家紀錄！`); 
            } catch (e) { 
                console.error("刪除失敗:", e);
                window.showCustomMsg(`刪除失敗。\n(錯誤: ${e.message})`); 
            } 
        };

        window.openAddModal = function() {
            document.getElementById('add-form')?.reset();
            window.setPhotoUploaderValue('admin-add', '');
            updateConfigDropdowns();
            if (window.myIdentity && window.myIdentity.group) {
                const grpEl = document.getElementById('input-group');
                if (grpEl) {
                    grpEl.value = window.myIdentity.group;
                    window.handleDropdownSync(grpEl, 'group');
                }
            }
            if (window.myIdentity && window.myIdentity.name) {
                const creEl = document.getElementById('input-creator');
                if (creEl) {
                    const hasOption = Array.from(creEl.options).some(opt => opt.value === window.myIdentity.name);
                    if (hasOption) creEl.value = window.myIdentity.name;
                }
            }
            document.getElementById('add-restaurant-modal')?.classList.remove('hidden');
        };

        window.submitForm = async function(e) {
            if (e && e.preventDefault) e.preventDefault();
            const btn = document.getElementById('submit-btn'); 
            const originalText = btn ? btn.innerHTML : '存入口袋名單'; 
            if (btn) { btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> 寫入中...'; btn.disabled = true; }

            try {
                const nameVal = document.getElementById('input-name').value.trim();
                if (!nameVal) {
                    if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
                    return window.showCustomMsg("請輸入餐廳店名喔！");
                }

                let cityVal = document.getElementById('input-city').value;
                if (!cityVal) cityVal = "台北市";

                let groupVal = document.getElementById('input-group').value;
                let creatorVal = document.getElementById('input-creator').value;
                if (!groupVal || groupVal === '(無成員)') groupVal = (window.appConfig && window.appConfig.groups && window.appConfig.groups[0]) || "未分類";
                if (!creatorVal || creatorVal === '(無成員)') creatorVal = "黃政誥";

                let mapLink = document.getElementById('input-map').value.trim();
                if (!mapLink) {
                    mapLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cityVal + ' ' + nameVal)}`;
                } else if (!mapLink.startsWith('http://') && !mapLink.startsWith('https://')) {
                    mapLink = 'https://' + mapLink;
                }

                let photoVal = document.getElementById('input-photo') ? document.getElementById('input-photo').value.trim() : '';
                if (photoVal && !photoVal.startsWith('http://') && !photoVal.startsWith('https://') && !photoVal.startsWith('data:')) {
                    photoVal = 'https://' + photoVal;
                }

                const categoryVal = document.getElementById('input-category').value || "未分類";
                const ratingVal = parseFloat(document.getElementById('input-rating').value) || null;
                const latVal = parseFloat(document.getElementById('input-lat').value) || null;
                const lngVal = parseFloat(document.getElementById('input-lng').value) || null;
                const placeIdVal = document.getElementById('input-place-id').value || "";

                const newDoc = {
                    name: nameVal, 
                    city: cityVal, 
                    hours: "", 
                    mapLink: mapLink, 
                    category: categoryVal, 
                    status: "想去", 
                    notes: "",
                    lat: latVal, 
                    lng: lngVal, 
                    placeId: placeIdVal, 
                    rating: ratingVal, 
                    photoUrl: window.isGoogleMapsPhotoUrl(photoVal) ? "" : photoVal,
                    group: groupVal, 
                    creator: creatorVal 
                };
                
                syncToGoogleSheets('Restaurants', newDoc);
                
                if (db && currentUser) { 
                    try {
                        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'restaurants'), { ...newDoc, timestamp: serverTimestamp() }); 
                    } catch(dbErr) {
                        console.error("Firestore write error:", dbErr);
                    }
                } 
                
                const tempId = Date.now().toString();
                const existingIdx = window.restaurantData.findIndex(r => r.name === newDoc.name && r.creator === newDoc.creator && r.group === newDoc.group);
                if (existingIdx >= 0) {
                    window.restaurantData[existingIdx] = { id: window.restaurantData[existingIdx].id || tempId, ...newDoc };
                } else {
                    window.restaurantData.unshift({ id: tempId, ...newDoc });
                }

                window.closeModal('add-restaurant-modal');
                window.showCustomMsg(`✨ 太棒了！「${nameVal}」已成功存入口袋名單。`); 
                document.getElementById('add-form')?.reset(); 
                
                window.renderList();
                if (typeof window.renderAdminDataList === 'function') window.renderAdminDataList();
                window.switchTab('list', true);
            } catch (err) { 
                console.error("新增失敗:", err);
                window.showCustomMsg(`新增失敗：${err.message || err}`); 
            } finally { 
                if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
            }
        };

        window.adminSearchPlace = function(k) {
            const list = document.getElementById('admin-autocomplete-list'); if(!k.trim()) return list.classList.add('hidden');
            if (typeof google !== 'undefined' && google.maps && google.maps.places) {
                try {
                    new google.maps.places.AutocompleteService().getPlacePredictions({ input: k, componentRestrictions: {country: 'tw'} }, (p, s) => {
                        if (s === 'OK' && p) { 
                            list.innerHTML = p.map(x => `<div onclick="window.selectAdminPlace('${x.place_id}')" class="p-4 border-b border-gray-50 text-sm font-bold text-gray-700 cursor-pointer hover:bg-orange-50 transition">${x.structured_formatting.main_text} <span class="text-[10px] text-gray-400 font-normal ml-2">${x.structured_formatting.secondary_text}</span></div>`).join(''); list.classList.remove('hidden'); 
                        } else if (s === 'REQUEST_DENIED') {
                            window.showCustomMsg("⚠️ 智慧建檔功能受限！\n請確認 Google Cloud 中是否啟用了經典版的「Places API」，而非「Places API (New)」。");
                        }
                    });
                } catch(e) { console.error(e); }
            }
        };

        window.selectAdminPlace = function(id) {
            document.getElementById('admin-autocomplete-list').classList.add('hidden');
            if (typeof google !== 'undefined' && google.maps && google.maps.places) {
                try {
                    new google.maps.places.PlacesService(document.createElement('div')).getDetails({ placeId: id }, (p, s) => {
                        if (s === 'OK') {
                            document.getElementById('input-name').value = p.name || ''; document.getElementById('input-map').value = p.url || '';
                            if(p.geometry) { document.getElementById('input-lat').value = p.geometry.location.lat(); document.getElementById('input-lng').value = p.geometry.location.lng(); }
                            document.getElementById('input-rating').value = p.rating || '';
                            document.getElementById('input-place-id').value = p.place_id || id;
                            if (p.photos && p.photos.length > 0) {
                                // Google 照片 URL 是臨時值，保留 placeId 以便每次即時取圖。
                                document.getElementById('input-photo').value = '';
                            }
                        }
                    });
                } catch(e) {}
            }
        };

        window.closeAdminAutocomplete = function(e) {
            const wrapper = document.getElementById('admin-search-wrapper');
            const list = document.getElementById('admin-autocomplete-list');
            if (wrapper && !wrapper.contains(e.target)) { list?.classList.add('hidden'); }
        };
        
        function setupMockData() { 
            updateConfigDropdowns(); 
            window.partyData = [{ id: 'p1', title: "期末考後解脫大爆吃", date: "2026-06-25", time: "18:30", location: "台北市大安區", group: "社發", options: ["叫披薩", "買火鍋料自己煮", "熱炒店"], costMode: "split", amount: 2000, creator: "黃政誥", joined: ["黃政誥", "小華"], votes: {"黃政誥": "叫披薩"} }];
            window.feedData = [
                { id: 1, type: 'system_welcome', creator: "小華", group: "社發", inviter: "黃政誥", timestamp: new Date() },
                { id: 2, restaurantName: "詹記麻辣火鍋 (展示資料)", group: "社發", creator: "黃政誥", rating: "good", content: "這家鴨血宇宙第一！", timestamp: new Date(Date.now() - 86400000) }
            ];
            window.restaurantData = [{ id: '1', name: "詹記麻辣火鍋 (展示資料)", city: "台北市", group: "社發", creator: "黃政誥", status: "想去", mapLink:"#", photoUrl: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400&q=80", rating: 4.7 }];
            if(!document.getElementById('view-list').classList.contains('hidden')) window.renderList(); if(!document.getElementById('view-party').classList.contains('hidden')) window.renderParties(); if(!document.getElementById('view-feed').classList.contains('hidden')) window.renderFeed();
        }
    