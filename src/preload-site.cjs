'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('__simpleShareNative', {
  takeGrant: () => ipcRenderer.invoke('site:grant'),
  startAudio: (id) => ipcRenderer.invoke('site:audio-start', id),
  report: (type, detail, warning = false) =>
    ipcRenderer.send('site:diagnostic', { type, detail, warning }),
  stopAudio: (id) => ipcRenderer.send('site:audio-stop', id),
  onAudio: (callback) => {
    const listener = (_event, value) => {
      try {
        callback(value);
      } finally {
        if (Number.isInteger(value.sequence))
          ipcRenderer.send('site:audio-ack', { id: value.id, sequence: value.sequence });
      }
    };
    ipcRenderer.on('site:audio', listener);
    return () => ipcRenderer.removeListener('site:audio', listener);
  },
});
let compact = false;
ipcRenderer.on('site:compact', (_event, value) => {
  compact = value === true;
});
try {
  if (!localStorage.getItem('simpleshare-theme')) localStorage.setItem('simpleshare-theme', 'dark');
} catch {}
window.addEventListener('DOMContentLoaded', () => {
  const seenLogs = new WeakSet();
  let lastToast = '';
  let last = '',
    scheduled;
  const snapshot = () => {
    scheduled = null;
    for (const line of document.querySelectorAll('#logBody .log-line')) {
      if (seenLogs.has(line)) continue;
      seenLogs.add(line);
      if (/media|ICE|TURN|publish|captur|reconnect|video.*failed/i.test(line.textContent))
        ipcRenderer.send('site:diagnostic', { type: 'room-log', detail: line.textContent });
    }
    const toast = document.getElementById('toast');
    if (toast?.classList.contains('show') && toast.textContent !== lastToast) {
      lastToast = toast.textContent;
      if (/TURN|could not connect|publish failed|capture ended|media.*unavailable/i.test(lastToast))
        ipcRenderer.send('site:diagnostic', {
          type: 'room-warning',
          detail: lastToast,
          warning: true,
        });
    }

    const people = [...document.querySelectorAll('#people .person')];
    const streamers = people
      .filter((person) => person.querySelector('.badge'))
      .map((person) => person.querySelector('.person-name')?.textContent || '');
    const stop = document.getElementById('stopBtn');
    const sharing = Boolean(
      stop &&
      !stop.hidden &&
      !stop.classList.contains('hidden') &&
      getComputedStyle(stop).display !== 'none',
    );
    if (sharing && !streamers.some((name) => name.includes('(you)')))
      streamers.unshift((document.getElementById('myName')?.value || 'You') + ' (you)');
    const value = {
      url: location.href,
      title: document.getElementById('roomCode')?.textContent || 'SimpleShare',
      status: document.getElementById('status')?.textContent || '',
      sharing,
      canShare: Boolean(
        document.getElementById('shareBtn') && !document.getElementById('shareBtn').disabled,
      ),
      watching: [...document.querySelectorAll('.tile:not(.local):not(.idle) video')].some(
        (video) => video.readyState >= 2,
      ),
      streamers,
      theme: document.documentElement.dataset.theme,
    };
    const next = JSON.stringify(value);
    if (next !== last) {
      last = next;
      ipcRenderer.send('site:state', value);
    }
  };
  new MutationObserver(() => {
    if (!scheduled) scheduled = setTimeout(snapshot, 200);
  }).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  snapshot();
  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 203;
  const painter = canvas.getContext('2d');
  setInterval(() => {
    if (!compact) return;
    const video = document.querySelector('.tile.local video');
    if (!video || video.readyState < 2 || !video.videoWidth) {
      ipcRenderer.send('site:preview', null);
      return;
    }
    try {
      painter.fillStyle = '#101510';
      painter.fillRect(0, 0, 360, 203);
      const scale = Math.min(360 / video.videoWidth, 203 / video.videoHeight);
      const width = video.videoWidth * scale,
        height = video.videoHeight * scale;
      painter.drawImage(video, (360 - width) / 2, (203 - height) / 2, width, height);
      ipcRenderer.send('site:preview', canvas.toDataURL('image/jpeg', 0.65));
    } catch {
      ipcRenderer.send('site:preview', null);
    }
  }, 350);
});
