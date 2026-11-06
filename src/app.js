import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {getCurrentWindow} from '@tauri-apps/api/window';
const stateCallbacks=new Set(),previewCallbacks=new Set();
await listen('shell-state',event=>stateCallbacks.forEach(callback=>callback(event.payload)));
await listen('shell-preview',event=>previewCallbacks.forEach(callback=>callback(event.payload)));
window.desktop={command:(name,payload)=>invoke('shell_command',{name,payload:payload??null}).catch(error=>({ok:false,error:String(error)})),onState:callback=>stateCallbacks.add(callback),onPreview:callback=>previewCallbacks.add(callback)};
'use strict';
const $ = (id) => document.getElementById(id);
let state,
  favoriteKey = '',
  recentKey = '';
function feedback(message) {
  $('feedbackText').textContent = message || '';
  $('feedback').hidden = !message;
}
async function command(name, payload) {
  try {
    const result = await window.desktop.command(name, payload);
    if (!result?.ok) feedback(result?.error || 'The action could not finish. Try again.');
    return result;
  } catch {
    feedback('The desktop connection was interrupted. Reopen the app.');
  }
}
function button(label, className, callback, aria) {
  const item = document.createElement('button');
  item.className = className;
  item.textContent = label;
  if (aria) item.setAttribute('aria-label', aria);
  item.addEventListener('click', callback);
  return item;
}
function roomItem(room, editable) {
  const row = document.createElement('div');
  row.className = 'room-item';
  row.dataset.url = room.url;
  const open = button('', 'room-link', () => command('navigate', room.url));
  open.title = room.url;
  open.setAttribute('aria-label','Open '+room.name);
  const avatar = document.createElement('span');
  avatar.className = 'room-avatar';
  avatar.textContent = room.name.slice(0, 1).toUpperCase();
  const name = document.createElement('span');
  name.className = 'room-name';
  name.textContent = room.name;
  open.append(avatar, name);
  row.append(open);
  if (editable) {
    row.append(
      button(
        '✎',
        'room-edit',
        () => {
          const input = document.createElement('input');
          input.className = 'rename-input';
          input.value = room.name;
          input.maxLength = 48;
          input.setAttribute('aria-label', 'Saved room name');
          row.replaceChildren(input);
          input.focus();
          input.select();
          let submitted = false;
          const save = async () => {
            if (submitted) return;
            submitted = true;
            await command('favorite', { url: room.url, name: input.value });
            favoriteKey = '';
            render(state);
          };
          input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') save();
            if (event.key === 'Escape') {
              submitted = true;
              favoriteKey = '';
              render(state);
            }
          });
          input.addEventListener('blur', save);
        },
        'Rename ' + room.name,
      ),
    );
    row.append(
      button('×', 'room-edit', () => command('remove-favorite', room.url), 'Remove ' + room.name),
    );
  }
  return row;
}
function render(value) {
  if (!value) return;
  state = value;
  document.body.classList.toggle('sidebar-collapsed',state.data.prefs.sidebarCollapsed);
  $('sidebarToggle').setAttribute('aria-expanded',String(!state.data.prefs.sidebarCollapsed));
  $('sidebarToggle').hidden=state.compact;
  $('profilePath').textContent=state.profilePath;
  $('updateStatus').textContent=state.updateStatus;
  $('installUpdate').hidden=!state.updateAvailable;
  $('autoUpdate').checked=state.data.prefs.autoUpdate;
  document.body.classList.toggle('compact', state.compact);
  document.documentElement.dataset.theme = state.snapshot?.theme || 'dark';
  $('sidebar').hidden = state.compact;
  $('localContent').hidden = state.compact;
  $('compactPanel').hidden = !state.compact;
  $('loading').hidden = !state.loading || Boolean(state.overlay);
  $('loadError').hidden = !state.loadError || Boolean(state.overlay);
  $('loadErrorText').textContent = state.loadError;
  $('preferences').hidden = state.overlay !== 'preferences';
  $('windowTitle').textContent = state.snapshot?.room
    ? state.snapshot.title
    : 'Your people, a little closer.';
  $('compactToggle').setAttribute('aria-label', state.compact ? 'Expand room' : 'Compact mode');
  $('compactToggle').title = state.compact ? 'Expand room' : 'Compact mode';
  $('saveCurrent').disabled = !state.snapshot?.room;
  $('saveCurrent').textContent = state.data.favorites.some(
    (room) => room.url === state.snapshot?.url,
  )
    ? '★'
    : '☆';
  const nextFavorites = JSON.stringify(state.data.favorites);
  if (favoriteKey !== nextFavorites) {
    favoriteKey = nextFavorites;
    $('favorites').replaceChildren(...state.data.favorites.map((room) => roomItem(room, true)));
  }
  const nextRecent = JSON.stringify(state.data.recent);
  if (recentKey !== nextRecent) {
    recentKey = nextRecent;
    $('recent').replaceChildren(...state.data.recent.map((room) => roomItem(room, false)));
  }
  for (const row of document.querySelectorAll('.room-item'))
    row.classList.toggle('active', row.dataset.url === state.snapshot?.url);
  $('favoriteCount').textContent = state.data.favorites.length;
  $('favoritesEmpty').hidden = state.data.favorites.length > 0;
  $('recentEmpty').hidden = state.data.recent.length > 0;
  $('compactRoom').textContent = state.snapshot?.room ? state.snapshot.title : 'Your room';
  $('compactStatus').textContent = state.snapshot?.sharing
    ? 'Sharing'
    : state.snapshot?.room
      ? state.snapshot.status
      : 'Choose a room';
  const names = state.snapshot?.streamers || [];
  $('streamerCount').textContent = names.length;
  $('compactStreamers').replaceChildren(
    ...names.map((name) => {
      const node = document.createElement('span');
      node.className = 'streamer';
      node.textContent = name;
      return node;
    }),
  );
  $('streamersEmpty').hidden = names.length > 0;
  $('compactStreamers').hidden = names.length === 0;
  $('compactStop').hidden = !state.snapshot?.sharing;
  $('compactShare').disabled = !state.snapshot?.canShare;
  $('compactShare').hidden = !state.snapshot?.room || state.snapshot?.sharing;
  $('previewLive').hidden = !state.snapshot?.sharing;
  $('previewHint').textContent = state.snapshot?.sharing
    ? 'Preparing your local preview…'
    : 'Share a screen to see your preview here.';
  if (!state.snapshot?.sharing) showPreview(null);
  $('qualityProfile').value = state.data.prefs.profile;
  for (const key of ['alwaysOnTop', 'closeToTray', 'reopenLastRoom'])
    $(key).checked = state.data.prefs[key];
  $('audioSupport').textContent = state.nativeAudioSupported
    ? 'Native process audio is available on this Windows device.'
    : 'This device supports video capture. Scoped application audio requires Windows x64, build 20348 or newer.';
  $('version').textContent = state.version;
  if (state.notice) feedback(state.notice);
}
function showPreview(data) {
  $('localPreview').hidden = !data;
  $('previewEmpty').hidden = Boolean(data);
  if (data) $('localPreview').src = data;
  else $('localPreview').removeAttribute('src');
}
window.desktop.onState(render);
window.desktop.onPreview(showPreview);
for (const id of ['minimize', 'maximize', 'close'])
  $(id).addEventListener('click', () => command(id));
