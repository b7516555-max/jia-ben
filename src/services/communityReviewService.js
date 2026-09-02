/**
 * Community Review & Recommended Dishes Service (src/services/communityReviewService.js)
 * 
 * Manages Jia-ben Community Reviews, Average Spend contributions, and Recommended Dishes.
 * Rule: Community metrics are strictly community-contributed (never fabricated, blended with external APIs, or inferred from AI).
 */
(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JiaCommunityReviewService = api;
})(typeof window !== 'undefined' ? window : null, function(root) {
  'use strict';

  function createReviewRecord(init = {}) {
    const rawSpend = Number(init.spend);
    const validSpend = (Number.isFinite(rawSpend) && rawSpend >= 1 && rawSpend <= 100000) ? Math.round(rawSpend) : null;

    const rawRating = Number(init.rating);
    const validRating = (Number.isFinite(rawRating) && rawRating >= 1 && rawRating <= 5) ? rawRating : null;

    let dishes = [];
    if (Array.isArray(init.recommendedDishes)) {
      dishes = init.recommendedDishes
        .map(d => String(d || '').trim())
        .filter(d => d.length >= 1 && d.length <= 30);
    } else if (typeof init.recommendedDishes === 'string' && init.recommendedDishes.trim()) {
      dishes = init.recommendedDishes
        .split(/[,，、\n]+/)
        .map(d => d.trim())
        .filter(d => d.length >= 1 && d.length <= 30);
    }
    dishes = [...new Set(dishes)].slice(0, 10);

    const photos = Array.isArray(init.photos) ? init.photos.map(p => ({
      url: typeof p === 'string' ? p : p.url,
      caption: typeof p === 'object' ? p.caption || '' : '',
      isAiFallback: false,
      isCommunityPhoto: true,
      createdAt: new Date().toISOString()
    })).filter(p => p.url && p.url.startsWith('http')) : [];

    return {
      reviewId: init.reviewId || `rev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      jiaPlaceId: init.jiaPlaceId || '',
      userId: init.userId || '',
      userName: init.userName || '呷奔吃貨',
      rating: validRating,
      spend: validSpend,
      recommendedDishes: dishes,
      text: String(init.text || '').trim().slice(0, 1000),
      photos,
      visitDate: init.visitDate || new Date().toISOString().slice(0, 10),
      createdAt: init.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: init.status || 'approved'
    };
  }

  /**
   * Aggregate community stats for a place when a new review is added or reviews are recalculated
   */
  function aggregatePlaceCommunityStats(existingStats = {}, reviews = []) {
    const validReviews = Array.isArray(reviews) ? reviews.filter(r => r && r.status !== 'rejected') : [];

    // 1. Rating Aggregation
    const ratings = validReviews.map(r => Number(r.rating)).filter(r => Number.isFinite(r) && r >= 1 && r <= 5);
    const ratingCount = ratings.length;
    const ratingAverage = ratingCount > 0 ? Number((ratings.reduce((a, b) => a + b, 0) / ratingCount).toFixed(1)) : 0;

    // 2. Spend Aggregation (robust against 0 and extreme outliers)
    const spends = validReviews.map(r => Number(r.spend)).filter(s => Number.isFinite(s) && s >= 1 && s <= 100000);
    const spendCount = spends.length;
    let averageSpend = null;
    if (spendCount > 0) {
      const sum = spends.reduce((a, b) => a + b, 0);
      averageSpend = Math.round(sum / spendCount);
    }

    // 3. Recommended Dishes Aggregation
    const dishVoteMap = new Map();
    validReviews.forEach(r => {
      if (Array.isArray(r.recommendedDishes)) {
        r.recommendedDishes.forEach(dish => {
          const cleanDish = String(dish || '').trim();
          if (cleanDish) {
            dishVoteMap.set(cleanDish, (dishVoteMap.get(cleanDish) || 0) + 1);
          }
        });
      }
    });

    const recommendedDishes = [...dishVoteMap.entries()]
      .map(([name, votes]) => ({ name, votes }))
      .sort((a, b) => b.votes - a.votes)
      .slice(0, 10);

    // 4. Photos Aggregation
    let photoCount = 0;
    const communityPhotos = [];
    validReviews.forEach(r => {
      if (Array.isArray(r.photos)) {
        r.photos.forEach(p => {
          if (p.url && !p.isAiFallback) {
            communityPhotos.push(p);
            photoCount++;
          }
        });
      }
    });

    return {
      ratingAverage,
      ratingCount,
      averageSpend,
      spendCount,
      recommendedDishes,
      photoCount,
      communityPhotos: communityPhotos.slice(0, 20),
      lastContributionAt: new Date().toISOString()
    };
  }

  return {
    createReviewRecord,
    aggregatePlaceCommunityStats
  };
});
