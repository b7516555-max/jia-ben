/**
 * NLSC Adapter (src/providers/nlscAdapter.js)
 * 
 * Provides official map layers for Taiwan from the National Land Surveying and Mapping Center (NLSC).
 * Supports standard EMAP (臺灣通用電子地圖) and PHOTO2 (正射影像圖 / 航空照片) WMTS layers with proper attribution.
 */
(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.JiaProviderAdapters = root.JiaProviderAdapters || {};
    root.JiaProviderAdapters.nlsc = api;
  }
})(typeof window !== 'undefined' ? window : null, function(root) {
  'use strict';

  const LAYERS = {
    EMAP: {
      id: 'EMAP',
      name: '臺灣通用電子地圖',
      type: 'wmts',
      urlTemplate: 'https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}',
      attribution: '© 內政部國土測繪中心 (NLSC) 臺灣通用電子地圖',
      maxZoom: 20
    },
    PHOTO2: {
      id: 'PHOTO2',
      name: '正射影像 (臺灣航空照片)',
      type: 'wmts',
      urlTemplate: 'https://wmts.nlsc.gov.tw/wmts/PHOTO2/default/GoogleMapsCompatible/{z}/{y}/{x}',
      attribution: '© 內政部國土測繪中心 (NLSC) 正射影像',
      maxZoom: 20
    },
    OSM: {
      id: 'OSM',
      name: 'OpenStreetMap',
      type: 'xyz',
      urlTemplate: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }
  };

  function getAvailableLayers() {
    return Object.values(LAYERS);
  }

  function getLayerConfig(layerId) {
    return LAYERS[layerId] || LAYERS.OSM;
  }

  return {
    LAYERS,
    getAvailableLayers,
    getLayerConfig
  };
});
