(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.JiaReviewService = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const LEGACY_RATINGS = { good: 5, tasty: 4, nice: 4, fair: 3, poor: 2, awful: 1, bad: 1 };
  const LIMIT = 2000;
  const text = value => value == null ? '' : String(value);
  const timeValue = value => {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    if (value.toDate) return value.toDate().getTime();
    if (value.seconds) return Number(value.seconds) * 1000;
    const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : 0;
  };
  function ratingNumber(raw) {
    const value = typeof raw === 'object' ? (raw.ratingValue ?? raw.ratingNumeric ?? raw.rating) : raw;
    if (typeof value === 'string' && LEGACY_RATINGS[value]) return LEGACY_RATINGS[value];
    const number = Number(value);
    return Number.isFinite(number) && number >= 1 && number <= 5 ? number : null;
  }
  function normalize(raw = {}, options = {}) {
    const source = raw.source || (raw.restaurantName || raw.creator ? 'legacy-feed' : 'jia-ben');
    const restaurantId = text(raw.restaurantId || raw.jiaPlaceId || raw.canonicalRestaurantId);
    const userId = text(raw.userId || raw.uid || raw.authorId || raw.creatorId || raw.creator);
    const createdAt = raw.createdAt || raw.timestamp || raw.created || null;
    const updatedAt = raw.updatedAt || createdAt;
    const photos = Array.isArray(raw.photos) ? raw.photos : (raw.photoUrl ? [raw.photoUrl] : []);
    return {
      reviewId: text(raw.reviewId || raw.id || `legacy:${restaurantId}:${userId}:${timeValue(createdAt)}`),
      restaurantId,
      legacyRestaurantName: text(raw.restaurantName || raw.placeName || raw.name),
      userId,
      displayName: text(raw.displayName || raw.userName || raw.creator || 'Jia-ben 吃貨'),
      avatar: text(raw.avatar || raw.customAvatarUrl || raw.avatarId),
      rating: ratingNumber(raw),
      text: text(raw.text ?? raw.content ?? '').slice(0, LIMIT),
      photos: photos.filter(Boolean).slice(0, 5),
      createdAt,
      updatedAt,
      helpfulCount: Math.max(0, Number(raw.helpfulCount || raw.helpful || 0) || 0),
      helpfulBy: Array.isArray(raw.helpfulBy) ? [...new Set(raw.helpfulBy.map(text).filter(Boolean))] : [],
      moderationStatus: text(raw.moderationStatus || raw.status || 'PUBLISHED').toUpperCase(),
      source,
      schemaVersion: Number(raw.schemaVersion || 1),
      isLegacy: source === 'legacy-feed' || !raw.reviewId,
      raw
    };
  }
  function isPublic(review) { return ['PUBLISHED', 'APPROVED', 'ACTIVE'].includes(String(review?.moderationStatus || '').toUpperCase()); }
  function isValid(review) { return Boolean(review?.restaurantId && Number.isFinite(review.rating) && review.rating >= 1 && review.rating <= 5 && review.text.length <= LIMIT); }
  function normalizeMany(items, options) { return (Array.isArray(items) ? items : []).map(item => normalize(item, options)); }
  function forRestaurant(items, restaurantId) { return normalizeMany(items).filter(item => item.restaurantId === text(restaurantId) && isPublic(item) && isValid(item)); }
  function aggregate(items) {
    const valid = normalizeMany(items).filter(item => isPublic(item) && isValid(item));
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    valid.forEach(item => { const star = Math.max(1, Math.min(5, Math.round(item.rating))); distribution[star] += 1; });
    const average = valid.length ? Number((valid.reduce((sum, item) => sum + item.rating, 0) / valid.length).toFixed(1)) : null;
    return { average, count: valid.length, distribution, reviews: valid };
  }
  function sort(items, mode = 'latest') {
    const list = [...(Array.isArray(items) ? items : [])];
    const date = item => timeValue(item.createdAt);
    return list.sort((a, b) => {
      if (mode === 'highest') return (b.rating - a.rating) || (date(b) - date(a)) || String(b.reviewId).localeCompare(String(a.reviewId));
      if (mode === 'lowest') return (a.rating - b.rating) || (date(b) - date(a)) || String(a.reviewId).localeCompare(String(b.reviewId));
      if (mode === 'helpful') return (b.helpfulCount - a.helpfulCount) || (date(b) - date(a)) || String(a.reviewId).localeCompare(String(b.reviewId));
      return (date(b) - date(a)) || String(b.reviewId).localeCompare(String(a.reviewId));
    });
  }
  function canCreate(items, restaurantId, userId, currentReviewId) { return !normalizeMany(items).some(item => item.restaurantId === text(restaurantId) && item.userId === text(userId) && isPublic(item) && item.reviewId !== currentReviewId); }
  function toggleHelpful(review, userId) {
    const id = text(userId); if (!id || !review || review.userId === id) return { changed: false, reason: 'self-helpful-or-missing-user', review };
    const next = { ...review, helpfulBy: [...(review.helpfulBy || [])] }, index = next.helpfulBy.indexOf(id);
    if (index >= 0) next.helpfulBy.splice(index, 1); else next.helpfulBy.push(id);
    next.helpfulCount = next.helpfulBy.length; return { changed: true, added: index < 0, review: next };
  }
  function validateDraft(draft = {}) {
    const rating = Number(draft.rating), value = text(draft.text).trim();
    return { valid: Number.isInteger(rating) && rating >= 1 && rating <= 5 && value.length <= LIMIT, ratingValid: Number.isInteger(rating) && rating >= 1 && rating <= 5, textValid: value.length <= LIMIT, text: value, limit: LIMIT };
  }
  function formatDate(value, locale = 'zh-TW') { const time = timeValue(value); return time ? new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Taipei', year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date(time)) : '日期未提供'; }
  function escapeText(value) { return text(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
  return { LIMIT, LEGACY_RATINGS, normalize, normalizeMany, isPublic, isValid, forRestaurant, aggregate, sort, canCreate, toggleHelpful, validateDraft, formatDate, escapeText };
});
