/**
 * Discovery Resolver (src/services/discoveryResolver.js)
 * 
 * Manages external discovery information: official website links, verified social links,
 * food articles (such as Naver Blog entries for Korea), and official menu links.
 */
(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JiaDiscoveryResolver = api;
})(typeof window !== 'undefined' ? window : null, function(root) {
  'use strict';

  function createDiscoveryModel(init = {}) {
    return {
      officialWebsite: Array.isArray(init.officialWebsite) ? init.officialWebsite : (init.website ? [init.website] : []),
      officialSocial: Array.isArray(init.officialSocial) ? init.officialSocial : [],
      foodArticles: Array.isArray(init.foodArticles) ? init.foodArticles.slice(0, 5) : [],
      menuLinks: Array.isArray(init.menuLinks) ? init.menuLinks : (init.menuUrl ? [init.menuUrl] : []),
      lastResolvedAt: new Date().toISOString()
    };
  }

  function addFoodArticle(discoveryModel, article) {
    if (!discoveryModel || !article || !article.title || !article.sourceUrl) return discoveryModel;
    if (!Array.isArray(discoveryModel.foodArticles)) discoveryModel.foodArticles = [];
    
    // Deduplicate by URL
    if (!discoveryModel.foodArticles.some(a => a.sourceUrl === article.sourceUrl)) {
      discoveryModel.foodArticles.push({
        title: article.title,
        summary: article.summary || '',
        blogger: article.blogger || '',
        date: article.date || '',
        sourceUrl: article.sourceUrl,
        source: article.source || 'Naver Blog'
      });
      // Cap at 5 articles
      discoveryModel.foodArticles = discoveryModel.foodArticles.slice(0, 5);
    }
    return discoveryModel;
  }

  function evaluateArticleMatch(targetPlace, article, options = {}) {
    if (!targetPlace || !targetPlace.name || !article || !article.title) {
      return { confidence: 0, matchType: 'reject', canDisplay: false, reasons: ['Missing place or article data'] };
    }

    const normTargetName = String(targetPlace.name || '').toLowerCase().replace(/[\s\-_()（）[\]]/g, '');
    const normArticleTitle = String(article.title || '').toLowerCase().replace(/[\s\-_()（）[\]]/g, '');
    const normSummary = String(article.summary || '').toLowerCase().replace(/[\s\-_()（）[\]]/g, '');

    let score = 0;
    const reasons = [];

    // Exact name match in title
    if (normArticleTitle.includes(normTargetName)) {
      score += 0.75;
      reasons.push('Target store name found in article title');
    } else if (normSummary.includes(normTargetName)) {
      score += 0.50;
      reasons.push('Target store name found in article summary');
    }

    // District / Location term match in title or summary
    const district = String(targetPlace.district || targetPlace.city || '').toLowerCase().replace(/[\s\-_]/g, '');
    if (district && (normArticleTitle.includes(district) || normSummary.includes(district))) {
      score += 0.18;
      reasons.push('District/city match in article: ' + district);
    }

    // Address road keyword match
    const roadKeyword = String(targetPlace.roadAddress || targetPlace.address || '').split(' ')[1] || '';
    if (roadKeyword && roadKeyword.length >= 2 && (normArticleTitle.includes(roadKeyword) || normSummary.includes(roadKeyword))) {
      score += 0.12;
      reasons.push('Address keyword matched: ' + roadKeyword);
    }

    // Generic name check: if name is short/generic and no district match, apply penalty
    if (normTargetName.length <= 2 && (!district || !normSummary.includes(district))) {
      score = Math.min(score, 0.65);
      reasons.push('Generic store name penalty applied');
    }

    const confidence = Number(Math.min(1.0, score).toFixed(3));
    let matchType = 'reject';
    let canDisplay = false;

    if (confidence >= 0.90) {
      matchType = 'show';
      canDisplay = true;
    } else if (confidence >= 0.80) {
      matchType = 'review_pending';
      canDisplay = false;
    } else {
      matchType = 'reject';
      canDisplay = false;
    }

    return {
      confidence,
      matchType,
      canDisplay,
      reasons
    };
  }

  return {
    createDiscoveryModel,
    addFoodArticle,
    evaluateArticleMatch
  };
});
