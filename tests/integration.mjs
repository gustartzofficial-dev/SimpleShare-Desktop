import { _electron as electron, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const output = path.join(root, '.local/qa');
await mkdir(output, { recursive: true });
const id = 'abcdef1234567890abcdef12';
const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(`<!doctype html><html data-theme="dark"><head><title>SimpleShare live contract fixture</title><style>body{margin:0;background:#1c201c;color:#f2f0e8;font:16px system-ui;padding:32px}button,select{padding:12px;margin:8px;background:#f09777;color:#222;border:0;border-radius:8px}.tile video{width:80%;background:#111}.person{padding:10px}.hidden,[hidden]{display:none}</style></head><body><h1 id="roomCode">Native test room</h1><span id="status">Connected</span><input id="myName" value="Local tester"><select id="quality"><option>720p30</option><option selected>720p60</option><option>1080p60</option></select><button id="shareBtn">Share screen</button><button id="stopBtn" hidden>Stop sharing</button><button id="copyBtn">Copy invite</button><button id="audioBtn">Mute</button><button id="settingsBtn">Settings</button><div id="people"><div class="person"><span class="person-name">Local tester (you)</span></div></div><div class="tile local"><video autoplay muted playsinline></video></div><script>
    let media;window.captureResult=null;
    document.getElementById('shareBtn').onclick=async()=>{try{media=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true});document.querySelector('video').srcObject=media;document.getElementById('stopBtn').hidden=false;document.getElementById('people').firstElementChild.insertAdjacentHTML('beforeend','<span class="badge">LIVE</span>');window.captureResult={video:media.getVideoTracks().length,audio:media.getAudioTracks().length};window.currentCapture=media;}catch(e){window.captureResult={error:e.message}}};
    document.getElementById('stopBtn').onclick=()=>{media?.getTracks().forEach(t=>t.stop());document.querySelector('video').srcObject=null;document.getElementById('stopBtn').hidden=true;document.querySelector('.badge')?.remove();};
  </script></body></html>`);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const executablePath = path.join(root, 'node_modules/electron/dist/electron.exe');
let app, fixture, other;
const errors = [];
const remote = (code) =>
  app.evaluate(
    async ({ webContents }, { base, code }) => {
      const site = webContents
        .getAllWebContents()
        .find((contents) => contents.getURL().startsWith(base));
      if (!site) throw Error('No live view');
      return site.executeJavaScript(code, true);
    },
    { base, code },
  );
try {
  fixture = await electron.launch({
    executablePath,
    args: [path.join(root, 'tests/capture-fixture.cjs')],
  });
  const targetPage = await fixture.firstWindow();
  other = await electron.launch({
    executablePath,
    args: [path.join(root, 'tests/capture-fixture.cjs'), '--other'],
  });
  await other.firstWindow();
  app = await electron.launch({
    executablePath: process.env.SIMPLESHARE_PACKAGED_EXE || executablePath,
    args: [root, '--test-mode', '--profile-dir=' + path.join(root, '.local/integration-profile')],
    env: { ...process.env, SIMPLESHARE_TEST_URL: base + '/?room=' + id },
  });
  await app.firstWindow();
  await expect
    .poll(() => app.windows().some((page) => page.url().endsWith('/ui/index.html')), {
      timeout: 15000,
    })
    .toBe(true);
  const page = app.windows().find((page) => page.url().endsWith('/ui/index.html'));
  console.log('Desktop shell loaded');
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.locator('#windowTitle')).toHaveText('Native test room', { timeout: 30000 });
  console.log('Live room connected');
  await page.locator('#saveCurrent').click();
  await expect(page.locator('#favoriteCount')).toHaveText('1');
  await page.locator('#favorites .room-item').hover();
  await page.getByRole('button', { name: /Rename Room/ }).click();
  await page.getByLabel('Saved room name').fill('Game night');
  await page.getByLabel('Saved room name').press('Enter');
  await expect(page.locator('#favorites .room-name')).toHaveText('Game night');
  await page.locator('#preferencesOpen').click();
  await expect(page.locator('#preferences')).toBeVisible();
  await page.locator('#qualityProfile').selectOption('1080p60');
  await expect.poll(() => remote('document.getElementById("quality").value')).toBe('1080p60');
  await page.locator('#preferencesClose').click();
  await page.locator('#compactToggle').click();
  await expect(page.locator('#compactPanel')).toBeVisible();
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop()),
    )
    .toBe(true);
  await expect(page.locator('#compactShare')).toBeEnabled();
  await page.locator('#compactRestore').click();
  console.log('Favorites, preferences and compact view checked');
  await remote('document.getElementById("shareBtn").click()');
  await expect(page.locator('#capturePicker')).toBeVisible({ timeout: 30000 });
  const source = page.getByRole('button', {
    name: 'Share SimpleShare Capture Fixture',
    exact: true,
  });
  await expect(source).toBeVisible();
  await source.click();
  await page.locator('#displaysTab').click();
  await expect(page.locator('#captureConfirm')).toBeDisabled();
  await page.locator('#windowsTab').click();
  await source.click();
  await page.locator('#captureAudio').check();
  console.log('Application selected; starting native capture');
  await page.locator('#captureConfirm').click();
  await expect
    .poll(() => remote('window.captureResult'), { timeout: 30000 })
    .toEqual({ video: 1, audio: 1 });
  const beforeFavorite = await remote('window.currentCapture.id');
  await page.locator('#favorites .room-link').click();
  if ((await remote('window.currentCapture?.id')) !== beforeFavorite)
    throw Error('Opening the current favorite reloaded an active room');
  const result = await remote(
    `(async()=>{const context=new AudioContext({sampleRate:48000}),source=context.createMediaStreamSource(window.currentCapture),meter=context.createAnalyser();source.connect(meter);await context.resume();let peak=0;const samples=new Float32Array(meter.fftSize);for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,50));meter.getFloatTimeDomainData(samples);peak=Math.max(peak,Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length))}await context.close();return {rms:peak,width:document.querySelector('video').videoWidth}})()`,
  );
  if (result.width <= 0 || result.rms < 0.001)
    throw Error('Native video or selected-process audio was missing');
  await targetPage.evaluate(() => window.audioTest.audio.suspend());
  const isolationRms = await remote(
    `(async()=>{const context=new AudioContext({sampleRate:48000}),source=context.createMediaStreamSource(window.currentCapture),meter=context.createAnalyser();source.connect(meter);await context.resume();await new Promise(r=>setTimeout(r,500));let peak=0;const samples=new Float32Array(meter.fftSize);for(let i=0;i<20;i++){await new Promise(r=>setTimeout(r,50));meter.getFloatTimeDomainData(samples);peak=Math.max(peak,Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length))}await context.close();return peak})()`,
  );
  if (isolationRms > 0.0001) throw Error('Unselected process audio leaked: ' + isolationRms);
  result.unselectedProcessRms = isolationRms;
  await page.locator('#compactToggle').click();
  await expect(page.locator('#compactStatus')).toHaveText('Sharing');
  await expect(page.locator('#localPreview')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#streamerCount')).toHaveText('1');
  await page.screenshot({ path: path.join(output, 'compact.png') });
  await remote(
    `for(let i=0;i<9;i++){const row=document.createElement('div');row.className='person';row.innerHTML='<span class=person-name>Test peer '+i+'</span><span class=badge>LIVE</span>';document.getElementById('people').append(row)}`,
  );
  await expect(page.locator('#streamerCount')).toHaveText('10');
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setBounds({ width: 330, height: 340 }),
  );
  await expect
    .poll(() =>
      page
        .locator('#compactStop')
        .evaluate((button) => button.getBoundingClientRect().bottom <= innerHeight),
    )
    .toBe(true);
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setBounds({ width: 380, height: 490 }),
  );
  await page.locator('#compactStop').click();
  await expect(page.locator('#compactStatus')).toHaveText('Connected');
  await expect
    .poll(() => remote('window.currentCapture.getTracks().every(t=>t.readyState==="ended")'))
    .toBe(true);
  await expect
    .poll(() =>
      app.evaluate(({ app }) =>
        app.getAppMetrics().some((item) => item.name === 'SimpleShare application audio'),
      ),
    )
    .toBe(false);
  await page.locator('#compactRestore').click();
  await page.screenshot({ path: path.join(output, 'full.png') });
  const privacy = await app.evaluate(({ webContents }) =>
    webContents
      .getAllWebContents()
      .filter((contents) => contents.getURL().startsWith('http'))
      .map((contents) => {
        const prefs = contents.getLastWebPreferences();
        return {
          sandbox: prefs.sandbox,
          isolation: prefs.contextIsolation,
          node: prefs.nodeIntegration,
        };
      }),
  );
  if (privacy.some((prefs) => !prefs.sandbox || !prefs.isolation || prefs.node))
    throw Error('Remote view privileges are unsafe');
  await writeFile(
    path.join(output, 'integration.json'),
    JSON.stringify(
      {
        nativeCapture: result,
        privacy,
        errors,
        favorites: 'saved',
        compact: 'same room and live preview',
        teardown: 'tracks ended',
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ nativeCapture: result, privacy, errors }));
} finally {
  await app?.close();
  await fixture?.close();
  await other?.close();
  server.close();
}
