(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else if (root) root.JiaBenSupportCard = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const DEFAULT_LABEL = '🧋 請主揪喝杯珍奶';

    function normalizeHttpsUrl(value) {
        if (typeof value !== 'string' || !value.trim()) return '';
        try {
            const url = new URL(value.trim());
            if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return '';
            return url.href;
        } catch (_) {
            return '';
        }
    }

    function configureSupportCard(documentObject, config = {}) {
        const card = documentObject?.getElementById?.('creator-support-card');
        const link = documentObject?.getElementById?.('creator-support-link');
        if (!card || !link) return false;

        const href = normalizeHttpsUrl(config.SUPPORT_URL);
        card.hidden = true;
        link.removeAttribute?.('href');
        if (!href) return false;

        link.href = href;
        link.textContent = String(config.SUPPORT_LABEL || DEFAULT_LABEL);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        card.hidden = false;
        return true;
    }

    return { normalizeHttpsUrl, configureSupportCard, DEFAULT_LABEL };
});
