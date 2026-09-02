/**
 * Review Resolver (src/services/reviewResolver.js)
 * 
 * Manages separate review models across Jia-ben Community, Foursquare, Yelp (disabled), and other sources.
 * Strictly maintains Jia-ben Community ratings separate from third-party ratings (NO averaging).
 * Enforces review matching safety: confidence >= 0.93 auto-attach, 0.85-0.929 review required, <0.85 reject.
 */
(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JiaReviewResolver = api;
})(typeof window !== 'undefined' ? window : null, function(root) {
  'use strict';

  function createReviewModel(init = {}) {
    return {
      jiaBen: {
        rating: Number(init.jiaBen?.rating ?? init.rating ?? 0),
        count: Number(init.jiaBen?.count ?? init.ratingCount ?? 0)
      },
      foursquare: {
        enabled: Boolean(init.foursquare?.rating || init.foursquare?.providerPlaceId),
        providerPlaceId: init.foursquare?.providerPlaceId || null,
        rating: Number(init.foursquare?.rating) || null, // e.g. 8.6 / 10
        count: Number(init.foursquare?.count) || null,
        tips: Array.isArray(init.foursquare?.tips) ? init.foursquare.tips.slice(0, 3) : [],
        attribution: 'Foursquare Places'
      },
      yelp: {
        enabled: false,
        rating: null,
        count: null,
        attribution: 'Yelp'
      },
      naverBlog: {
        enabled: Boolean(init.naverBlog?.articleCount),
        articleCount: Number(init.naverBlog?.articleCount || 0),
        attribution: 'NAVER Blog'
      }
    };
  }

  /**
   * Safely attaches external review metadata if match confidence is high enough
   */
  function attachExternalReview(reviewModel, provider, reviewData, matchConfidence = 0) {
    if (!reviewModel || !provider || !reviewData) return reviewModel;

    // Hard safety threshold: < 0.85 Reject
    if (matchConfidence < 0.85) {
      return reviewModel;
    }

    const needsReview = matchConfidence < 0.93;

    if (provider === 'foursquare') {
      reviewModel.foursquare = {
        enabled: true,
        providerPlaceId: reviewData.providerPlaceId || reviewData.sourceId || null,
        rating: Number(reviewData.rating) || null,
        count: Number(reviewData.ratingCount || reviewData.count) || null,
        tips: Array.isArray(reviewData.tips) ? reviewData.tips.slice(0, 3) : [],
        needsReview,
        confidence: matchConfidence,
        attribution: 'Foursquare Places'
      };
    } else if (provider === 'naver_blog') {
      reviewModel.naverBlog = {
        enabled: true,
        articleCount: Number(reviewData.totalCount || reviewData.articleCount || 0),
        needsReview,
        confidence: matchConfidence,
        attribution: 'NAVER Blog'
      };
    }

    return reviewModel;
  }

  /**
   * Formats external review ratings for UI display
   */
  function formatReviewSummary(reviewModel) {
    if (!reviewModel) return [];
    const items = [];

    // 1. Jia-ben Community
    if (reviewModel.jiaBen && reviewModel.jiaBen.rating > 0) {
      items.push({
        source: 'Jia-ben',
        badge: `⭐ ${reviewModel.jiaBen.rating.toFixed(1)} · ${reviewModel.jiaBen.count} 則`,
        isJiaBen: true
      });
    }

    // 2. Foursquare
    if (reviewModel.foursquare?.enabled && reviewModel.foursquare.rating) {
      items.push({
        source: 'Foursquare',
        badge: `${reviewModel.foursquare.rating.toFixed(1)} / 10`,
        tipsCount: reviewModel.foursquare.tips?.length || 0,
        attribution: reviewModel.foursquare.attribution
      });
    }

    // 3. Naver Blog articles
    if (reviewModel.naverBlog?.enabled && reviewModel.naverBlog.articleCount > 0) {
      items.push({
        source: 'Naver Blog',
        badge: `${reviewModel.naverBlog.articleCount} 篇相關食記`,
        isArticle: true,
        attribution: reviewModel.naverBlog.attribution
      });
    }

    return items;
  }

  return {
    createReviewModel,
    attachExternalReview,
    formatReviewSummary
  };
});
