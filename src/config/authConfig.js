(function (root) {
    'use strict';

    // Fill this value with the LIFF ID from LINE Developers to enable LINE login.
    root.JIA_BEN_AUTH_CONFIG = Object.freeze({
        LINE_LIFF_ID: '2012665230-VsegTTSX',
        LINE_ASSISTANT_URL: 'https://line.me/R/ti/p/@030xdxlb',
        SUPPORT_URL: '',
        SUPPORT_LABEL: '🧋 請主揪喝杯珍奶'
    });
    root.configureJiaBenSupportCard = function () {
        return root.JiaBenSupportCard?.configureSupportCard(root.document, root.JIA_BEN_AUTH_CONFIG) || false;
    };
})(typeof window !== 'undefined' ? window : globalThis);
