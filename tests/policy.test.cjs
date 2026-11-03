'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  SITE_URL,
  roomUrl,
  trustedSite,
  safeSnapshot,
  safePrefs,
} = require('../src/lib/policy.cjs');
const { Store } = require('../src/lib/store.cjs');
const { createCreditGate } = require('../src/lib/audio-flow.cjs');
const room = 'abcdef1234567890abcdef12';

test('native audio drops excess packets and resumes only after bounded acknowledgments', () => {
  const gate = createCreditGate(8);
  for (let i = 0; i < 8; i++) assert.equal(gate.take(), true);
  assert.equal(gate.take(), false);
  gate.release(0);
  gate.release(-1);
  assert.equal(gate.take(), false);
  gate.release();
  assert.equal(gate.take(), true);
  assert.equal(gate.take(), false);
  gate.release(100);
  for (let i = 0; i < 8; i++) assert.equal(gate.take(), true);
  assert.equal(gate.take(), false);
});
test('room invites stay on the live app and discard unrelated arguments', () => {
  assert.equal(roomUrl(room), SITE_URL + '/?room=' + room);
  assert.equal(
    roomUrl(SITE_URL + '/?room=' + room + '&p2p=1&debug=1'),
    SITE_URL + '/?room=' + room + '&p2p=1',
  );
  for (const url of [
    'javascript:alert(1)',
    'file:///C:/x',
    'https://evil.example/?room=' + room,
    SITE_URL + '/admin?room=' + room,
    SITE_URL + '/?room=short',
    'https://user:password@simple-share-hazel.vercel.app/?room=' + room,
  ])
    assert.throws(() => roomUrl(url));
});
test('only the exact app origin and root pathname are trusted', () => {
  assert.equal(trustedSite(SITE_URL + '/?room=' + room), true);
  assert.equal(trustedSite(SITE_URL + '.evil.example/'), false);
  assert.equal(trustedSite('http://simple-share-hazel.vercel.app/'), false);
  assert.equal(trustedSite(SITE_URL + '/other'), false);
});
test('untrusted page snapshots cannot enable native state and valid data is bounded', () => {
  assert.equal(safeSnapshot({ url: 'https://evil.example', sharing: true }), null);
  const value = safeSnapshot({
    url: SITE_URL,
    sharing: 'yes',
    title: '<b>title</b>',
    streamers: Array(50).fill('x'.repeat(1000)),
  });
  assert.equal(value.sharing, false);
  assert.equal(value.streamers.length, 10);
  assert.equal(value.streamers[0].length, 48);
});
test('desktop preferences have safe defaults and reject unsupported capture profiles', () => {
  assert.equal(safePrefs(null).profile, '720p60');
  assert.equal(safePrefs({ profile: '8k240', reopenLastRoom: 'yes' }).reopenLastRoom, false);
  assert.equal(safePrefs({ profile: '1080p60' }).profile, '1080p60');
});
test('saved rooms persist and deduplicate, rename and remove without saving participant tokens', () => {
  const base = path.resolve(__dirname, '../.local/store-tests');
  fs.mkdirSync(base, { recursive: true });
  const directory = fs.mkdtempSync(path.join(base, 'store-'));
  let store = new Store(directory, SITE_URL);
  store.favorite(room, 'Game night');
  store.favorite(room, 'Regular room');
  store.visit(room);
  store.prefs({ profile: '1080p60' });
  store = new Store(directory, SITE_URL);
  assert.equal(store.state.favorites.length, 1);
  assert.equal(store.state.favorites[0].name, 'Regular room');
  assert.equal(store.state.recent[0].name, 'Regular room');
  assert.equal(store.state.prefs.profile, '1080p60');
  store.remove(room);
  assert.equal(store.state.favorites.length, 0);
  fs.writeFileSync(path.join(directory, 'desktop.json'), 'null');
  assert.equal(new Store(directory, SITE_URL).state.favorites.length, 0);
});
