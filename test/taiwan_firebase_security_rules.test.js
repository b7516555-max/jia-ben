/**
 * Jia-ben Taiwan Place Intelligence 6.0G Firebase Security Hardening Tests
 * test/taiwan_firebase_security_rules.test.js
 */
const assert = require('assert');

// Simulated Firestore Security Rules Engine based on firestore.rules
class MockFirestoreSecurityEngine {
  constructor() {
    this.appId = 'letseat-366e9';
  }

  evaluate({ path, operation, auth, resourceData, requestData }) {
    const isSignedIn = auth != null && auth.uid != null;
    const isAdmin = isSignedIn && (auth.token && (auth.token.admin === true || auth.token.role === 'admin'));

    const segments = path.split('/').filter(Boolean);
    // path format: artifacts/{appId}/public/data/{collection}/{docId}
    if (segments[0] !== 'artifacts' || segments[1] !== this.appId) {
      return { allowed: false, reason: 'PATH_OUTSIDE_APP_ARTIFACT' };
    }

    if (segments[2] === 'users') {
      const targetUserId = segments[3];
      if (isSignedIn && auth.uid === targetUserId) {
        return { allowed: true };
      }
      return { allowed: false, reason: 'USER_SETTINGS_CROSS_READ_DENIED' };
    }

    if (segments[2] === 'public' && segments[3] === 'data') {
      const collection = segments[4];

      // Read operations
      if (operation === 'read' || operation === 'get' || operation === 'list') {
        return { allowed: true };
      }

      // Canonical places (jiaPlaces)
      if (collection === 'jiaPlaces') {
        if (isAdmin) return { allowed: true };
        return { allowed: false, reason: 'CANONICAL_WRITE_ADMIN_ONLY' };
      }

      // Caches (taiwanPoiCache, placeEnrichmentCache)
      if (collection === 'taiwanPoiCache' || collection === 'placeEnrichmentCache') {
        if (isAdmin) return { allowed: true };
        return { allowed: false, reason: 'CACHE_WRITE_ADMIN_ONLY' };
      }

      // Audit History (placeFieldHistory)
      if (collection === 'placeFieldHistory') {
        if (isAdmin) return { allowed: true };
        return { allowed: false, reason: 'FIELD_HISTORY_WRITE_ADMIN_ONLY' };
      }

      // placeContributions
      if (collection === 'placeContributions') {
        if (operation === 'create') {
          if (!isSignedIn) return { allowed: false, reason: 'AUTH_REQUIRED' };
          if (requestData.uid !== auth.uid) return { allowed: false, reason: 'SPOOFED_CONTRIBUTOR_UID' };
          if (requestData.status !== 'pending') return { allowed: false, reason: 'SELF_APPROVAL_ATTEMPT' };
          if ('reviewerUid' in requestData) return { allowed: false, reason: 'REVIEWER_INJECTION_ATTEMPT' };
          if ('reviewedBy' in requestData) return { allowed: false, reason: 'REVIEWER_INJECTION_ATTEMPT' };
          if ('approvedAt' in requestData) return { allowed: false, reason: 'APPROVAL_TIMESTAMP_INJECTION' };
          if ('community_verified' in requestData) return { allowed: false, reason: 'COMMUNITY_VERIFIED_INJECTION' };
          return { allowed: true };
        }
        if (operation === 'update' || operation === 'delete') {
          if (isAdmin) return { allowed: true };
          return { allowed: false, reason: 'CONTRIBUTION_UPDATE_ADMIN_ONLY' };
        }
      }

      // Feed, reviews, parties, chat, userPlaceStates
      if (['feed', 'restaurants', 'parties', 'chat', 'userPlaceStates', 'placesApiUsage'].includes(collection)) {
        if (isSignedIn) return { allowed: true };
        return { allowed: false, reason: 'AUTH_REQUIRED' };
      }

      // Config
      if (collection === 'config') {
        if (isAdmin) return { allowed: true };
        return { allowed: false, reason: 'CONFIG_WRITE_ADMIN_ONLY' };
      }
    }

    return { allowed: false, reason: 'DEFAULT_DENY' };
  }
}

