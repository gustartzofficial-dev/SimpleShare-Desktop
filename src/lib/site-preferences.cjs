'use strict';
const KEYS = new Set([
  'simpleshare-name',
  'simpleshare-theme',
  'simpleshare-muted',
  'simpleshare-volume',
  'simpleshare-sfx',
  'simpleshare-primary-mix',
  'simpleshare-extra-mix',
]);
function cleanPreference(key, value) {
  if (!KEYS.has(key) || typeof value !== 'string' || value.length > 200) return null;
  if (key === 'simpleshare-name') return value.trim().replace(/\s+/g, ' ').slice(0, 28) || null;
  if (key === 'simpleshare-theme') return ['light', 'dark'].includes(value) ? value : null;
  if (key === 'simpleshare-muted') return ['true', 'false'].includes(value) ? value : null;
  if (key === 'simpleshare-sfx') return ['on', 'off'].includes(value) ? value : null;
  const number = Number(value),
    max = key.endsWith('-mix') ? 100 : 1;
  return value.trim() && Number.isFinite(number) && number >= 0 && number <= max
    ? String(number)
    : null;
}
function cleanPreferences(value) {
  const preferences = {};
  if (value && typeof value === 'object')
    for (const key of KEYS) {
      const clean = cleanPreference(key, value[key]);
      if (clean !== null) preferences[key] = clean;
    }
  return preferences;
}
module.exports = { cleanPreference, cleanPreferences };
