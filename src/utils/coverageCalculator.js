/**
 * Canonical Coverage Calculator (src/utils/coverageCalculator.js)
 * 
 * Jia-ben Taiwan Place Intelligence 6.0E.1
 * 
 * Computes:
 * 1. CURRENT_CANONICAL coverage directly from live jiaPlaces.
 * 2. POTENTIAL_AFTER_VERIFIED_PROMOTION from verified-official enrichment cache docs.
 * 3. EFFECTIVE_UI_COVERAGE taking into account community photos & fallback systems.
 */
function calculateCanonicalCoverage(jiaPlaces = [], enrichmentCache = []) {
  const total = jiaPlaces.length;

  const current = {
    address: 0,
    phone: 0,
    openingHours: 0,
    website: 0,
    officialSocial: 0,
    menu: 0,
    effectiveRealPhoto: 0,
    aiFallbackPhoto: 0,
    phonePlaceIds: [],
    addressPlaceIds: [],
    realPhotoPlaceIds: []
  };

  const potentialVerified = {
    address: 0,
    phone: 0,
    openingHours: 0,
    website: 0,
    officialSocial: 0,
    menu: 0
  };

  const samePlaceSupporting = {
    phone: 0,
    openingHours: 0,
    socialReference: 0
  };

  for (const p of jiaPlaces) {
    const id = p.jiaPlaceId || p.id;

    // Current Canonical fields
    if (p.address && String(p.address).trim().length > 3) {
      current.address++;
      current.addressPlaceIds.push(id);
    }
    if (p.phone && String(p.phone).trim().length >= 7) {
      current.phone++;
      current.phonePlaceIds.push(id);
    }
    if (p.openingHours && String(p.openingHours).trim().length > 3) {
      current.openingHours++;
    }
    if (p.website && String(p.website).trim().length > 5) {
      current.website++;
    }
    if (p.social && Object.keys(p.social).length > 0) {
      current.officialSocial++;
    }
    if (p.menuUrl && String(p.menuUrl).trim().length > 5) {
      current.menu++;
    }

    // Effective Real Photo: coverPhoto, communityPhotos (>0), or safePhoto
    const hasCommunityPhoto = Array.isArray(p.communityPhotos) && p.communityPhotos.length > 0;
    const hasCoverPhoto = Boolean(p.coverPhoto && !p.coverPhoto.includes('placeholder'));
    const hasSafePhoto = Array.isArray(p.photos) && p.photos.length > 0;

    if (hasCoverPhoto || hasCommunityPhoto || hasSafePhoto) {
      current.effectiveRealPhoto++;
      current.realPhotoPlaceIds.push(id);
    } else {
      current.aiFallbackPhoto++;
    }

    // Check potential enrichment
    const enrich = enrichmentCache.find(e => e.jiaPlaceId === id);
    if (enrich) {
      const isOfficialVerified = (enrich.sourceIdentity?.status === 'VERIFIED_OFFICIAL_SOURCE' && enrich.sourceOwnership?.status === 'verified_restaurant_owned');
      const isSamePlace = (enrich.sourceIdentity?.status === 'verified_same_physical_place' || enrich.sourceIdentity?.status === 'VERIFIED_OFFICIAL_SOURCE');

      // Phone
      if (enrich.fields?.phone?.status === 'verified_official' && isOfficialVerified) {
        if (!p.phone) potentialVerified.phone++;
      } else if (enrich.fields?.phone && isSamePlace) {
        if (!p.phone) samePlaceSupporting.phone++;
      }

      // Opening Hours
      if (enrich.fields?.openingHours?.status === 'verified_official' && isOfficialVerified) {
        if (!p.openingHours) potentialVerified.openingHours++;
      } else if (enrich.fields?.openingHours && isSamePlace) {
        if (!p.openingHours) samePlaceSupporting.openingHours++;
      }

      // Official Social
      if (enrich.fields?.social && isOfficialVerified) {
        if (!p.social) potentialVerified.officialSocial++;
      } else if (enrich.fields?.social || enrich.fields?.socialReference) {
        if (!p.social) samePlaceSupporting.socialReference++;
      }

      // Website
      if (enrich.fields?.website?.status === 'verified_official' && isOfficialVerified) {
        if (!p.website) potentialVerified.website++;
      }

      // Menu
      if (enrich.fields?.menu?.url && isOfficialVerified) {
        if (!p.menuUrl) potentialVerified.menu++;
      }
    }
  }

  return {
    total,
    current,
    potentialVerified: {
      address: current.address + potentialVerified.address,
      phone: current.phone + potentialVerified.phone,
      openingHours: current.openingHours + potentialVerified.openingHours,
      website: current.website + potentialVerified.website,
      officialSocial: current.officialSocial + potentialVerified.officialSocial,
      menu: current.menu + potentialVerified.menu
    },
    samePlaceSupporting
  };
}

module.exports = {
  calculateCanonicalCoverage
};
