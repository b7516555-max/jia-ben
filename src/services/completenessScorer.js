/**
 * Restaurant Completeness Scorer (src/services/completenessScorer.js)
 * 
 * Computes completeness score across 11 key fields.
 * Rule: AI fallback photos do NOT count as real photo completeness.
 */
(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JiaCompletenessScorer = api;
})(typeof window !== 'undefined' ? window : null, function(root) {
  'use strict';

  const FIELD_WEIGHTS = {
    address: 15,
    phone: 15,
    category: 10,
    openingHours: 10,
    website: 5,
    menu: 5,
    officialSocial: 5,
    averageSpend: 10,
    rating: 10,
    recommendedDishes: 10,
    realPhoto: 5
  };

  function computeCompleteness(place = {}) {
    if (!place) return { score: 0, fieldStatus: {}, missingFields: Object.keys(FIELD_WEIGHTS) };

    const fieldStatus = {};
    const missingFields = [];
    let totalScore = 0;

    // 1. Address: must be complete street address (not placeholder)
    const rawAddr = String(place.address || '').trim();
    const isRealAddress = Boolean(rawAddr && !rawAddr.startsWith('📍') && !rawAddr.includes('尚無完整門牌') && rawAddr.length >= 5);
    fieldStatus.address = isRealAddress;
    if (isRealAddress) totalScore += FIELD_WEIGHTS.address; else missingFields.push('address');

    // 2. Phone: valid phone number
    const rawPhone = String(place.phone || '').trim();
    const hasPhone = Boolean(rawPhone && rawPhone.length >= 7);
    fieldStatus.phone = hasPhone;
    if (hasPhone) totalScore += FIELD_WEIGHTS.phone; else missingFields.push('phone');

    // 3. Category: controlled category
    const hasCategory = Boolean((Array.isArray(place.categories) && place.categories.length > 0 && place.categories[0] !== '未分類') || (place.category && place.category !== '未分類'));
    fieldStatus.category = hasCategory;
    if (hasCategory) totalScore += FIELD_WEIGHTS.category; else missingFields.push('category');

    // 4. Opening Hours: non-empty string or object
    const rawHours = place.openingHours || place.hours;
    const hasHours = Boolean(typeof rawHours === 'string' ? rawHours.trim() : (rawHours && Object.keys(rawHours).length > 0));
    fieldStatus.openingHours = hasHours;
    if (hasHours) totalScore += FIELD_WEIGHTS.openingHours; else missingFields.push('openingHours');

    // 5. Website: official website url
    const rawWeb = String(place.website || place.url || '').trim();
    const hasWebsite = Boolean(rawWeb && rawWeb.startsWith('http'));
    fieldStatus.website = hasWebsite;
    if (hasWebsite) totalScore += FIELD_WEIGHTS.website; else missingFields.push('website');

    // 6. Menu: menu url
    const rawMenu = String(place.menuUrl || place.menu || '').trim();
    const hasMenu = Boolean(rawMenu && rawMenu.startsWith('http'));
    fieldStatus.menu = hasMenu;
    if (hasMenu) totalScore += FIELD_WEIGHTS.menu; else missingFields.push('menu');

    // 7. Official Social: Facebook/Instagram/Threads
    const social = place.officialSocial || {};
    const hasSocial = Boolean(social.facebook || social.instagram || social.threads);
    fieldStatus.officialSocial = hasSocial;
    if (hasSocial) totalScore += FIELD_WEIGHTS.officialSocial; else missingFields.push('officialSocial');

    // 8. Average Spend: community average spend > 0
    const rawSpend = Number(place.communityStats?.averageSpend ?? place.averageSpend ?? 0);
    const hasSpend = Boolean(Number.isFinite(rawSpend) && rawSpend > 0);
    fieldStatus.averageSpend = hasSpend;
    if (hasSpend) totalScore += FIELD_WEIGHTS.averageSpend; else missingFields.push('averageSpend');

    // 9. Rating: rating > 0
    const rawRating = Number(place.communityStats?.ratingAverage ?? place.rating ?? 0);
    const hasRating = Boolean(Number.isFinite(rawRating) && rawRating > 0);
    fieldStatus.rating = hasRating;
    if (hasRating) totalScore += FIELD_WEIGHTS.rating; else missingFields.push('rating');

    // 10. Recommended Dishes: non-empty recommended dishes array
    const dishes = place.recommendedDishes || place.communityStats?.recommendedDishes;
    const hasDishes = Boolean(Array.isArray(dishes) && dishes.length > 0);
    fieldStatus.recommendedDishes = hasDishes;
    if (hasDishes) totalScore += FIELD_WEIGHTS.recommendedDishes; else missingFields.push('recommendedDishes');

    // 11. Real Photo: verified non-AI photo
    const hasRealPhoto = Boolean(
      (Array.isArray(place.photos) && place.photos.some(p => p && !p.isAiFallback && !p.url?.includes('unsplash.com'))) ||
      (place.coverPhoto && !place.coverPhoto.isAiFallback && !place.coverPhoto.url?.includes('unsplash.com'))
    );
    fieldStatus.realPhoto = hasRealPhoto;
    if (hasRealPhoto) totalScore += FIELD_WEIGHTS.realPhoto; else missingFields.push('realPhoto');

    return {
      score: totalScore,
      percentage: `${totalScore}%`,
      fieldStatus,
      missingFields
    };
  }

  return {
    FIELD_WEIGHTS,
    computeCompleteness
  };
});
