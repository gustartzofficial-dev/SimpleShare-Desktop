'use strict';
const {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  desktopCapturer,
  shell,
  dialog,
  Tray,
  Menu,
  nativeImage,
  powerSaveBlocker,
  utilityProcess,
  screen,
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { SITE_URL, roomUrl, trustedSite, safeSnapshot } = require('./lib/policy.cjs');
const { Store } = require('./lib/store.cjs');
const { windowPid } = require('./native/window-process.cjs');
const ROOT = path.join(__dirname, '..');
const testMode = process.argv.includes('--test-mode');
const testUrl = testMode ? process.env.SIMPLESHARE_TEST_URL : '';
const siteOrigin = testUrl ? new URL(testUrl).origin : SITE_URL;
const initialUrl = testUrl || SITE_URL;
const profileArg = process.argv.find((arg) => arg.startsWith('--profile-dir='))?.slice(14);
const profileDirectory =
  profileArg ||
  path.join(
    app.isPackaged ? path.dirname(app.getPath('exe')) : ROOT,
    app.isPackaged ? 'user-data' : '.local/user-data',
  );
fs.mkdirSync(profileDirectory, { recursive: true });
fs.mkdirSync(path.join(profileDirectory, 'session'), { recursive: true });
app.setPath('userData', profileDirectory);
app.setPath('sessionData', path.join(profileDirectory, 'session'));
app.setName('SimpleShare Desktop');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
let win,
  site,
  store,
  tray,
  compact = false,
  normalBounds,
  snapshot = null,
  picker = null,
  quitting = false,
  powerBlock,
  loading = true,
  loadError = '',
  notice = '',
  preview = null,
  overlay = '';
const grants = new Map();
const audioJobs = new Map();
const siteScript = fs.readFileSync(path.join(__dirname, 'native/site-capture.js'), 'utf8');
const siteChrome = fs.readFileSync(path.join(__dirname, 'native/site-chrome.css'), 'utf8');
const nativeAudioSupported =
  process.platform === 'win32' &&
  process.arch === 'x64' &&
  Number(os.release().split('.')[2]) >= 20348;
function sendState() {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('shell:state', {
    version: app.getVersion(),
    compact,
    overlay,
    maximized: win.isMaximized(),
    loading,
    loadError,
    notice,
    snapshot,
    data: store.state,
    capture: picker
      ? {
          id: picker.id,
          sources: picker.sources.map(({ source, pid }) => ({
            id: source.id,
            name: source.name,
            thumbnail: source.thumbnail.toDataURL(),
            audio: nativeAudioSupported && pid > 0 && pid !== process.pid,
            display: source.id.startsWith('screen:'),
          })),
          audioRequested: picker.audioRequested,
        }
      : null,
    nativeAudioSupported,
  });
}
function layout() {
  if (!site || !win || win.isDestroyed()) return;
  const [width, height] = win.getContentSize();
  site.setBounds({
    x: 216,
    y: 52,
    width: Math.max(1, width - 216),
    height: Math.max(1, height - 52),
  });
  site.setVisible(!compact && !picker && !overlay && !loading && !loadError);
  site.webContents.send('site:compact', compact);
}
function setCompact(on) {
  if (compact === on) return;
  if (picker) cancelCapture();
  if (on) {
    normalBounds = win.getBounds();
    compact = true;
    if (win.isMaximized()) win.unmaximize();
    win.setMinimumSize(330, 340);
    win.setMaximumSize(540, 760);
    const area = screen.getDisplayMatching(normalBounds).workArea;
    win.setBounds({
      x: Math.min(normalBounds.x + normalBounds.width - 380, area.x + area.width - 380),
      y: Math.max(area.y, normalBounds.y),
      width: 380,
      height: 490,
    });
  } else {
    compact = false;
    win.setMaximumSize(0, 0);
    win.setMinimumSize(960, 620);
    if (normalBounds) win.setBounds(normalBounds);
  }
  win.setAlwaysOnTop(compact && store.state.prefs.alwaysOnTop);
  layout();
  sendState();
}
function stopAudio(id) {
  const job = audioJobs.get(id);
  if (!job) return;
  audioJobs.delete(id);
  try {
    job.process.postMessage({ type: 'stop' });
  } catch {}
  const timer = setTimeout(() => {
    try {
      job.process.kill();
    } catch {}
  }, 1000);
  timer.unref();
}
function stopAllAudio() {
  for (const id of audioJobs.keys()) stopAudio(id);
  grants.clear();
}
function cancelCapture() {
  if (!picker) return;
  const pending = picker;
  picker = null;
  clearTimeout(pending.timeout);
  pending.callback(null);
  layout();
  sendState();
}
function validSiteEvent(event) {
  return (
    site &&
    event.sender === site.webContents &&
    event.senderFrame === site.webContents.mainFrame &&
    trustedSite(event.senderFrame.url, siteOrigin)
  );
}
function validShellEvent(event) {
  return (
    win &&
    event.sender === win.webContents &&
    event.senderFrame === win.webContents.mainFrame &&
    event.senderFrame.url.startsWith('file:') &&
    event.senderFrame.url.endsWith('/ui/index.html')
  );
}
async function roomAction(action) {
  const actions = {
    share: 'shareBtn',
    stop: 'stopBtn',
    mute: 'audioBtn',
    settings: 'settingsBtn',
    copy: 'copyBtn',
  };
  const id = actions[action];
  if (!id || !site || !trustedSite(site.webContents.getURL(), siteOrigin)) return;
  if (action === 'share' && compact) setCompact(false);
  const profile = store.state.prefs.profile;
  await site.webContents.executeJavaScript(
    `(() => { const quality=document.getElementById('quality'); if(quality) quality.value=${JSON.stringify(profile)}; const button=document.getElementById(${JSON.stringify(id)}); if(button && !button.disabled) button.click(); })()`,
    true,
  );
}
async function applyProfile() {
  if (site && trustedSite(site.webContents.getURL(), siteOrigin))
    await site.webContents.executeJavaScript(
      `(() => {const item=document.getElementById('quality');if(item){item.value=${JSON.stringify(store.state.prefs.profile)};item.dispatchEvent(new Event('change',{bubbles:true}));}})()`,
    );
}
async function navigate(input, force = false) {
  const url = input === 'home' ? siteOrigin : roomUrl(input, siteOrigin);
  if (!force && snapshot?.url === url) return;
  if (snapshot?.sharing && url !== site.webContents.getURL()) {
    const result = await dialog.showMessageBox(win, {
      type: 'question',
      message: 'Leave this room?',
      detail: 'Your screen share will stop before opening another room.',
      buttons: ['Stay here', 'Leave and open'],
      defaultId: 0,
      cancelId: 0,
    });
    if (result.response !== 1) return;
    await roomAction('stop');
  }
  stopAllAudio();
  loading = true;
  loadError = '';
  preview = null;
  layout();
  sendState();
  await site.webContents.loadURL(url).catch(() => {});
}
function nativeAudioStart(id) {
  const grant = grants.get(id);
  if (
    !grant ||
    !grant.audio ||
    grant.expiresAt < Date.now() ||
    audioJobs.has(id) ||
    audioJobs.size >= 3 ||
    windowPid(grant.sourceId) !== grant.pid
  )
    return Promise.resolve({
      ok: false,
      error: 'Audio permission expired or the source changed. Select it again.',
    });
  grants.delete(id);
  return new Promise((resolve) => {
    const child = utilityProcess.fork(path.join(__dirname, 'native/audio-worker.cjs'), [], {
      serviceName: 'SimpleShare application audio',
      stdio: 'pipe',
    });
    audioJobs.set(id, { process: child, sequence: 0, pending: new Set() });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    const fail = (message) => {
      notice = 'Application audio stopped: ' + message;
      site.webContents.send('site:audio', { id, error: message });
      finish({ ok: false, error: message });
      stopAudio(id);
      sendState();
    };
    const timeout = setTimeout(
      () => fail('The audio engine did not respond. Try sharing again.'),
      8000,
    );
    child.stdout?.on('data', () => {});
    child.stderr?.on('data', () => {});
    child.on('message', (data) => {
      if (data.type === 'ready') child.postMessage({ type: 'start', pid: grant.pid });
      else if (data.type === 'started') finish({ ok: true });
      else if (data.type === 'error') fail(String(data.message).slice(0, 200));
      else if (data.type === 'pcm' && audioJobs.has(id) && data.bytes?.byteLength <= 65536) {
        const job = audioJobs.get(id);
        const sequence = ++job.sequence;
        job.pending.add(sequence);
        site.webContents.send('site:audio', { id, bytes: data.bytes, sequence });
      }
    });
    child.on('exit', () => {
      if (audioJobs.has(id)) fail('The native audio process exited.');
    });
  });
}
function setupCapture() {
  const session = site.webContents.session;
  session.setPermissionCheckHandler(
    (contents, permission, requestingOrigin) =>
      contents === site.webContents &&
      trustedSite(requestingOrigin, siteOrigin) &&
      ['display-capture', 'clipboard-sanitized-write'].includes(permission),
  );
  session.setPermissionRequestHandler((contents, permission, callback, details) =>
    callback(
      contents === site.webContents &&
        details.isMainFrame !== false &&
        trustedSite(details.requestingUrl || contents.getURL(), siteOrigin) &&
        ['display-capture', 'clipboard-sanitized-write'].includes(permission),
    ),
  );
  session.setDisplayMediaRequestHandler(async (request, callback) => {
    if (
      picker ||
      !request.userGesture ||
      !request.frame ||
      request.frame !== site.webContents.mainFrame ||
      !trustedSite(request.frame.url, siteOrigin) ||
      !request.videoRequested
    ) {
      callback(null);
      return;
    }
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: false,
      });
      const ownSource = win.getMediaSourceId();
      picker = {
        id: crypto.randomUUID(),
        callback,
        sources: sources
          .filter((source) => source.id !== ownSource)
          .slice(0, 60)
          .map((source) => {
            let pid = 0;
            try {
              pid = windowPid(source.id);
            } catch {}
            return { source, pid };
          }),
        audioRequested: request.audioRequested,
        frame: request.frame,
      };
      picker.timeout = setTimeout(cancelCapture, 120000);
      layout();
      sendState();
    } catch {
      callback(null);
      notice = 'Windows could not list shareable sources. Try again.';
      sendState();
    }
  });
}
async function chooseCapture(payload) {
  if (!picker || payload?.requestId !== picker.id)
    throw new Error('This screen selection has expired.');
  const choice = picker.sources.find(({ source }) => source.id === payload.sourceId);
  if (!choice) throw new Error('Select an application or display.');
  const sourceExists = (
    await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 0, height: 0 },
    })
  ).some((source) => source.id === choice.source.id && source.name === choice.source.name);
  if (!sourceExists || picker.frame !== site.webContents.mainFrame) {
    cancelCapture();
    throw new Error('The selected source closed or changed. Share again.');
  }
  const audio =
    payload.audio === true &&
    picker.audioRequested &&
    nativeAudioSupported &&
    choice.pid > 0 &&
    choice.pid !== process.pid;
  if (audio && windowPid(choice.source.id) !== choice.pid) {
    cancelCapture();
    throw new Error('The application changed. Select it again.');
  }
  const id = crypto.randomUUID();
  for (const [key, value] of grants) if (value.expiresAt < Date.now()) grants.delete(key);
  grants.set(id, {
    id,
    audio,
    pid: choice.pid,
    sourceId: choice.source.id,
    expiresAt: Date.now() + 15000,
    taken: false,
  });
  const pending = picker;
  picker = null;
  clearTimeout(pending.timeout);
  pending.callback({ video: choice.source });
  layout();
  sendState();
}
function powerState() {
  const active = snapshot?.sharing || snapshot?.watching;
  if (active && powerBlock === undefined)
    powerBlock = powerSaveBlocker.start('prevent-app-suspension');
  if (!active && powerBlock !== undefined) {
    powerSaveBlocker.stop(powerBlock);
    powerBlock = undefined;
  }
}
function showWindow() {
  win.show();
  if (win.isMinimized()) win.restore();
  win.focus();
}
async function quitApp() {
  if (!testMode && snapshot?.sharing) {
    const answer = await dialog.showMessageBox(win, {
      type: 'question',
      message: 'Stop sharing and quit?',
      buttons: ['Keep sharing', 'Stop and quit'],
      defaultId: 0,
      cancelId: 0,
    });
    if (answer.response !== 1) return;
  }
  quitting = true;
  stopAllAudio();
  app.quit();
}
function initializeIpc() {
  ipcMain.handle('shell:command', async (event, name, payload) => {
    if (!validShellEvent(event)) throw new Error('Unauthorized desktop request.');
    try {
      if (name === 'ready') {
        sendState();
        return { ok: true };
      }
      if (name === 'minimize') win.minimize();
      else if (name === 'maximize') {
        if (!compact) win.isMaximized() ? win.unmaximize() : win.maximize();
      } else if (name === 'close') win.close();
      else if (name === 'quit') await quitApp();
      else if (name === 'compact') setCompact(!compact);
      else if (name === 'preferences') {
        overlay = overlay ? '' : 'preferences';
        layout();
        sendState();
      } else if (name === 'navigate') await navigate(payload);
      else if (name === 'create')
        await navigate(
          new URL('/?room=' + crypto.randomBytes(12).toString('hex'), siteOrigin).href,
        );
      else if (name === 'favorite') {
        store.favorite(payload?.url || snapshot?.url, payload?.name);
        sendState();
      } else if (name === 'remove-favorite') {
        store.remove(payload);
        sendState();
      } else if (name === 'prefs') {
        store.prefs(payload);
        await applyProfile();
        win.setAlwaysOnTop(compact && store.state.prefs.alwaysOnTop);
        sendState();
      } else if (name === 'capture-select') await chooseCapture(payload);
      else if (name === 'capture-cancel') cancelCapture();
      else if (name === 'room-action') {
        if (!['share', 'stop', 'mute', 'settings', 'copy'].includes(payload))
          throw new Error('Unknown room action.');
        await roomAction(payload);
      } else if (name === 'retry') await navigate(snapshot?.room ? snapshot.url : 'home', true);
      else if (name === 'dismiss-notice') {
        notice = '';
        sendState();
      } else if (name !== 'minimize' && name !== 'ready')
        throw new Error('Unknown desktop action.');
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  ipcMain.handle('site:grant', (event) => {
    if (!validSiteEvent(event)) throw new Error('Unauthorized capture request.');
    const grant = [...grants.values()].find(
      (value) => !value.taken && value.expiresAt > Date.now(),
    );
    if (!grant) return null;
    grant.taken = true;
    if (!grant.audio) grants.delete(grant.id);
    return { id: grant.id, audio: grant.audio };
  });
  ipcMain.handle('site:audio-start', (event, id) => {
    if (!validSiteEvent(event)) throw new Error('Unauthorized audio request.');
    return nativeAudioStart(id);
  });
  ipcMain.on('site:audio-stop', (event, id) => {
    if (validSiteEvent(event)) {
      stopAudio(id);
      grants.delete(id);
    }
  });
  ipcMain.on('site:audio-ack', (event, value) => {
    if (!validSiteEvent(event) || !value || !Number.isInteger(value.sequence)) return;
    const job = audioJobs.get(value.id);
    if (!job || !job.pending.delete(value.sequence)) return;
    try {
      job.process.postMessage({ type: 'credit' });
    } catch {
      stopAudio(value.id);
    }
  });
  ipcMain.on('site:state', (event, value) => {
    if (!validSiteEvent(event)) return;
    const next = safeSnapshot(value, siteOrigin);
    if (!next) return;
    snapshot = next;
    if (!snapshot.sharing) preview = null;
    powerState();
    sendState();
  });
  ipcMain.on('site:preview', (event, value) => {
    if (!validSiteEvent(event) || !compact) return;
    if (
      value !== null &&
      (typeof value !== 'string' ||
        !value.startsWith('data:image/jpeg;base64,') ||
        value.length > 180000)
    )
      return;
    preview = value;
    win.webContents.send('shell:preview', preview);
  });
}
function createWindow() {
  Menu.setApplicationMenu(null);
  store = new Store(profileDirectory, siteOrigin);
  win = new BrowserWindow({
    width: 1320,
    height: 850,
    minWidth: 960,
    minHeight: 620,
    frame: false,
    backgroundColor: '#1c201c',
    show: false,
    icon: path.join(ROOT, 'assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload-shell.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
    },
  });
  site = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload-site.cjs'),
      partition: 'persist:live-site',
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
      spellcheck: false,
    },
  });
  site.setBackgroundColor('#1c201c');
  win.contentView.addChildView(site);
  site.setVisible(false);
  initializeIpc();
  setupCapture();
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  site.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') && !testMode) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  site.webContents.on('will-navigate', (event, url) => {
    if (!trustedSite(url, siteOrigin)) event.preventDefault();
  });
  site.webContents.on('will-frame-navigate', (event) => {
    if (!event.isMainFrame) event.preventDefault();
  });
  site.webContents.on('will-attach-webview', (event) => event.preventDefault());
  site.webContents.on('will-prevent-unload', (event) => event.preventDefault());
  site.webContents.on('did-start-navigation', (_event, _url, inPlace, isMainFrame) => {
    if (isMainFrame && !inPlace) {
      stopAllAudio();
      cancelCapture();
      snapshot = null;
      preview = null;
      loading = true;
      loadError = '';
      powerState();
      layout();
      sendState();
    }
  });
  site.webContents.on('dom-ready', async () => {
    if (!trustedSite(site.webContents.getURL(), siteOrigin)) return;
    try {
      await site.webContents.insertCSS(siteChrome);
      await site.webContents.executeJavaScript(siteScript);
      await applyProfile();
    } catch {
      notice =
        'Native audio integration could not load. Screen capture is still available without application audio.';
    }
    loading = false;
    loadError = '';
    layout();
    sendState();
  });
  site.webContents.on('did-navigate', (_event, url) => {
    try {
      store.visit(url);
    } catch {}
    sendState();
  });
  site.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    loading = false;
    loadError = 'The live site could not load. Check your connection and try again.';
    layout();
    sendState();
  });
  site.webContents.on('render-process-gone', () => {
    stopAllAudio();
    snapshot = null;
    loading = false;
    loadError = 'The room renderer stopped. Reopen the live site to reconnect.';
    layout();
    sendState();
  });
  win.on('resize', () => {
    layout();
    sendState();
  });
  win.on('maximize', sendState);
  win.on('unmaximize', sendState);
  win.on('close', (event) => {
    if (!quitting && store.state.prefs.closeToTray && tray) {
      event.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => {
    stopAllAudio();
    site.webContents.close();
    app.quit();
  });
  win.once('ready-to-show', () => {
    win.show();
  });
  win.loadFile(path.join(__dirname, 'ui/index.html'));
  tray = new Tray(
    nativeImage
      .createFromPath(path.join(ROOT, 'assets/icon.png'))
      .resize({ width: 20, height: 20 }),
  );
  tray.setToolTip('SimpleShare Desktop');
  tray.on('double-click', showWindow);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open SimpleShare', click: showWindow },
      {
        label: 'Toggle compact mode',
        click: () => {
          showWindow();
          setCompact(!compact);
        },
      },
      { label: 'Stop sharing', click: () => roomAction('stop') },
      { type: 'separator' },
      { label: 'Quit', click: quitApp },
    ]),
  );
  layout();
  site.webContents
    .loadURL(
      store.state.prefs.reopenLastRoom && store.state.lastRoom ? store.state.lastRoom : initialUrl,
    )
    .catch(() => {});
}
const instanceLock = app.requestSingleInstanceLock();
if (!instanceLock) app.quit();
else {
  app.on('second-instance', () => {
    if (win) showWindow();
  });
  app
    .whenReady()
    .then(createWindow)
    .catch((error) => {
      fs.writeFileSync(
        path.join(profileDirectory, 'startup-error.log'),
        error.stack || error.message,
      );
      console.error(error);
      app.exit(1);
    });
  app.on('before-quit', () => {
    quitting = true;
    stopAllAudio();
    if (powerBlock !== undefined) powerSaveBlocker.stop(powerBlock);
  });
}
