'use strict';
const SITE_URL = 'https://simple-share-hazel.vercel.app';
const ROOM_RE = /^[A-Za-z0-9_-]{20,80}$/;
const PROFILES = new Set(['720p30', '720p60', '1080p60']);
function roomUrl(input, origin = SITE_URL) {
  const raw = String(input || '').trim();
  const url = ROOM_RE.test(raw) ? new URL('/?room=' + raw, origin) : new URL(raw);
  if (
    url.origin !== new URL(origin).origin ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    !ROOM_RE.test(url.searchParams.get('room') || '')
  )
    throw new Error('Use a SimpleShare room link or room code.');
  const clean = new URL('/', origin);
  clean.searchParams.set('room', url.searchParams.get('room'));
  if (url.searchParams.get('p2p') === '1') clean.searchParams.set('p2p', '1');
  return clean.href;
}
function trustedSite(url, origin = SITE_URL) {
  try {
    const parsed = new URL(url);
    return (
      parsed.origin === new URL(origin).origin &&
      parsed.pathname === '/' &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}
function defaultName(url) {
  const id = new URL(url).searchParams.get('room') || '';
  return 'Room ' + id.slice(0, 4) + ' · ' + id.slice(-4);
}
function label(value, fallback = '') {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ').slice(0, 48) || fallback
    : fallback;
}
function safeSnapshot(value, origin = SITE_URL) {
  if (!value || typeof value !== 'object' || !trustedSite(value.url, origin)) return null;
  const inRoom = ROOM_RE.test(new URL(value.url).searchParams.get('room') || '');
  return {
    url: inRoom ? roomUrl(value.url, origin) : new URL('/', origin).href,
    room: inRoom,
    title: label(value.title, 'SimpleShare'),
    status: label(value.status, 'Connected'),
    sharing: value.sharing === true,
    canShare: value.canShare === true,
    watching: value.watching === true,
    streamers: Array.isArray(value.streamers)
      ? value.streamers
          .slice(0, 10)
          .map((name) => label(name))
          .filter(Boolean)
      : [],
    theme: value.theme === 'light' ? 'light' : 'dark',
  };
}
function safePrefs(value = {}) {
  if (!value || typeof value !== 'object') value = {};
  return {
    profile: PROFILES.has(value.profile) ? value.profile : '720p60',
    alwaysOnTop: value.alwaysOnTop !== false,
    closeToTray: value.closeToTray !== false,
    reopenLastRoom: value.reopenLastRoom === true,
  };
}
module.exports = {
  SITE_URL,
  ROOM_RE,
  PROFILES,
  roomUrl,
  trustedSite,
  defaultName,
  label,
  safeSnapshot,
  safePrefs,
};