// Simulated Firebase Storage Security Engine based on storage.rules
class MockStorageSecurityEngine {
  evaluate({ path, operation, auth, resourceSize, contentType }) {
    const isSignedIn = auth != null && auth.uid != null;
    const isAdmin = isSignedIn && (auth.token && auth.token.admin === true);

    const segments = path.split('/').filter(Boolean);
    if (segments[0] === 'communityPhotos') {
      if (operation === 'read') return { allowed: true };
      const targetUserId = segments[1];
      if (!isSignedIn) return { allowed: false, reason: 'STORAGE_AUTH_REQUIRED' };
      if (auth.uid !== targetUserId) return { allowed: false, reason: 'CROSS_USER_STORAGE_WRITE_DENIED' };
      if (resourceSize > 10 * 1024 * 1024) return { allowed: false, reason: 'FILE_SIZE_LIMIT_EXCEEDED' };
      if (!contentType || !contentType.startsWith('image/')) return { allowed: false, reason: 'INVALID_CONTENT_TYPE' };
      return { allowed: true };
    }

    if (segments[0] === 'canonicalPhotos') {
      if (operation === 'read') return { allowed: true };
      if (isAdmin) return { allowed: true };
      return { allowed: false, reason: 'CANONICAL_STORAGE_ADMIN_ONLY' };
    }

    return { allowed: false, reason: 'STORAGE_DEFAULT_DENY' };
  }
}