$('compactToggle').addEventListener('click', () => command('compact'));
$('compactRestore').addEventListener('click', () => command('compact'));
$('createRoom').addEventListener('click', () => command('create'));
$('joinForm').addEventListener('submit', (event) => {
  event.preventDefault();
  command('navigate', $('roomLink').value);
});
$('saveCurrent').addEventListener('click', () =>
  state.data.favorites.some((room) => room.url === state.snapshot?.url)
    ? command('remove-favorite', state.snapshot.url)
    : command('favorite', { url: state.snapshot?.url }),
);
for (const id of ['preferencesOpen', 'preferencesClose'])
  $(id).addEventListener('click', () => command('preferences'));
for (const id of ['alwaysOnTop', 'closeToTray', 'reopenLastRoom'])
  $(id).addEventListener('change', () => command('prefs', { [id]: $(id).checked }));
$('qualityProfile').addEventListener('change', () =>
  command('prefs', { profile: $('qualityProfile').value }),
);
$('quit').addEventListener('click', () => command('quit'));
$('retry').addEventListener('click', () => command('retry'));
$('compactStop').addEventListener('click', () => command('room-action', 'stop'));
$('compactShare').addEventListener('click', () => command('room-action', 'share'));
$('feedbackClose').addEventListener('click', () => {
  feedback('');
  command('dismiss-notice');
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state?.overlay) command('preferences');
});
$('diagnostics').addEventListener('click', () => command('diagnostics'));
command('ready');

$('sidebarToggle').addEventListener('click',()=>command('collapse-sidebar'));
$('importProfile').addEventListener('click',()=>command('import-profile'));
$('checkUpdate').addEventListener('click',()=>command('check-update'));
$('installUpdate').addEventListener('click',()=>command('install-update'));
$('autoUpdate').addEventListener('change',()=>command('prefs',{autoUpdate:$('autoUpdate').checked}));
document.querySelector('.title-drag').addEventListener('mousedown',event=>{if(event.button===0)getCurrentWindow().startDragging();});
