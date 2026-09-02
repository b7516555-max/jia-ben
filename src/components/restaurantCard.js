(function () {
    'use strict';

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function escapeForBtn(str) {
        if (!str) return '';
        return encodeURIComponent(String(str));
    }

    function getFallbackImage(name) {
        if (typeof window !== 'undefined' && typeof window.getFallbackImage === 'function') {
            return window.getFallbackImage(name);
        }
        return './assets/place-placeholder.svg';
    }

    /**
     * Unified Place Photo Selector (遵循 Priority: coverPhoto > communityPhotos > linkedFeedPhoto > safePhoto > placeholder)
     */
    function selectBestPlacePhoto(place, defaultPlaceholder = './assets/place-placeholder.svg') {
        if (typeof window !== 'undefined' && window.imageSafety?.selectImage) {
            return window.imageSafety.selectImage(place, defaultPlaceholder);
        }
        if (place?.coverPhoto) return { url: place.coverPhoto, isPlaceholder: false, source: 'coverPhoto' };
        if (place?.communityPhotos && place.communityPhotos.length > 0) {
            return { url: place.communityPhotos[0], isPlaceholder: false, source: 'communityPhotos' };
        }
        if (place?.photos && place.photos.length > 0) {
            const raw = typeof place.photos[0] === 'string' ? place.photos[0] : (place.photos[0].getUrl ? place.photos[0].getUrl({ maxWidth: 800 }) : '');
            if (raw && (raw.includes('googleusercontent.com') || (!raw.includes('googleapis.com') && !raw.includes('staticmap')))) {
                return { url: raw, isPlaceholder: false, source: 'safePhoto' };
            }
        }
        return { url: defaultPlaceholder, isPlaceholder: true, source: 'placeholder' };
    }

    function formatDistance(distanceKm) {
        if (distanceKm == null || !Number.isFinite(distanceKm)) return '';
        if (distanceKm < 1) {
            return `${Math.round(distanceKm * 1000)} m`;
        }
        return `${distanceKm.toFixed(1)} km`;
    }

    /**
     * Single View Model Builder for Restaurant Cards
     */
    function buildRestaurantCardViewModel(place = {}, options = {}) {
        const name = place.name || '未命名餐廳';
        const imageInfo = selectBestPlacePhoto(place);
        const distKm = options.distanceKm != null ? options.distanceKm : (place._distKm != null ? place._distKm : (place.dist != null ? place.dist : null));
        
        const stats = place.communityStats || {};
        const ratingAvg = Number(stats.ratingAverage || 0);
        const ratingCount = Number(stats.ratingCount || 0);
        const avgSpend = Number(stats.averageSpend || 0);
        const spendCount = Number(stats.spendCount || 0);
        
        const categories = Array.isArray(place.categories) && place.categories.length > 0 ? place.categories : (place.category ? [place.category] : []);
        const address = place.address || place.formatted_address || (place.city ? `${place.city} ${place.district || ''}` : '') || '';
        const recommenders = options.recommenders || place.recommenders || [];

        return {
            id: place.jiaPlaceId || place.id || '',
            name,
            safeName: escapeForBtn(name),
            photoUrl: imageInfo.url || getFallbackImage(name),
            isPlaceholder: imageInfo.isPlaceholder,
            distanceKm: distKm,
            distanceFormatted: formatDistance(distKm),
            ratingAvg,
            ratingCount,
            hasRating: ratingAvg > 0 && ratingCount > 0,
            avgSpend: avgSpend > 0 ? Math.round(avgSpend) : 0,
            spendCount,
            categories,
            primaryCategory: categories[0] || '',
            address,
            recommenders,
            city: place.city || ''
        };
    }

    /**
     * Render Restaurant Card 2.0 (全站標準卡片：找餐廳 / 搜尋 / 探索清單 / 口袋名單)
     * 結構遵循：
     * ┌──────────────────────┐
     * │      Photo (16:9)    │
     * ├──────────────────────┤
     * │ 店家名稱              │
     * │ ★ 4.5 · 12 則 · 1.2km│
     * │ 日式料理 · 燒肉       │
     * │ 約 NT$450 / 人        │
     * └──────────────────────┘
     */
    function render(place = {}, options = {}) {
        const vm = buildRestaurantCardViewModel(place, options);

        // 距離 Badge (浮動於圖片左上)
        const distBadgeHtml = vm.distanceFormatted
            ? `<div class="absolute top-2.5 left-2.5 bg-black/65 backdrop-blur-md text-white text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full z-10 font-black tracking-wide border border-white/20 shadow-sm flex items-center gap-1"><i class="fa-solid fa-location-arrow text-orange-400"></i><span>${vm.distanceFormatted}</span></div>`
            : '';

        // 示意圖 Badge (降低視覺權重，小巧低調)
        const placeholderBadgeHtml = vm.isPlaceholder
            ? `<span class="absolute top-2.5 right-2.5 z-10 bg-black/40 backdrop-blur-xs text-white/80 text-[9px] font-medium px-1.5 py-0.5 rounded border border-white/10">示意圖</span>`
            : '';

        // 評分與評價數 (只呈現真實 Jia-ben 社群統計，無資料不偽造)
        let ratingHtml = '';
        if (vm.hasRating) {
            ratingHtml = `<span class="text-orange-500 font-black text-xs bg-orange-50 px-2 py-0.5 rounded-lg border border-orange-200/80 inline-flex items-center gap-1 shadow-2xs"><i class="fa-solid fa-star text-amber-400 text-[10px]"></i><span>${vm.ratingAvg.toFixed(1)}</span><span class="text-gray-400 text-[10px] font-normal">(${vm.ratingCount} 則)</span></span>`;
        } else {
            ratingHtml = `<span class="text-gray-400 text-[11px] font-medium bg-gray-50 px-2 py-0.5 rounded-lg border border-gray-100">暫無 Jia-ben 評分</span>`;
        }

        // 分類標籤
        const catBadgeHtml = vm.primaryCategory
            ? `<span class="bg-gray-100 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-md truncate max-w-[120px]">${escapeHtml(vm.primaryCategory)}</span>`
            : (vm.city ? `<span class="bg-gray-100 text-gray-500 text-[10px] font-bold px-2 py-0.5 rounded-md">${escapeHtml(vm.city)}</span>` : '');

        // 平均每人消費 (若有資料才顯示)
        let priceHtml = '';
        if (vm.avgSpend > 0) {
            priceHtml = `<span class="text-emerald-700 font-bold text-[11px] bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200/80 inline-flex items-center gap-1"><i class="fa-solid fa-coins text-emerald-500 text-[10px]"></i><span>約 NT$${vm.avgSpend} / 人</span></span>`;
        }

        // 地址摘要 (單行 ellipsis)
        const addressHtml = vm.address
            ? `<p class="text-[11px] text-gray-500 truncate mt-1 flex items-center gap-1 leading-snug"><i class="fa-solid fa-location-dot text-orange-400 text-[10px] shrink-0"></i><span class="truncate">${escapeHtml(vm.address)}</span></p>`
            : '';

        // 推薦者 (若有)
        let recBadgeHtml = '';
        if (vm.recommenders.length > 0) {
            const firstRec = vm.recommenders[0];
            recBadgeHtml = `<div class="mt-1.5 flex items-center gap-1 overflow-hidden"><span class="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.2 rounded font-bold truncate max-w-full"><i class="fa-solid fa-user-check mr-1 text-[9px]"></i>${escapeHtml(firstRec.creator || firstRec.name || '成員')}${vm.recommenders.length > 1 ? ` 等 ${vm.recommenders.length} 人` : ''} 推薦</span></div>`;
        }

        return `
        <div class="restaurant-card group bg-white rounded-2xl md:rounded-3xl shadow-xs hover:shadow-lg border border-gray-100 hover:border-orange-200 overflow-hidden cursor-pointer transition-all duration-300 flex flex-col h-full active:scale-[0.98]" onclick="window.openRestaurantDetailByName('${vm.safeName}')">
            <div class="relative aspect-[16/10] sm:aspect-[16/9] w-full overflow-hidden bg-gray-100 shrink-0">
                <img src="${vm.photoUrl}" onerror="this.onerror=null; this.src=window.getFallbackImage ? window.getFallbackImage('${vm.safeName}') : './assets/place-placeholder.svg';" alt="${escapeHtml(vm.name)}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy">
                <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
                ${distBadgeHtml}
                ${placeholderBadgeHtml}
                <div class="absolute bottom-2 left-3 right-3 flex items-end justify-between gap-1 z-10">
                    <h3 class="text-sm sm:text-base font-black text-white drop-shadow-md line-clamp-1 leading-snug tracking-tight">${escapeHtml(vm.name)}</h3>
                </div>
            </div>
            <div class="p-3.5 sm:p-4 flex-1 flex flex-col justify-between bg-white min-h-[110px]">
                <div class="space-y-1.5">
                    <div class="flex items-center justify-between gap-1.5 flex-wrap">
                        ${ratingHtml}
                        ${catBadgeHtml}
                    </div>
                    ${priceHtml ? `<div>${priceHtml}</div>` : ''}
                    ${addressHtml}
                    ${recBadgeHtml}
                </div>
                <div class="mt-2.5 pt-2 border-t border-gray-50 flex items-center justify-between">
                    <span class="text-[11px] font-bold text-orange-600 group-hover:text-orange-700 flex items-center gap-1 transition">
                        查看詳情 <i class="fa-solid fa-chevron-right text-[9px] transition-transform group-hover:translate-x-0.5"></i>
                    </span>
                    <button type="button" onclick="event.stopPropagation(); window.openAddModal ? window.openAddModal({ name: '${vm.safeName}' }) : null;" class="w-7 h-7 rounded-lg bg-orange-50 hover:bg-orange-500 text-orange-500 hover:text-white flex items-center justify-center text-xs transition shadow-2xs" title="存入口袋名單">
                        <i class="fa-solid fa-heart"></i>
                    </button>
                </div>
            </div>
        </div>`;
    }

    /**
     * Render Wheel Winning Result Card 2.0
     */
    function renderWheelWinner(place = {}, options = {}) {
        const vm = buildRestaurantCardViewModel(place, options);

        return `
        <div class="restaurant-card bg-white rounded-3xl shadow-xl border-2 border-orange-300 overflow-hidden cursor-pointer group hover:border-orange-400 transition-all flex flex-col sm:flex-row items-stretch min-h-[180px] w-full" onclick="window.openRestaurantDetailByName('${vm.safeName}')">
            <div class="relative h-40 sm:h-auto sm:w-48 shrink-0 overflow-hidden bg-gray-100">
                <img src="${vm.photoUrl}" onerror="this.onerror=null; this.src=window.getFallbackImage ? window.getFallbackImage('${vm.safeName}') : './assets/place-placeholder.svg';" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105">
                ${vm.distanceFormatted ? `<div class="absolute top-2.5 left-2.5 bg-black/70 backdrop-blur-xs text-white text-[10px] px-2.5 py-0.5 rounded-full font-black shadow-sm"><i class="fa-solid fa-location-arrow mr-1 text-orange-400"></i>${vm.distanceFormatted}</div>` : ''}
                ${vm.isPlaceholder ? `<span class="absolute top-2.5 right-2.5 bg-black/40 text-white/80 text-[9px] font-medium px-1.5 py-0.5 rounded">示意圖</span>` : ''}
            </div>
            <div class="p-4 flex-1 flex flex-col justify-between min-w-0 bg-white">
                <div>
                    <div class="flex items-start justify-between gap-1 mb-1">
                        <h3 class="text-base sm:text-lg font-black text-gray-900 line-clamp-1 leading-snug tracking-tight">${escapeHtml(vm.name)}</h3>
                        <span class="bg-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 shadow-2xs">命運推薦</span>
                    </div>
                    ${vm.address ? `<p class="text-xs text-gray-500 line-clamp-1 mb-2 leading-relaxed"><i class="fa-solid fa-location-dot text-orange-400 mr-1"></i>${escapeHtml(vm.address)}</p>` : ''}
                    <div class="flex items-center gap-2 flex-wrap">
                        ${vm.hasRating ? `<span class="text-orange-500 font-bold text-xs bg-orange-50 px-2 py-0.5 rounded-lg border border-orange-100 flex items-center gap-1"><i class="fa-solid fa-star text-amber-400 text-[10px]"></i>${vm.ratingAvg.toFixed(1)} (${vm.ratingCount} 則)</span>` : '<span class="text-gray-400 text-xs bg-gray-50 px-2 py-0.5 rounded-lg">暫無 Jia-ben 評分</span>'}
                        ${vm.avgSpend > 0 ? `<span class="text-emerald-700 font-bold text-xs bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200 flex items-center gap-1"><i class="fa-solid fa-coins text-emerald-500 text-[10px]"></i>約 NT$${vm.avgSpend} / 人</span>` : ''}
                    </div>
                </div>
                <div class="flex items-center justify-between gap-2 pt-3 mt-2 border-t border-gray-100">
                    <span class="text-xs text-gray-400">點擊查看詳情與導航</span>
                    <span class="text-xs font-bold text-white bg-orange-500 px-3.5 py-1.5 rounded-xl shadow-xs group-hover:bg-orange-600 transition flex items-center gap-1">
                        查看店家 <i class="fa-solid fa-chevron-right text-[9px]"></i>
                    </span>
                </div>
            </div>
        </div>`;
    }

    const RestaurantCard = {
        render,
        renderWheelWinner,
        selectBestPlacePhoto,
        selectImage: selectBestPlacePhoto,
        buildRestaurantCardViewModel,
        formatDistance,
        escapeHtml,
        escapeForBtn
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = RestaurantCard;
    }
    if (typeof window !== 'undefined') {
        window.JiaRestaurantCard = RestaurantCard;
    }
})();
