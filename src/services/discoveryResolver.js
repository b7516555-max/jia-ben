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

  return {
    createDiscoveryModel,
    addFoodArticle
  };
});
