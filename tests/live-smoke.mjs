import { _electron as electron, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
let app;
try {
  app = await electron.launch({
    executablePath: process.env.SIMPLESHARE_PACKAGED_EXE || path.join(root, 'node_modules/electron/dist/electron.exe'),
    args: [root, '--test-mode', '--profile-dir=' + path.join(root, '.local/live-smoke-profile')],
  });
  await app.firstWindow();
  await expect
    .poll(() => app.windows().some((page) => page.url().endsWith('/ui/index.html')))
    .toBe(true);
  const page = app.windows().find((page) => page.url().endsWith('/ui/index.html'));
  await expect
    .poll(
      () =>
        app.evaluate(async ({ webContents }) => {
          const site = webContents
            .getAllWebContents()
            .find((contents) =>
              contents.getURL().startsWith('https://simple-share-hazel.vercel.app'),
            );
          return site
            ? site.executeJavaScript('Boolean(document.getElementById("createBtn"))')
            : false;
        }),
      { timeout: 45000 },
    )
    .toBe(true);
  const result = await app.evaluate(async ({ webContents }) => {
    const site = webContents
      .getAllWebContents()
      .find((contents) => contents.getURL().startsWith('https://simple-share-hazel.vercel.app'));
    return site.executeJavaScript(
      '({title:document.title,bridge:window.__simpleShareCaptureInstalled,theme:document.documentElement.dataset.theme})',
    );
  });
  result.runtime = await app.evaluate(({app}) => ({ packaged: app.isPackaged, version: app.getVersion(), appPath: app.getAppPath() }));
  await page.locator('#preferencesOpen').click();
  await expect(page.locator('#preferences')).toBeVisible();
  await page.locator('#preferencesClose').click();
  const data = await app.evaluate(async ({ desktopCapturer, BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 1320, height: 850 },
    });
    return sources
      .find((source) => source.id === win.getMediaSourceId())
      ?.thumbnail.toPNG()
      .toString('base64');
  });
  await mkdir(path.join(root, '.local/qa'), { recursive: true });
  if (data)
    await writeFile(path.join(root, '.local/qa/live-desktop.png'), Buffer.from(data, 'base64'));
  await writeFile(path.join(root, '.local/qa/live-smoke.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await app?.close();
}