function runSecurityRulesTests() {
  console.log('============================================================');
  console.log('--- JIA-BEN TAIWAN 6.0G FIREBASE SECURITY RULES TESTS ---');
  console.log('============================================================\n');

  const dbEngine = new MockFirestoreSecurityEngine();
  const storageEngine = new MockStorageSecurityEngine();

  const anonUser = null;
  const normalUser = { uid: 'user_norm_123', token: {} };
  const adminUser = { uid: 'admin_master_999', token: { admin: true, role: 'admin' } };

  // 1. AnonymousReadJiaPlacesTest
  {
    const res = dbEngine.evaluate({
      path: 'artifacts/letseat-366e9/public/data/jiaPlaces/jia_123',
      operation: 'read',
      auth: anonUser
    });
    assert.strictEqual(res.allowed, true);
    console.log('✅ 1. AnonymousReadJiaPlacesTest Passed: Anonymous users can read jiaPlaces for public discovery.');
  }

  // 2. AnonymousWriteJiaPlacesDeniedTest
  {
    const res = dbEngine.evaluate({
      path: 'artifacts/letseat-366e9/public/data/jiaPlaces/jia_123',
      operation: 'write',
      auth: anonUser,
      requestData: { phone: '0900000000' }
    });
    assert.strictEqual(res.allowed, false);
    console.log('✅ 2. AnonymousWriteJiaPlacesDeniedTest Passed: Anonymous write to jiaPlaces is strictly denied.');
  }

  // 3. AuthenticatedReadJiaPlacesTest
  {
    const res = dbEngine.evaluate({
      path: 'artifacts/letseat-366e9/public/data/jiaPlaces/jia_123',
      operation: 'read',
      auth: normalUser
    });
    assert.strictEqual(res.allowed, true);
    console.log('✅ 3. AuthenticatedReadJiaPlacesTest Passed: Authenticated users can read jiaPlaces.');
  }

  // 4. AuthenticatedWriteJiaPlacesDeniedTest
  {
    const res = dbEngine.evaluate({
      path: 'artifacts/letseat-366e9/public/data/jiaPlaces/jia_123',
      operation: 'write',
      auth: normalUser,
      requestData: { phone: '0900000000' }
    });
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'CANONICAL_WRITE_ADMIN_ONLY');
    console.log('✅ 4. AuthenticatedWriteJiaPlacesDeniedTest Passed: Normal user cannot write directly to canonical jiaPlaces.');
  }

  // 5. AdminWriteJiaPlacesAllowedTest
  {
    const res = dbEngine.evaluate({
      path: 'artifacts/letseat-366e9/public/data/jiaPlaces/jia_123',
      operation: 'write',
      auth: adminUser,
      requestData: { phone: '07-551-1378' }
    });
    assert.strictEqual(res.allowed, true);
    console.log('✅ 5. AdminWriteJiaPlacesAllowedTest Passed: Verified Admin can write canonical updates.');
  }

  // 6. UserCreateOwnPendingContributionAllowedTest
  {
    const res = dbEngine.evaluate({
      path: 'artifacts/letseat-366e9/public/data/placeContributions/contrib_1',
      operation: 'create',
      auth: normalUser,
      requestData: {
        uid: 'user_norm_123',
        field: 'phone',
        value: '07-521-1398',
        status: 'pending'
      }
    });
    assert.strictEqual(res.allowed, true);
    console.log('✅ 6. UserCreateOwnPendingContributionAllowedTest Passed: Normal user can submit own pending contribution.');
  }

  // 7. UserCreateApprovedContributionDeniedTest
  {
    const res = dbEngine.evaluate({
      path: 'artifacts/letseat-366e9/public/data/placeContributions/contrib_2',
      operation: 'create',
      auth: normalUser,
      requestData: {
        uid: 'user_norm_123',
        field: 'phone',
        value: '07-521-1398',
        status: 'approved'
      }
    });
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'SELF_APPROVAL_ATTEMPT');
    console.log('✅ 7. UserCreateApprovedContributionDeniedTest Passed: User creating pre-approved contribution is denied.');
  }

  // 8. UserSpoofContributorUidDeniedTest
  {
    const res = dbEngine.evaluate({
      path: 'artifacts/letseat-366e9/public/data/placeContributions/contrib_3',
      operation: 'create',
      auth: normalUser,
      requestData: {
        uid: 'victim_user_456',
        field: 'phone',
        value: '07-521-1398',
        status: 'pending'
      }
    });
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'SPOOFED_CONTRIBUTOR_UID');
    console.log('✅ 8. UserSpoofContributorUidDeniedTest Passed: User submitting under another user UID is denied.');
  }

  // 9. UserSelfApproveDeniedTest
  {
    const res = dbEngine.evaluate({
      path: 'artifacts/letseat-366e9/public/data/placeContributions/contrib_1',
      operation: 'update',
      auth: normalUser,
      requestData: {
        status: 'accepted'
      }
    });
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'CONTRIBUTION_UPDATE_ADMIN_ONLY');
    console.log('✅ 9. UserSelfApproveDeniedTest Passed: User updating contribution status is denied.');
  }

  // 10. UserSetReviewerUidDeniedTest
  {
    const res = dbEngine.evaluate({
      path: 'artifacts/letseat-366e9/public/data/placeContributions/contrib_4',
      operation: 'create',
      auth: normalUser,
      requestData: {
        uid: 'user_norm_123',
        field: 'phone',
        value: '07-521-1398',
        status: 'pending',
        reviewerUid: 'user_norm_123'
      }
    });
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'REVIEWER_INJECTION_ATTEMPT');
    console.log('✅ 10. UserSetReviewerUidDeniedTest Passed: User injecting reviewerUid is denied.');
  }

  // 11. AdminReviewContributionAllowedTest
  {
    const res = dbEngine.evaluate({
      path: 'artifacts/letseat-366e9/public/data/placeContributions/contrib_1',
      operation: 'update',
      auth: adminUser,
      requestData: {
        status: 'accepted',
        reviewedBy: 'Admin'
      }
    });
    assert.strictEqual(res.allowed, true);
    console.log('✅ 11. AdminReviewContributionAllowedTest Passed: Admin can update and review contribution.');
  }

  // 12. UserWritePoiCacheDeniedTest
  {
    const res = dbEngine.evaluate({
      path: 'artifacts/letseat-366e9/public/data/taiwanPoiCache/poi_1',
      operation: 'write',
      auth: normalUser,
      requestData: { fake: true }
    });
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'CACHE_WRITE_ADMIN_ONLY');
    console.log('✅ 12. UserWritePoiCacheDeniedTest Passed: Normal user cannot write to taiwanPoiCache.');
  }

  // 13. UserWriteEnrichmentCacheDeniedTest
  {
    const res = dbEngine.evaluate({
      path: 'artifacts/letseat-366e9/public/data/placeEnrichmentCache/enrich_1',
      operation: 'write',
      auth: normalUser,
      requestData: { fake: true }
    });
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'CACHE_WRITE_ADMIN_ONLY');
    console.log('✅ 13. UserWriteEnrichmentCacheDeniedTest Passed: Normal user cannot write to placeEnrichmentCache.');
  }

  // 14. UserWriteFieldHistoryDeniedTest
  {
    const res = dbEngine.evaluate({
      path: 'artifacts/letseat-366e9/public/data/placeFieldHistory/hist_1',
      operation: 'write',
      auth: normalUser,
      requestData: { fake: true }
    });
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'FIELD_HISTORY_WRITE_ADMIN_ONLY');
    console.log('✅ 14. UserWriteFieldHistoryDeniedTest Passed: Normal user cannot write to placeFieldHistory.');
  }

  // 15. UserReadOwnPrivateStateAllowedTest
  {
    const res = dbEngine.evaluate({
      path: 'artifacts/letseat-366e9/users/user_norm_123/settings/profile',
      operation: 'read',
      auth: normalUser
    });
    assert.strictEqual(res.allowed, true);
    console.log('✅ 15. UserReadOwnPrivateStateAllowedTest Passed: User can read own private profile settings.');
  }

  // 16. UserReadOtherPrivateStateDeniedTest
  {
    const res = dbEngine.evaluate({
      path: 'artifacts/letseat-366e9/users/victim_user_456/settings/profile',
      operation: 'read',
      auth: normalUser
    });
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'USER_SETTINGS_CROSS_READ_DENIED');
    console.log('✅ 16. UserReadOtherPrivateStateDeniedTest Passed: User cannot read other users private profile settings.');
  }

  // 17. UserWriteOtherPrivateStateDeniedTest
  {
    const res = dbEngine.evaluate({
      path: 'artifacts/letseat-366e9/users/victim_user_456/settings/profile',
      operation: 'write',
      auth: normalUser,
      requestData: { hacked: true }
    });
    assert.strictEqual(res.allowed, false);
    console.log('✅ 17. UserWriteOtherPrivateStateDeniedTest Passed: User cannot write other users private settings.');
  }

  // 18. CommunityPhotoUploadOwnPathAllowedTest
  {
    const res = storageEngine.evaluate({
      path: 'communityPhotos/user_norm_123/food.jpg',
      operation: 'write',
      auth: normalUser,
      resourceSize: 1024 * 1024,
      contentType: 'image/jpeg'
    });
    assert.strictEqual(res.allowed, true);
    console.log('✅ 18. CommunityPhotoUploadOwnPathAllowedTest Passed: User can upload to own storage folder.');
  }

  // 19. CommunityPhotoUploadOtherUidDeniedTest
  {
    const res = storageEngine.evaluate({
      path: 'communityPhotos/victim_456/food.jpg',
      operation: 'write',
      auth: normalUser,
      resourceSize: 1024 * 1024,
      contentType: 'image/jpeg'
    });
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'CROSS_USER_STORAGE_WRITE_DENIED');
    console.log('✅ 19. CommunityPhotoUploadOtherUidDeniedTest Passed: User cannot upload to other user storage folder.');
  }

  // 20. CommunityPhotoSetApprovedDeniedTest
  {
    const res = storageEngine.evaluate({
      path: 'canonicalPhotos/official_cover.jpg',
      operation: 'write',
      auth: normalUser,
      resourceSize: 1024 * 1024,
      contentType: 'image/jpeg'
    });
    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.reason, 'CANONICAL_STORAGE_ADMIN_ONLY');
    console.log('✅ 20. CommunityPhotoSetApprovedDeniedTest Passed: Normal user cannot write to canonicalPhotos.');
  }

  console.log('\n🎉 ALL 20 FIREBASE SECURITY RULES TESTS PASSED SUCCESSFULLY!\n');
}

if (require.main === module) {
  runSecurityRulesTests();
}

module.exports = { runSecurityRulesTests, MockFirestoreSecurityEngine, MockStorageSecurityEngine };
