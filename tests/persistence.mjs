import { _electron as electron, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const output = path.join(root, '.local');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(path.join(output, 'persistence-'));
const server = createServer(async (req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname;
  if (['/storage.js', '/identity.js'].includes(name)) {
    res.writeHead(200, { 'content-type': 'text/javascript' });
    res.end(
      await readFile(
        path.join(root, '../public/lib', name === '/storage.js' ? 'room.js' : 'identity.js'),
        'utf8',
      ),
    );
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(`<!doctype html><html data-theme=dark><body><h1 id=roomCode>Profile test</h1><input id=myName aria-label="Display name"><output id=loadedName></output><script type=module>
 import {storage} from '/storage.js';import {savedDisplayName} from '/identity.js';
 const input=document.getElementById('myName');const name=savedDisplayName(storage,()=> 'Guest Fixture');input.value=name;document.getElementById('loadedName').textContent=name;
 input.addEventListener('change',()=>{storage.set('simpleshare-name',input.value);document.getElementById('loadedName').textContent=input.value;});
 window.profileTest={storage};
 </script></body></html>`);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
let app;
async function launch() {
  app = await electron.launch({
    executablePath:
      process.env.SIMPLESHARE_PACKAGED_EXE ||
      path.join(root, 'node_modules/electron/dist/electron.exe'),
    args: [root, '--test-mode', '--profile-dir=' + profile],
    env: { ...process.env, SIMPLESHARE_TEST_URL: base },
  });
  await app.firstWindow();
  await expect
    .poll(() => app.windows().some((p) => p.url().startsWith(base)), { timeout: 15000 })
    .toBe(true);
  const page = app.windows().find((p) => p.url().startsWith(base));
  await expect(page.locator('#loadedName')).not.toBeEmpty();
  return page;
}
try {
  let page = await launch();
  const generated = await page.locator('#myName').inputValue();
  expect(generated).toMatch(/^Guest /);
  await app.close();
  app = null;
  page = await launch();
  expect(await page.locator('#myName').inputValue()).toBe(generated);
  await page.locator('#myName').fill('Gusta');
  await page.locator('#myName').dispatchEvent('change');
  await expect(page.locator('#loadedName')).toHaveText('Gusta');
  await page.evaluate(() => {
    window.profileTest.storage.set('simpleshare-theme', 'light');
    window.profileTest.storage.set('simpleshare-muted', 'true');
    window.profileTest.storage.set('simpleshare-volume', '0');
  });
  const prefs = JSON.parse(
    await readFile(path.join(profile, 'desktop.json'), 'utf8'),
  ).sitePreferences;
  expect(prefs['simpleshare-name']).toBe('Gusta');
  // Simulate missing Chromium local data while preserving the native backup. Do not let pagehide re-import old values.
  await page.evaluate(() => localStorage.clear());
  await app.close();
  app = null;
  page = await launch();
  expect(await page.locator('#myName').inputValue()).toBe('Gusta');
  const restored = await page.evaluate(() =>
    Object.fromEntries(
      ['simpleshare-theme', 'simpleshare-muted', 'simpleshare-volume'].map((key) => [
        key,
        localStorage.getItem(key),
      ]),
    ),
  );
  expect(restored).toEqual({
    'simpleshare-theme': 'light',
    'simpleshare-muted': 'true',
    'simpleshare-volume': '0',
  });
  expect(
    await page.evaluate(() =>
      window.__simpleShareNative.savePreference('participant-token', 'secret'),
    ),
  ).toBe(false);
  console.log(
    JSON.stringify({
      generatedNameSurvivesRestart: true,
      customNameSurvivesRestart: true,
      settingsRestoredAfterBrowserDataLoss: true,
      credentialsRejected: true,
      runtime: await app.evaluate(({ app }) => ({
        packaged: app.isPackaged,
        version: app.getVersion(),
      })),
    }),
  );
} finally {
  await app?.close();
  server.close();
}
