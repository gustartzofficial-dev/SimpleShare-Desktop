'use strict';
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { cleanPreference, cleanPreferences } = require('../src/lib/site-preferences.cjs');
const { Store } = require('../src/lib/store.cjs');
const { SITE_URL } = require('../src/lib/policy.cjs');
test('native preference backup accepts only public, bounded settings', () => {
  assert.equal(cleanPreference('simpleshare-name', ' Gusta '), 'Gusta');
  assert.equal(cleanPreference('simpleshare-volume', '0'), '0');
  assert.equal(cleanPreference('simpleshare-muted', 'true'), 'true');
  for (const [key, value] of [
    ['simpleshare-session-room', 'token'],
    ['token', 'secret'],
    ['simpleshare-name', ' '],
    ['simpleshare-volume', 'NaN'],
    ['simpleshare-volume', '2'],
    ['simpleshare-theme', 'anything'],
  ])
    assert.equal(cleanPreference(key, value), null);
  assert.deepEqual(cleanPreferences({ 'simpleshare-name': 'Gusta', token: 'secret' }), {
    'simpleshare-name': 'Gusta',
  });
});
test('native name and preferences persist through Store recreation without room credentials', () => {
  const base = path.resolve(__dirname, '../.local/preference-tests');
  fs.mkdirSync(base, { recursive: true });
  const directory = fs.mkdtempSync(path.join(base, 'profile-'));
  let store = new Store(directory, SITE_URL);
  assert.equal(store.sitePreference('simpleshare-name', 'Gusta'), true);
  store.sitePreference('simpleshare-theme', 'light');
  store.sitePreference('simpleshare-muted', 'true');
  assert.equal(store.sitePreference('participantToken', 'secret'), false);
  store = new Store(directory, SITE_URL);
  assert.deepEqual(store.state.sitePreferences, {
    'simpleshare-name': 'Gusta',
    'simpleshare-theme': 'light',
    'simpleshare-muted': 'true',
  });
  assert.equal(fs.readFileSync(store.file, 'utf8').includes('secret'), false);
});
