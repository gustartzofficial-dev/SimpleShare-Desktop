'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { roomUrl, defaultName, label, safePrefs } = require('./policy.cjs');
class Store {
  constructor(directory, origin) {
    this.directory = directory;
    this.origin = origin;
    this.file = path.join(directory, 'desktop.json');
    let input = {};
    try {
      if (fs.statSync(this.file).size < 262144)
        input = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {}
    if (!input || typeof input !== 'object') input = {};
    const normalize = (list) =>
      Array.isArray(list)
        ? list.slice(0, 50).flatMap((entry) => {
            try {
              const url = roomUrl(entry.url, origin);
              return [{ url, name: label(entry.name, defaultName(url)) }];
            } catch {
              return [];
            }
          })
        : [];
    this.state = {
      favorites: normalize(input.favorites),
      recent: normalize(input.recent).slice(0, 8),
      prefs: safePrefs(input.prefs),
      lastRoom: '',
    };
    try {
      this.state.lastRoom = roomUrl(input.lastRoom, origin);
    } catch {}
  }
  save() {
    fs.mkdirSync(this.directory, { recursive: true });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.state, null, 2), { mode: 0o600 });
    fs.renameSync(this.file + '.tmp', this.file);
  }
  favorite(input, name) {
    const url = roomUrl(input, this.origin);
    const existing = this.state.favorites.find((entry) => entry.url === url);
    const next = { url, name: label(name, existing?.name || defaultName(url)) };
    this.state.favorites = [
      next,
      ...this.state.favorites.filter((entry) => entry.url !== url),
    ].slice(0, 50);
    this.state.recent = this.state.recent.map((entry) =>
      entry.url === url ? { ...entry, name: next.name } : entry,
    );
    this.save();
    return next;
  }
  remove(input) {
    const url = roomUrl(input, this.origin);
    this.state.favorites = this.state.favorites.filter((entry) => entry.url !== url);
    this.save();
  }
  visit(input) {
    const url = roomUrl(input, this.origin);
    this.state.lastRoom = url;
    this.state.recent = [
      {
        url,
        name: this.state.favorites.find((item) => item.url === url)?.name || defaultName(url),
      },
      ...this.state.recent.filter((entry) => entry.url !== url),
    ].slice(0, 8);
    this.save();
  }
  prefs(input) {
    this.state.prefs = safePrefs({ ...this.state.prefs, ...input });
    this.save();
  }
}
module.exports = { Store };
