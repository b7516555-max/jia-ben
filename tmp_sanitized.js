
        // import removed
        // import removed
        // import removed

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
        window.restaurantData = []; window.feedData = []; window.partyData = [];
        window.appConfig = { deleteCode: '850930', appUrl: '', groups: ['主揪', '玉泉', '屏東', '高雄', '台北', '老服', '社發'], creators: ['黃政誥'], membersMap: null }; 
        window.myIdentity = { group: '', name: '' }; 

        let pendingInteraction = null; let itemToDelete = null; let pendingPartyAction = null;
        const APP_PASSWORD = "19960930"; let isAdminUnlocked = false; let previousTab = 'explore';  

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

        window.handleDropdownSync = function(element, type) {
            if (type !== 'group') return; 
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

        window.switchTab = function(tabName) {
            if (document.getElementById('tab-' + tabName) && document.getElementById('tab-' + tabName).classList.contains('active')) return;
            ['explore', 'nearby', 'random', 'party', 'feed', 'list', 'admin', 'guide'].forEach(name => { document.getElementById('view-' + name)?.classList.add('hidden'); if(document.getElementById('tab-' + name)) document.getElementById('tab-' + name).classList.remove('active'); });
            document.getElementById('view-' + tabName)?.classList.remove('hidden'); if(document.getElementById('tab-' + tabName)) document.getElementById('tab-' + tabName).classList.add('active');
            if(tabName !== 'admin' && tabName !== 'guide') previousTab = tabName;
            if(tabName === 'list') window.renderList(); if(tabName === 'feed') window.renderFeed(); if(tabName === 'party') window.renderParties();
        };

        window.attemptAdminAccess = function(intentType = 'admin') {
            if (isAdminUnlocked) { if(intentType === 'admin') window.switchTab('admin'); else openInteractionModal(); } else { document.getElementById('password-modal').classList.remove('hidden'); document.getElementById('admin-password').focus(); }
        };
        
        window.verifyPassword = function() {
            if (document.getElementById('admin-password').value === APP_PASSWORD) { 
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
            const text = `💌 【一起吃飯吧！】發送了一張 VIP 邀請卡給您！\n\n嗨！我是黃政誥。這是一個專屬的美食探索與揪團神器。\n\n我們最近在用一個超酷的專屬美食社交 App，想邀請你加入我們的吃貨圈，看大家推薦了什麼好料，還能一起參加聚會喔！\n\n🔑 專屬通行碼請私訊向我索取！\n\n👇 點擊下方連結立即開啟大門：\n${url}`;
            window.shareToLine(encodeURIComponent(text));
        };

        window.requireIdentity = function(callback) {
            if (window.myIdentity.name !== '') { callback(); } else { pendingPartyAction = callback; document.getElementById('identity-modal').classList.remove('hidden'); updateConfigDropdowns(); }
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

            window.myIdentity = { name: nName, group: nGroup };
            
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
            const newCode = document.getElementById('new-del-code').value; const newUrl = document.getElementById('system-url').value;
            let codeToSave = window.appConfig.deleteCode;
            if(newCode && newCode.length >= 4) { codeToSave = newCode; } else if (newCode) { return window.showCustomMsg("新防護碼太短了，請設定4碼以上。"); }
            window.appConfig.deleteCode = codeToSave; window.appConfig.appUrl = newUrl;
            try {
                await window.saveConfigToCloud();
                document.getElementById('new-del-code').value = ''; window.showCustomMsg("⚙️ 系統進階設定更新成功！"); 
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

        window.initCreateParty = function() { pendingPartyAction = () => { document.getElementById('create-party-modal').classList.remove('hidden'); }; if(!isAdminUnlocked) window.attemptAdminAccess('party'); else pendingPartyAction(); };
        
        window.submitParty = async function(e) { 
            e.preventDefault(); 
            const btn = document.getElementById('btn-submit-party'); btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 發布中...'; btn.disabled = true; 
            const optionsArray = document.getElementById('party-options').value.split(',').map(s => s.trim()).filter(s => s); 
            if(optionsArray.length === 0) { btn.innerHTML = '正式發布邀請'; btn.disabled = false; return window.showCustomMsg("至少要提供一個選項喔！"); } 
            
            window.requireIdentity(async () => {
                const newParty = { 
                    title: document.getElementById('party-title').value, 
                    date: document.getElementById('party-date').value, 
                    time: document.getElementById('party-time').value, 
                    location: document.getElementById('party-location').value, 
                    group: window.myIdentity.group, 
                    options: optionsArray, 
                    costMode: document.getElementById('party-cost-mode').value, 
                    amount: parseFloat(document.getElementById('party-cost-amount').value) || 0, 
                    creator: window.myIdentity.name, 
                    joined: [window.myIdentity.name], 
                    votes: {} 
                }; 
                try { 
                    if (db && currentUser) { await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'parties'), { ...newParty, timestamp: serverTimestamp() }); } 
                    else { window.partyData.unshift({ id: Date.now().toString(), ...newParty }); window.renderParties(); } 
                    window.closeModal('create-party-modal'); document.getElementById('create-party-modal').querySelector('form').reset(); 
                    window.showCustomMsg('✨ 聚會邀請已發布！快去發 Line 叫大家投票！'); 
                } catch (err) { window.showCustomMsg('發布失敗。'); } finally { btn.innerHTML = '正式發布邀請'; btn.disabled = false; } 
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
                    <p class="flex items-center"><i class="fa-solid fa-location-dot text-orange-400 w-5 text-center mr-1"></i> <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.location)}" target="_blank" class="text-blue-500 hover:text-blue-700 transition font-bold" title="點擊導航">${p.location}</a></p></div>
                    <div class="bg-gray-50 p-4 rounded-2xl border border-gray-100 mb-4 flex-1"><div class="flex justify-between items-center mb-3"><p class="text-xs font-bold text-gray-500"><i class="fa-solid fa-check-to-slot mr-1 text-blue-500"></i>大家想做什麼？ (點擊投票)</p><span class="text-[10px] text-gray-400 bg-white px-2 py-0.5 border border-gray-200 rounded-full">總共 ${totalVotes} 票</span></div>${optionsHtml}</div>
                    <div class="flex items-center justify-between mt-auto pt-4 border-t border-gray-100 gap-2"><button onclick="window.shareToLine('${window.escapeForBtn(lineText)}')" class="w-10 h-10 bg-[#00B900] text-white rounded-xl flex items-center justify-center hover:bg-[#009900] transition shadow-sm flex-shrink-0"><i class="fa-brands fa-line text-2xl"></i></button><div class="flex-1 px-2 border-l border-gray-100"><p class="text-[10px] font-bold text-gray-400 mb-0.5"><i class="fa-solid fa-users mr-1"></i>已參加 (${joinCount})</p><p class="text-xs font-bold text-gray-700 line-clamp-1 leading-relaxed">${joinCount > 0 ? p.joined.join('、') : '還沒有人報名喔'}</p></div><button onclick="window.toggleJoinParty('${p.id}')" class="px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition whitespace-nowrap flex-shrink-0 ${isJoined ? 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-red-50 hover:text-red-500' : 'bg-orange-500 text-white hover:bg-orange-600'}">${isJoined ? '取消參加' : '算我一個！'}</button></div>
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

        window.searchGooglePlaces = function(vT) { 
            let k = ""; let cId = "";
            if (!window.getSearchPriceRange(vT)) return;
            if (vT === 'explore') {
                k = document.getElementById('explore-keyword').value; cId = 'explore-results-container'; 
                if (!k.trim()) return window.showCustomMsg("今天想吃點什麼呢？請告訴我吧！"); 
                document.getElementById(cId).innerHTML = `<div class="text-center text-orange-400 py-10 col-span-full"><i class="fa-brands fa-google fa-bounce text-4xl mb-3"></i><p class="font-bold tracking-widest text-sm mt-2">為您搜尋附近的美食...</p></div>`; 
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
            if (viewType !== 'explore' && viewType !== 'radar') return { min: null, max: null, active: false };
            const minValue = document.getElementById(`${viewType}-price-min`).value;
            const maxValue = document.getElementById(`${viewType}-price-max`).value;
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
        
        function extractCity(address) { const m = address ? address.match(/(基隆市|台北市|新北市|桃園市|新竹縣|新竹市|苗栗縣|台中市|彰化縣|南投縣|雲林縣|嘉義縣|嘉義市|台南市|高雄市|屏東縣|宜蘭縣|花蓮縣|台東縣|澎湖縣|金門縣|連江縣)/) : null; return m ? m[0] : '未分類'; }
        
        function generateRatingHtml(rating, reviews) { if(!rating) return `<span class="text-gray-400 text-[11px]">暫無評價</span>`; return `<span class="text-orange-500 font-bold text-[11px] bg-orange-50 px-1.5 py-0.5 rounded-lg flex items-center w-fit border border-orange-100"><i class="fa-solid fa-star text-[9px] mr-1"></i> ${parseFloat(rating).toFixed(1)} <span class="text-gray-500 text-[9px] ml-1 font-normal">(${reviews||0})</span></span>`; }
        
        function generatePlaceCardHtml(p) { 
            let rawImg = p.photos && p.photos.length > 0 ? p.photos[0].getUrl({maxWidth: 400}) : '';
            let img = window.getSafeImage(rawImg, p.name);
            
            const mUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name + ' ' + p.formatted_address)}`; 
            const cStr = extractCity(p.formatted_address); 
            const pDataStr = window.escapeForBtn(JSON.stringify({ name: p.name, placeId: p.place_id || '', mapLink: mUrl, lat: p.geometry.location.lat(), lng: p.geometry.location.lng(), rating: p.rating || 0, reviews: p.user_ratings_total || 0, photoUrl: '', city: cStr })); 
            
            let statusHtml = '';
            if (p.openStatus === 1) statusHtml = `<span class="bg-emerald-50 text-emerald-600 text-[9px] px-1.5 py-0.5 rounded-lg font-bold border border-emerald-100 shrink-0">營業中</span>`;
            else if (p.openStatus === -1) statusHtml = `<span class="bg-gray-100 text-gray-400 text-[9px] px-1.5 py-0.5 rounded-lg border border-gray-200 shrink-0">休息中</span>`;
            else statusHtml = `<span class="bg-blue-50 text-blue-500 text-[9px] px-1.5 py-0.5 rounded-lg border border-blue-100 shrink-0 font-medium" title="Google未提供營業時間">看地圖確認</span>`;
            const priceHtml = Number.isInteger(p.price_level)
                ? `<span class="bg-amber-50 text-amber-600 text-[9px] px-1.5 py-0.5 rounded-lg border border-amber-100 shrink-0 font-bold">${p.price_level === 0 ? '免費' : '$'.repeat(p.price_level)}</span>`
                : '';

            return `<div class="restaurant-card soft-card bg-white rounded-[24px] overflow-hidden flex flex-row md:flex-col h-28 md:h-auto relative transition">
                <div class="absolute top-2 left-2 bg-black/60 backdrop-blur-md text-white text-[9px] px-2 py-0.5 rounded-full z-10 font-bold tracking-widest"><i class="fa-solid fa-location-arrow mr-1"></i>${p.dist.toFixed(1)} km</div>
                <img src="${img}" onerror="this.onerror=null; this.src=window.getFallbackImage('${window.escapeForBtn(p.name)}');" class="w-28 md:w-full h-full md:h-36 object-cover shrink-0">
                <div class="p-3 md:p-4 flex-1 flex flex-col min-w-0">
                    <div>
                        <h3 class="text-sm md:text-base font-bold text-gray-800 truncate pr-8 md:pr-0">${p.name}</h3>
                        <div class="flex items-center gap-2 mt-1.5 flex-wrap">${generateRatingHtml(p.rating, p.user_ratings_total)} ${priceHtml} ${statusHtml}</div>
                    </div>
                    <div class="flex justify-between items-center mt-auto md:mt-3 pt-2 md:pt-3 border-t border-gray-50 flex-wrap gap-1.5 w-full">
                        <p class="text-[10px] md:text-xs text-gray-400 line-clamp-1 w-full pb-1 md:pb-2"><i class="fa-solid fa-location-dot mr-1"></i>${p.formatted_address}</p>
                        <a href="${mUrl}" target="_blank" class="w-full md:w-auto inline-flex items-center justify-center gap-1 bg-blue-50 text-blue-500 px-3 py-2 rounded-xl font-bold border border-blue-100 hover:bg-blue-500 hover:text-white transition text-[11px] shadow-sm tracking-wide shrink-0 whitespace-nowrap"><i class="fa-solid fa-map-location-dot"></i><span>導航</span></a>
                        <button onclick="window.initInteraction('save', decodeURIComponent('${pDataStr}'))" class="w-8 h-8 md:flex-1 md:w-auto shrink-0 bg-white text-orange-400 md:text-gray-600 md:font-bold md:bg-gray-50 rounded-full md:rounded-xl flex items-center justify-center hover:bg-orange-50 md:hover:bg-gray-100 md:hover:text-orange-500 transition border md:border-gray-200 border-transparent shadow-sm" title="收進口袋名單"><i class="fa-solid fa-heart md:hidden text-[11px]"></i><span class="hidden md:inline text-[11px]"><i class="fa-solid fa-heart mr-1"></i>收藏</span></button>
                    </div>
                </div>
            </div>`; 
        }
        
        function renderRandomResult(p) { 
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
            pendingInteraction = { type: type, placeData: pD }; window.attemptAdminAccess('interaction'); 
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
            window.selectIntRating('good'); 
            document.getElementById('interaction-modal').classList.remove('hidden'); 
        }

        window.confirmInteraction = async function() {
            if(!pendingInteraction) return; 
            const n = document.getElementById('int-notes').value; 
            const rV = document.getElementById('int-rating-value').value;
            
            window.closeModal('interaction-modal');

            window.requireIdentity(async () => {
                const g = window.myIdentity.group; 
                const c = window.myIdentity.name;
                const pType = pendingInteraction.type;
                const pData = { ...pendingInteraction.placeData };
                if (window.isGoogleMapsPhotoUrl(pData.photoUrl)) pData.photoUrl = '';
                pendingInteraction = null;

                try {
                    if(pType === 'review') {
                        if(db && currentUser) {
                            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'feed'), { restaurantName: pData.name, group: g, creator: c, rating: rV, content: n, timestamp: serverTimestamp() });
                            window.showCustomMsg(`✅ 評價已成功發布至雲端動態牆！`);
                        } else {
                            window.feedData.unshift({ id: Date.now().toString(), restaurantName: pData.name, group: g, creator: c, rating: rV, content: n, timestamp: {seconds: Date.now()/1000} });
                            window.renderFeed();
                            window.showCustomMsg(`⚠️ 雲端連線失敗，目前僅儲存於手機本機！`);
                        }
                        window.switchTab('feed');
                    } else {
                        if(db && currentUser) {
                            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'restaurants'), { ...pData, city: pData.city || "未分類", hours: "", category: "未分類", status: "想去", notes: n, group: g, creator: c, timestamp: serverTimestamp() });
                            window.showCustomMsg(`❤️ 感謝推薦！「${pData.name}」已成功收入雲端清單。`);
                        } else {
                            window.restaurantData.unshift({ id: Date.now().toString(), ...pData, city: pData.city || "未分類", hours: "", category: "未分類", status: "想去", notes: n, group: g, creator: c, timestamp: {seconds: Date.now()/1000} });
                            window.renderList();
                            window.showCustomMsg(`⚠️ 雲端連線失敗，目前僅將「${pData.name}」儲存於本機。`);
                        }
                    }
                } catch (e) {
                    console.error("寫入錯誤:", e);
                    window.showCustomMsg('❌ 儲存失敗！\n\n主揪請注意：這通常是因為 Firebase 的 Firestore 權限規則尚未開放。');
                }
            });
        };

        window.renderFeed = function() {
            const container = document.getElementById('feed-container'); if (window.feedData.length === 0) return container.innerHTML = '<div class="text-center text-gray-400 py-10 col-span-full"><i class="fa-solid fa-mug-hot text-5xl mb-4 opacity-30"></i><p class="text-sm font-medium">動態牆目前靜悄悄的...<br>去口袋名單挑一間店寫下心得吧！</p></div>';
            container.innerHTML = [...window.feedData].sort((a,b)=>(b.timestamp?.seconds||0)-(a.timestamp?.seconds||0)).map(item => {
                const dateStr = item.timestamp?.seconds ? new Date(item.timestamp.seconds * 1000).toLocaleDateString('zh-TW', {month:'short', day:'numeric'}) : '剛剛';
                if(item.type === 'system_welcome') {
                    return `<div class="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-3xl border border-blue-100 shadow-sm relative overflow-hidden h-full flex flex-col"><i class="fa-solid fa-party-horn text-blue-200 text-6xl absolute -right-2 -bottom-2 opacity-50 transform -rotate-12"></i><div class="relative z-10 flex items-start gap-3"><div class="w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center shadow-md shrink-0"><i class="fa-solid fa-hand-wave text-lg"></i></div><div><p class="text-[10px] text-blue-500 font-bold mb-0.5">系統廣播 · ${dateStr}</p><p class="text-sm text-gray-800 font-medium leading-relaxed">熱烈歡迎 <span class="font-bold text-blue-600">${item.creator}</span> 加入了 <span class="font-bold text-blue-600">${item.group}</span>！<br><span class="text-xs text-gray-500">(由 ${item.inviter} 帶路進來 🙌)</span></p></div></div></div>`;
                }
                const rB = item.rating === 'good' ? `<span class="bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-lg font-bold text-[10px] border border-emerald-100 shrink-0"><i class="fa-solid fa-thumbs-up mr-1"></i>推爆</span>` : `<span class="bg-red-50 text-red-600 px-2.5 py-1 rounded-lg font-bold text-[10px] border border-red-100 shrink-0"><i class="fa-solid fa-thumbs-down mr-1"></i>避雷</span>`;
                const isH = item.creator === '黃政誥'; const cC = isH ? "bg-white p-5 rounded-3xl shadow-sm host-highlight relative overflow-hidden h-full flex flex-col" : "bg-white p-5 rounded-3xl shadow-sm border border-gray-100 h-full flex flex-col hover:shadow-md transition";
                return `<div class="${cC}">${isH ? '<div class="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-orange-100 to-transparent rounded-bl-full opacity-50"></div>' : ''}<div class="flex justify-between items-start mb-3 relative z-10"><div class="flex items-center gap-3"><div class="w-10 h-10 ${isH ? 'bg-orange-100 border-2 border-orange-200' : 'bg-gray-100'} rounded-full flex items-center justify-center text-sm shrink-0"><i class="fa-solid ${isH?'fa-crown text-orange-500':'fa-user text-gray-400'}"></i></div><div class="min-w-0"><p class="text-sm font-bold text-gray-800 truncate">${item.creator}${isH ? `<span class="bg-orange-500 text-white text-[8px] px-1.5 py-0.5 rounded ml-1 font-bold shadow-sm inline-block">主揪</span>` : ''}</p><p class="text-[10px] text-gray-400 mt-0.5 truncate"><span class="bg-gray-100 px-1.5 py-0.5 rounded text-gray-500 mr-1">${item.group}</span> ${dateStr}</p></div></div>${rB}</div><div class="bg-white/80 p-4 rounded-2xl border border-gray-100 mt-auto shadow-sm backdrop-blur-sm relative z-10"><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.restaurantName)}" target="_blank" class="text-sm font-bold text-blue-600 hover:text-blue-700 mb-1.5 flex items-center transition" title="點擊導航"><i class="fa-solid fa-map-location-dot mr-1.5"></i>${item.restaurantName}</a><p class="text-sm text-gray-600 leading-relaxed">${item.content || '無文字心得喔！'}</p></div></div>`;
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
            const container = document.getElementById('list-container'); const sC = document.getElementById('filter-city').value;
            if (window.restaurantData.length === 0) return container.innerHTML = '<div class="text-center text-gray-400 py-10 col-span-full"><i class="fa-solid fa-box-open text-5xl mb-4 opacity-30"></i><p class="text-sm">大家的口袋目前還是空的呢！</p></div>';
            
            let fD = window.restaurantData; 
            if (sC !== 'all') fD = fD.filter(r => r.city === sC); 
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
            document.getElementById('edit-res-photo').value = currentPhoto;
            
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

        window.confirmDelete = function(name) { itemToDelete = name; document.getElementById('delete-modal').classList.remove('hidden'); document.getElementById('delete-code-input').focus(); };
        window.executeDelete = async function() { 
            if(document.getElementById('delete-code-input').value !== window.appConfig.deleteCode) return document.getElementById('delete-error').classList.remove('hidden'); 
            if(!itemToDelete) return; 

            window.closeModal('delete-modal');
            document.getElementById('delete-code-input').value = ''; 

            try { 
                if (db && currentUser) { 
                    const qDocs = window.restaurantData.filter(r => r.name === itemToDelete);
                    for (const docItem of qDocs) {
                        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'restaurants', docItem.id)); 
                    }
                } else { 
                    window.restaurantData = window.restaurantData.filter(r => r.name !== itemToDelete); 
                    window.renderList(); 
                } 
                window.showCustomMsg("🗑️ 已成功移除整筆店家紀錄。"); 
            } catch (e) { 
                console.error(e);
                window.showCustomMsg(`刪除失敗。\n(錯誤: ${e.message})`); 
            } 
            itemToDelete = null;
        };

        window.submitForm = async function(e) {
            e.preventDefault();
            const btn = document.getElementById('submit-btn'); const originalText = btn.innerHTML; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> 寫入中...'; btn.disabled = true;
            const group = document.getElementById('input-group').value; const creator = document.getElementById('input-creator').value;
            if(!group || !creator || creator === '(無成員)') { btn.innerHTML = originalText; btn.disabled = false; return window.showCustomMsg("請選擇有效的群組與推薦人！"); }

            const newDoc = {
                name: document.getElementById('input-name').value, city: document.getElementById('input-city').value, hours: "", mapLink: document.getElementById('input-map').value, category: document.getElementById('input-category').value, status: "想去", notes: "",
                lat: parseFloat(document.getElementById('input-lat').value) || null, lng: parseFloat(document.getElementById('input-lng').value) || null, placeId: document.getElementById('input-place-id').value || "", rating: parseFloat(document.getElementById('input-rating').value) || null, photoUrl: window.isGoogleMapsPhotoUrl(document.getElementById('input-photo').value) ? "" : (document.getElementById('input-photo').value || ""),
                group: group, creator: creator 
            };
            try {
                if (db && currentUser) { await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'restaurants'), { ...newDoc, timestamp: serverTimestamp() }); } 
                else { window.restaurantData.push({ id: Date.now().toString(), ...newDoc }); }
                window.showCustomMsg('✨ 太棒了！已存入美食庫。'); document.getElementById('add-form').reset(); window.switchTab('list');
            } catch (err) { window.showCustomMsg('新增失敗。'); } finally { btn.innerHTML = originalText; btn.disabled = false; }
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
    