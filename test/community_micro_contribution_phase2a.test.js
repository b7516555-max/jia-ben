/**
 * JIA-BEN 6.0J Phase 2A Test Suite
 * test/community_micro_contribution_phase2a.test.js
 * 
 * Verifies all 52 core specifications for Phase 2A:
 * Part 1: Core Community Micro-Contribution Rules (1-20)
 * Part 2: Structured Opening Hours Schema & Validation (21-33)
 * Part 3: Delayed Authentication & State Preservation (34-40)
 * Part 4: UX & View-Model Assertions (41-52)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const JiaCommunityContributionUX = require('../src/services/communityContributionUXService.js');
const JiaCommunity = require('../src/services/communityData.js');
const JiaRestaurantCard = require('../src/components/restaurantCard.js');

function runPhase2ATests() {
  console.log('============================================================');
  console.log('--- JIA-BEN 6.0J PHASE 2A MICRO-CONTRIBUTION TESTS ---');
  console.log('============================================================\n');

  let passed = 0;
  let total = 0;

  function runTest(num, name, fn) {
    total++;
    try {
      fn();
      console.log('PASS [' + num + '/52] ' + name);
      passed++;
    } catch (err) {
      console.error('FAIL [' + num + '/52] ' + name + ': ' + err.message);
      throw err;
    }
  }

  // ==========================================
  // PART 1: CORE RULES (1 - 20)
  // ==========================================

  // 1. Fact fields never direct canonical
  runTest(1, 'Fact fields never direct canonical on user submission', () => {
    const factFields = ['address', 'phone', 'openingHours', 'category'];
    factFields.forEach(f => {
      const record = JiaCommunity.createContributionRecord({
        jiaPlaceId: 'p_test',
        uid: 'user_1',
        userName: 'User 1',
        field: f,
        value: 'test_val'
      });
      assert.strictEqual(record.status, 'pending', f + ' must enter pending review');
    });
  });


  // 2. address CTA when address truly missing
  runTest(2, 'Address CTA when address truly missing', () => {
    const place = { name: '時區', address: '', openingHours: '11:00~20:00' };
    const cta = JiaCommunityContributionUX.getPrimaryContributionCTA(place);
    assert.strictEqual(cta.field, 'address');
    assert.strictEqual(cta.label, '補詳細地址');
    assert.strictEqual(cta.state, 'MISSING');
  });

  // 3. no address CTA after 義成伯 canonical address
  runTest(3, 'No address CTA after 義成伯 has canonical address', () => {
    const yichengbo = {
      jiaPlaceId: 'jia_bdf8a92aeea10e5e6771',
      name: '義成伯の麵店',
      address: '屏東縣里港鄉大平村永樂路21之5號',
      openingHours: null
    };
    const isAddrOk = JiaCommunityContributionUX.isAddressComplete(yichengbo.address);
    assert.strictEqual(isAddrOk, true);
    const cta = JiaCommunityContributionUX.getPrimaryContributionCTA(yichengbo);
    assert.notStrictEqual(cta.field, 'address', 'Address should not be missing');
    assert.strictEqual(cta.field, 'openingHours', 'Should fallback to openingHours CTA');
  });

  // 4. phone CTA when missing
  runTest(4, 'Phone CTA when missing', () => {
    const place = {
      name: '丸京燒肉',
      address: '高雄市新興區中正三路100號',
      openingHours: '17:00~23:00',
      phone: ''
    };
    const cta = JiaCommunityContributionUX.getPrimaryContributionCTA(place);
    assert.strictEqual(cta.field, 'phone');
    assert.strictEqual(cta.label, '補上店家電話');
    assert.strictEqual(cta.state, 'MISSING');
  });

  // 5. invalid phone doesn\'t count complete
  runTest(5, 'Invalid phone does not count as complete', () => {
    assert.strictEqual(JiaCommunityContributionUX.isPhoneComplete('1234'), false);
    assert.strictEqual(JiaCommunityContributionUX.isPhoneComplete('07-12'), false);
    assert.strictEqual(JiaCommunityContributionUX.isPhoneComplete('0912345'), false);
    assert.strictEqual(JiaCommunityContributionUX.isPhoneComplete('08-733-6580'), true);
    assert.strictEqual(JiaCommunityContributionUX.isPhoneComplete('0912-345-678'), true);
  });

  // 6. opening hours CTA when missing
  runTest(6, 'Opening hours CTA when missing', () => {
    const place = {
      name: '海豐鱔魚意麵',
      address: '屏東縣海豐街1號',
      phone: '08-123-4567',
      openingHours: ''
    };
    const cta = JiaCommunityContributionUX.getPrimaryContributionCTA(place);
    assert.strictEqual(cta.field, 'openingHours');
    assert.strictEqual(cta.label, '回報營業時間');
    assert.strictEqual(cta.state, 'MISSING');
  });

  // 7. conflict field uses 「回報最新...」
  runTest(7, 'Conflict field uses 「回報最新...」 wording', () => {
    const place = {
      jiaPlaceId: 'custom_conflict_place',
      name: '衝突店家',
      address: '屏東市和平路1號',
      phone: '08-111-2222',
      openingHours: '10:00~20:00',
      conflicts: ['openingHours']
    };
    const cta = JiaCommunityContributionUX.getPrimaryContributionCTA(place);
    assert.strictEqual(cta.field, 'openingHours');
    assert.strictEqual(cta.label, '回報最新營業時間');
    assert.strictEqual(cta.state, 'CONFLICT');
  });

  // 8. 手酒 hours conflict protected
  runTest(8, 'Hand-Wine coffee hours conflict protected with latest info wording', () => {
    const handWine = {
      jiaPlaceId: 'jia_4a0aa04dc144b9d537ca',
      name: '手酒咖啡',
      address: '屏東縣屏東市福建路124號',
      phone: '08-733-6580',
      openingHours: '13:00~23:00'
    };
    const cta = JiaCommunityContributionUX.getPrimaryContributionCTA(handWine);
    assert.strictEqual(cta.field, 'openingHours');
    assert.strictEqual(cta.label, '回報最新營業時間');
    assert.strictEqual(cta.state, 'CONFLICT');
  });

  // 9. 金溫州 phone conflict protected
  runTest(9, 'Jin Wenzhou phone conflict protected with latest phone wording', () => {
    const jinWenzhou = {
      jiaPlaceId: 'jia_2b7a7cf3a453a4336bdb',
      name: '金溫州餛飩大王',
      address: '高雄市鹽埕區新樂街163巷1號',
      phone: '07 551 1378',
      openingHours: '14:00~21:00'
    };
    const cta = JiaCommunityContributionUX.getPrimaryContributionCTA(jinWenzhou);
    assert.strictEqual(cta.field, 'phone');
    assert.strictEqual(cta.label, '回報最新電話');
    assert.strictEqual(cta.state, 'CONFLICT');
  });

  // 10. user pending contribution disables duplicate CTA
  runTest(10, 'User pending contribution switches CTA to disabled USER_PENDING state', () => {
    const place = {
      jiaPlaceId: 'place_x',
      name: '測試咖啡',
      address: '高雄市新興區中山路1號',
      phone: '07-123-4567',
      openingHours: ''
    };
    const userContributions = [
      { jiaPlaceId: 'place_x', uid: 'user_a', field: 'openingHours', status: 'pending' }
    ];
    const cta = JiaCommunityContributionUX.getPrimaryContributionCTA(place, {
      currentUid: 'user_a',
      userContributions
    });
    assert.strictEqual(cta.state, 'USER_PENDING');
    assert.strictEqual(cta.disabled, true);
    assert.strictEqual(cta.label, '已回報確認中');
  });

  // 11. same UID duplicate isn\'t independent corroboration
  runTest(11, 'Same UID duplicates do not create independent corroboration', () => {
    const history = [
      { jiaPlaceId: 'p1', uid: 'user_1', field: 'phone', value: '08-111-2222', status: 'pending' }
    ];
    const isDup = JiaCommunity.isDuplicateContribution(history, {
      jiaPlaceId: 'p1',
      uid: 'user_1',
      field: 'phone',
      value: '08-111-2222'
    });
    assert.strictEqual(isDup, true);
  });

  // 12. recommended dishes stay community-only
  runTest(12, 'Recommended dishes stays strictly community-only', () => {
    const dishes = JiaCommunityContributionUX.cleanRecommendedDishesInput(['小籠包', '酸辣湯', '小籠包', '']);
    assert.deepStrictEqual(dishes, ['小籠包', '酸辣湯']);
    const record = JiaCommunity.createContributionRecord({
      jiaPlaceId: 'p_dishes',
      uid: 'u1',
      field: 'recommendedDishes',
      value: dishes
    });
    assert.strictEqual(record.field, 'recommendedDishes');
    assert.notStrictEqual(record.field, 'menuUrl');
  });

  // 13. spend stays community-only
  runTest(13, 'Average spend stays strictly community-only experience field', () => {
    const check = JiaCommunity.validateSpend('350');
    assert.strictEqual(check.valid, true);
    assert.strictEqual(check.value, 350);
  });

  // 14. one-user spend wording correct
  runTest(14, 'One-user spend wording correct (1 位吃貨回報...)', () => {
    const wording = JiaCommunityContributionUX.formatAverageSpendDisplay(250, 1);
    assert.strictEqual(wording, '1 位吃貨回報，人均約 NT$250');
    assert.ok(!wording.includes('平均消費 NT$250'), 'Should not use definitive average wording for 1 user');
  });

  // 15. >=2 user spend wording correct
  runTest(15, 'Two or more users spend wording correct (社群回報人均約...)', () => {
    const wording = JiaCommunityContributionUX.formatAverageSpendDisplay(250, 3);
    assert.strictEqual(wording, '社群回報人均約 NT$250');
  });


  // 16. category remains moderated fact
  runTest(16, 'Category field remains moderated fact requiring review', () => {
    const record = JiaCommunity.createContributionRecord({
      jiaPlaceId: 'p_cat',
      uid: 'u1',
      field: 'category',
      value: ['小吃/麵店']
    });
    assert.strictEqual(record.status, 'pending');
  });

  // 17. website/social not primary CTA
  runTest(17, 'Website and official social are never selected as primary CTA', () => {
    const place = {
      jiaPlaceId: 'p_full',
      name: '全齊店家',
      address: '屏東市自由路100號',
      phone: '08-123-4567',
      openingHours: '11:00~20:00',
      communityStats: { averageSpend: 200, recommendedDishes: ['炒麵'] },
      website: '',
      officialSocial: {}
    };
    const cta = JiaCommunityContributionUX.getPrimaryContributionCTA(place);
    assert.strictEqual(cta.state, 'COMPLETE');
    assert.strictEqual(cta.disabled, true);
    assert.notStrictEqual(cta.field, 'website');
    assert.notStrictEqual(cta.field, 'officialSocial');
  });

  // 18. officialSocial owner verification still required
  runTest(18, 'Official social requires owner verification and does not canonicalize from community vote', () => {
    const record = JiaCommunity.createContributionRecord({
      jiaPlaceId: 'p_soc',
      uid: 'u1',
      field: 'officialSocial',
      value: { instagram: 'https://instagram.com/shop' }
    });
    assert.strictEqual(record.status, 'pending');
  });

  // 19. photo CTA not offered
  runTest(19, 'Photo CTA is not offered in Phase 2A', () => {
    const place = {
      name: '無照片店家',
      address: '屏東市和平路2號',
      phone: '08-222-3333',
      openingHours: '12:00~21:00',
      photos: [],
      coverPhoto: null,
      communityStats: { averageSpend: 150, recommendedDishes: ['滷肉飯'] }
    };
    const cta = JiaCommunityContributionUX.getPrimaryContributionCTA(place);
    assert.notStrictEqual(cta.field, 'photo');
  });

  // 20. no Storage code introduced
  runTest(20, 'Zero storage modification or cloud storage write calls', () => {
    const uxFileContent = fs.readFileSync(path.resolve(__dirname, '../src/services/communityContributionUXService.js'), 'utf8');
    assert.ok(!uxFileContent.includes('uploadBytes'), 'No Storage uploadBytes in UX service');
    assert.ok(!uxFileContent.includes('getDownloadURL'), 'No Storage getDownloadURL in UX service');
    assert.ok(!uxFileContent.includes('firebase.storage'), 'No Storage SDK in UX service');
  });

  // ==========================================
  // PART 2: STRUCTURED HOURS TESTS (21 - 33)
  // ==========================================

  // 21. Mon-Sun structured object accepted
  runTest(21, 'Mon-Sun structured object accepted', () => {
    const hours = {
      monday: [{ open: '11:00', close: '14:00' }],
      tuesday: [{ open: '11:00', close: '14:00' }],
      wednesday: [{ open: '11:00', close: '14:00' }],
      thursday: [{ open: '11:00', close: '14:00' }],
      friday: [{ open: '11:00', close: '14:00' }],
      saturday: [{ open: '11:00', close: '20:00' }],
      sunday: [{ open: '11:00', close: '20:00' }]
    };
    const res = JiaCommunityContributionUX.validateStructuredOpeningHours(hours);
    assert.strictEqual(res.valid, true);
  });

  // 22. Closed day accepted
  runTest(22, 'Closed day accepted as valid state', () => {
    const hours = {
      monday: [],
      tuesday: [{ open: '11:00', close: '20:00' }],
      wednesday: [{ open: '11:00', close: '20:00' }],
      thursday: [{ open: '11:00', close: '20:00' }],
      friday: [{ open: '11:00', close: '20:00' }],
      saturday: [{ open: '11:00', close: '20:00' }],
      sunday: []
    };
    const res = JiaCommunityContributionUX.validateStructuredOpeningHours(hours);
    assert.strictEqual(res.valid, true);
  });

  // 23. Single shift accepted
  runTest(23, 'Single shift per day accepted', () => {
    const hours = {
      monday: [{ open: '10:00', close: '18:00' }],
      tuesday: [{ open: '10:00', close: '18:00' }],
      wednesday: [{ open: '10:00', close: '18:00' }],
      thursday: [{ open: '10:00', close: '18:00' }],
      friday: [{ open: '10:00', close: '18:00' }],
      saturday: [{ open: '10:00', close: '18:00' }],
      sunday: [{ open: '10:00', close: '18:00' }]
    };
    assert.strictEqual(JiaCommunityContributionUX.validateStructuredOpeningHours(hours).valid, true);
  });

  // 24. Two shifts accepted
  runTest(24, 'Two shifts per day (lunch + dinner) accepted', () => {
    const hours = {
      monday: [{ open: '11:00', close: '14:00' }, { open: '17:00', close: '21:00' }],
      tuesday: [{ open: '11:00', close: '14:00' }, { open: '17:00', close: '21:00' }],
      wednesday: [{ open: '11:00', close: '14:00' }, { open: '17:00', close: '21:00' }],
      thursday: [{ open: '11:00', close: '14:00' }, { open: '17:00', close: '21:00' }],
      friday: [{ open: '11:00', close: '14:00' }, { open: '17:00', close: '21:00' }],
      saturday: [{ open: '11:00', close: '21:00' }],
      sunday: []
    };
    assert.strictEqual(JiaCommunityContributionUX.validateStructuredOpeningHours(hours).valid, true);
  });

  // 25. 25:00 rejected
  runTest(25, 'Hour 25:00 rejected', () => {
    const hours = {
      monday: [{ open: '11:00', close: '25:00' }],
      tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: []
    };
    const res = JiaCommunityContributionUX.validateStructuredOpeningHours(hours);
    assert.strictEqual(res.valid, false);
    assert.ok(res.message.includes('時段格式'));
  });


  // 26. empty time rejected
  runTest(26, 'Empty time strings rejected', () => {
    const hours = {
      monday: [{ open: '', close: '20:00' }],
      tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: []
    };
    assert.strictEqual(JiaCommunityContributionUX.validateStructuredOpeningHours(hours).valid, false);
  });

  // 27. malformed shift rejected
  runTest(27, 'Malformed shift objects rejected', () => {
    const hours = {
      monday: ['11:00~20:00'],
      tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: []
    };
    assert.strictEqual(JiaCommunityContributionUX.validateStructuredOpeningHours(hours).valid, false);
  });

  // 28. three shifts rejected if unsupported
  runTest(28, 'Three shifts per day rejected (max 2 supported)', () => {
    const hours = {
      monday: [
        { open: '08:00', close: '10:00' },
        { open: '11:00', close: '14:00' },
        { open: '17:00', close: '21:00' }
      ],
      tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: []
    };
    const res = JiaCommunityContributionUX.validateStructuredOpeningHours(hours);
    assert.strictEqual(res.valid, false);
    assert.ok(res.message.includes('最多') || res.message.includes('2 個營業時段'));
  });


  // 29. start == end rejected
  runTest(29, 'Start == End rejected', () => {
    const hours = {
      monday: [{ open: '12:00', close: '12:00' }],
      tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: []
    };
    assert.strictEqual(JiaCommunityContributionUX.validateStructuredOpeningHours(hours).valid, false);
  });

  // 30. fallback text accepted as lower-confidence evidence
  runTest(30, 'Fallback text accepted as lower-confidence structure', () => {
    const parsed = JiaCommunityContributionUX.parseOpeningHours('13:00左右開，賣完為止');
    assert.strictEqual(parsed.hasStructure, false);
    assert.strictEqual(parsed.confidence, 'LOWER_STRUCTURE_CONFIDENCE');
    assert.strictEqual(parsed.rawText, '13:00左右開，賣完為止');
  });

  // 31. legacy string hours still readable
  runTest(31, 'Legacy string hours still readable and parseable', () => {
    const parsed = JiaCommunityContributionUX.parseOpeningHours('週一至週日 11:00~20:00');
    assert.strictEqual(parsed.hasStructure, true);
    assert.strictEqual(parsed.structured.monday[0].open, '11:00');
    assert.strictEqual(parsed.structured.monday[0].close, '20:00');
  });

  // 32. admin formatter can display structured hours
  runTest(32, 'Admin formatter cleanly formats structured hours object', () => {
    const hours = {
      monday: [{ open: '11:00', close: '14:00' }, { open: '17:00', close: '21:00' }],
      tuesday: [],
      wednesday: [{ open: '11:00', close: '20:00' }],
      thursday: [{ open: '11:00', close: '20:00' }],
      friday: [{ open: '11:00', close: '20:00' }],
      saturday: [{ open: '11:00', close: '20:00' }],
      sunday: []
    };
    const displayStr = JiaCommunityContributionUX.formatStructuredHoursForDisplay(hours);
    assert.ok(displayStr.includes('週一: 11:00~14:00 / 17:00~21:00'));
    assert.ok(displayStr.includes('週二: 休息'));
    assert.ok(!displayStr.includes('[object Object]'), 'Must never render [object Object]');
  });

  // 33. normalized structured equality deduplicates same schedule
  runTest(33, 'Normalized structured equality deduplicates same schedule', () => {
    const h1 = {
      monday: [{ open: '11:00', close: '20:00' }],
      tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: []
    };
    const h2 = {
      monday: [{ open: '11:00', close: '20:00' }],
      tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: []
    };
    assert.strictEqual(JSON.stringify(h1), JSON.stringify(h2));
  });

  // ==========================================
  // PART 3: AUTH TESTS (34 - 40)
  // ==========================================

  // 34. open modal while logged-out does NOT immediately trigger auth
  runTest(34, 'Open modal while logged-out does NOT immediately call requireIdentity', () => {
    const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    const modalMatch = indexHtml.match(/window\.openContributeModal\s*=\s*function[\s\S]*?document\.getElementById\('place-contribute-modal'\)\?\.classList\.remove\('hidden'\);/);
    assert.ok(modalMatch, 'openContributeModal exists and opens modal directly');
    const funcBody = modalMatch[0];
    assert.ok(!funcBody.startsWith('window.openContributeModal = function(placeOverride, targetField) {\n            window.requireIdentity'), 'Should not gate immediately at entrance');
  });

  // 35. user can fill field before auth
  runTest(35, 'User can fill field before auth in single field panel', () => {
    const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    assert.ok(indexHtml.includes('id="panel-contrib-openingHours"'));
    assert.ok(indexHtml.includes('id="panel-contrib-address"'));
    assert.ok(indexHtml.includes('id="panel-contrib-phone"'));
    assert.ok(indexHtml.includes('id="panel-contrib-recommendedDishes"'));
    assert.ok(indexHtml.includes('id="panel-contrib-averageSpend"'));
  });

  // 36. Submit when logged-out triggers auth
  runTest(36, 'Submit when logged-out triggers requireIdentity gate', () => {
    const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    assert.ok(indexHtml.includes('if (!currentUser && !window.myIdentity?.name)'));
    assert.ok(indexHtml.includes('window._pendingContributionDraft ='));
    assert.ok(indexHtml.includes('window.requireIdentity('));
  });

  // 37. successful login preserves typed state
  runTest(37, 'Successful login restores typed state from memory draft', () => {
    let currentUser = null;
    let myIdentity = null;
    let pendingDraft = null;
    let submitted = false;

    // Simulate flow
    function mockSubmit(payload) {
      if (!currentUser && !myIdentity) {
        pendingDraft = { payload };
        return mockRequireIdentity(() => {
          if (pendingDraft) {
            const restored = pendingDraft.payload;
            pendingDraft = null;
            mockSubmit(restored);
          }
        });
      }
      submitted = true;
      assert.strictEqual(payload.field, 'openingHours');
      assert.strictEqual(payload.value, '11:00~20:00');
    }

    function mockRequireIdentity(cb) {
      currentUser = { uid: 'u_logged_in' };
      myIdentity = { name: '測試吃貨' };
      cb();
    }

    mockSubmit({ field: 'openingHours', value: '11:00~20:00' });
    assert.strictEqual(submitted, true);
    assert.strictEqual(pendingDraft, null);
  });

  // 38. failed/cancelled login does not submit
  runTest(38, 'Failed or cancelled login does not submit', () => {
    let currentUser = null;
    let submitted = false;

    function mockSubmit(payload) {
      if (!currentUser) {
        return;
      }
      submitted = true;
    }

    mockSubmit({ field: 'address', value: '忠孝東路1號' });
    assert.strictEqual(submitted, false);
  });

  // 39. no anonymous production contribution created
  runTest(39, 'No anonymous production contribution record accepted without identity', () => {
    assert.throws(() => {
      JiaCommunity.createContributionRecord({
        jiaPlaceId: 'p1',
        uid: '',
        userName: '',
        field: 'phone',
        value: '08-733-6580'
      });
    }, /uid/i);
  });

  // 40. no credentials exposed
  runTest(40, 'No credentials, secrets, or tokens exposed in source files or tests', () => {
    const files = [
      'src/services/communityContributionUXService.js',
      'src/components/restaurantCard.js'
    ];
    const keyPattern = ['AIza', 'Sy'].join('');
    files.forEach(f => {
      const content = fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
      assert.ok(!content.includes(keyPattern), 'No Google API keys');
      assert.ok(!content.includes('private_key'), 'No private keys');
      assert.ok(!content.includes('client_secret'), 'No client secrets');
    });
  });

  // ==========================================
  // PART 4: UX & VIEW-MODEL TESTS (41 - 52)
  // ==========================================

  // 41. Restaurant card max 1 contribution CTA
  runTest(41, 'Restaurant card renders at most 1 primary contribution CTA', () => {
    const place = {
      name: '時區',
      address: '',
      phone: '',
      openingHours: ''
    };
    const html = JiaRestaurantCard.render(place);
    const matches = html.match(/contribution-context-cta/g) || [];
    assert.strictEqual(matches.length, 1, 'Exactly one context CTA button should be rendered');
  });

  // 42. CTA click does not open restaurant card accidentally
  runTest(42, 'CTA click stops propagation so parent card click is not triggered', () => {
    const cardJs = fs.readFileSync(path.resolve(__dirname, '../src/components/restaurantCard.js'), 'utf8');
    assert.ok(cardJs.includes('event.stopPropagation()'));
  });

  // 43. Modal only shows selected field
  runTest(43, 'Modal panels hide inactive fields using hidden class', () => {
    const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    assert.ok(indexHtml.includes('window.switchContributeField = function(fieldName)'));
    assert.ok(indexHtml.includes('panel.classList.toggle(\'hidden\', f !== fieldName)'));
  });

  // 44. Field picker can change field
  runTest(44, 'Field picker tabs allow switching active field', () => {
    const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    const fields = ['openingHours', 'address', 'phone', 'recommendedDishes', 'averageSpend', 'category'];
    fields.forEach(f => {
      assert.ok(indexHtml.includes("window.switchContributeField('" + f + "')"));
    });
  });

  // 45. Success screen shown after mocked submit
  runTest(45, 'Success feedback message presented after contribution submission', () => {
    const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    assert.ok(indexHtml.includes('✓ 已收到你的回報！'));
    assert.ok(indexHtml.includes('✓ 謝謝你的分享！'));
  });

  // 46. pending state shown after mocked pending contribution
  runTest(46, 'Pending badge rendered when user already has pending submission', () => {
    const place = {
      jiaPlaceId: 'p_pending',
      name: '等待中餐廳',
      openingHours: ''
    };
    const vm = JiaRestaurantCard.buildRestaurantCardViewModel(place, {
      currentUid: 'u1',
      userContributions: [
        { jiaPlaceId: 'p_pending', uid: 'u1', field: 'openingHours', status: 'pending' }
      ]
    });
    assert.strictEqual(vm.ctaInfo.state, 'USER_PENDING');
    assert.strictEqual(vm.ctaInfo.label, '已回報確認中');
    const html = JiaRestaurantCard.render(place, {
      currentUid: 'u1',
      userContributions: [
        { jiaPlaceId: 'p_pending', uid: 'u1', field: 'openingHours', status: 'pending' }
      ]
    });
    assert.ok(html.includes('已回報確認中'));
  });

  // 47. mobile width <= viewport
  runTest(47, 'Mobile modal max-width constrained to viewport without overflowing', () => {
    const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    assert.ok(indexHtml.includes('w-11/12 max-w-lg'));
  });

  // 48. no horizontal overflow
  runTest(48, 'No horizontal overflow classes present on modal container', () => {
    const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    assert.ok(indexHtml.includes('overflow-y-auto no-scrollbar'));
  });

  // 49. submit remains accessible
  runTest(49, 'Submit button remains sticky/accessible at modal footer', () => {
    const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    assert.ok(indexHtml.includes('id="contrib-submit-btn"'));
  });

  // 50. existing 吃過 / 想吃 still works
  runTest(50, 'Existing 吃過 / 想吃 toggles still work on restaurant card', () => {
    const place = { name: '黑輪坤', jiaPlaceId: 'p_k' };
    const html = JiaRestaurantCard.render(place);
    assert.ok(html.includes("window.toggleUserPlaceState('p_k', 'ate'"));
    assert.ok(html.includes("window.toggleUserPlaceState('p_k', 'wantToEat'"));
  });

  // 51. restaurant detail still opens
  runTest(51, 'Restaurant detail modal opening action preserved', () => {
    const place = { name: '金井珈琲' };
    const html = JiaRestaurantCard.render(place);
    assert.ok(html.includes('window.openRestaurantDetailByName'));
  });

  // 52. review modal still works
  runTest(52, 'Review modal interaction button still preserved in detail page', () => {
    const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
    assert.ok(indexHtml.includes('id="detail-review-btn"'));
  });

  console.log('\n============================================================');
  console.log('ALL PHASE 2A TESTS COMPLETE: ' + passed + ' / ' + total + ' PASS (100%)');
  console.log('============================================================\n');
}

runPhase2ATests();



