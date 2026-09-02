/**
 * Naver Blog Discovery Adapter (src/providers/naverBlogAdapter.js)
 * 
 * South Korea Discovery / Food Article provider using Naver Search Blog API (네이버 블로그 검색).
 * NOTE: Naver Blog is strictly categorized as DISCOVERY / FOOD ARTICLE, NOT 5-star reviews.
 * Returns: title, summary, blogger, postdate, sourceUrl, totalCount.
 */
(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.JiaProviderAdapters = root.JiaProviderAdapters || {};
    root.JiaProviderAdapters.naverBlog = api;
  }
})(typeof window !== 'undefined' ? window : null, function(root) {
  'use strict';

  function stripHtml(str) {
    return String(str || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  }

  function normalizeArticle(item) {
    if (!item) return null;
    return {
      title: stripHtml(item.title),
      summary: stripHtml(item.description),
      blogger: item.bloggername || '',
      date: item.postdate || '',
      sourceUrl: item.link || '',
      source: 'Naver Blog'
    };
  }

  async function searchArticles(place) {
    if (!place || !place.name) return { articles: [], totalCount: 0 };
    if (!root?.JIA_ENRICHMENT_PROXY_URL) return { status: 'disabled_no_proxy', articles: [], totalCount: 0 };

    try {
      const response = await fetch(root.JIA_ENRICHMENT_PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'enrich_place',
          provider: 'naver_blog',
          place: {
            name: place.name,
            address: place.address
          }
        })
      });

      if (!response.ok) return { status: 'provider_error', articles: [], totalCount: 0 };
      const data = await response.json();
      if (data && data.status === 'success') {
        const rawItems = Array.isArray(data.items) ? data.items : [];
        const articles = rawItems.slice(0, 5).map(normalizeArticle).filter(Boolean);
        return {
          status: 'success',
          articles,
          totalCount: Number(data.total || articles.length),
          attribution: 'NAVER Blog Search'
        };
      }
      return { status: data.status || 'no_articles', articles: [], totalCount: 0 };
    } catch (err) {
      console.warn('[NaverBlogAdapter] Search error:', err);
      return { status: 'error', articles: [], totalCount: 0, message: err.toString() };
    }
  }

  return {
    normalizeArticle,
    searchArticles,
    stripHtml
  };
});
