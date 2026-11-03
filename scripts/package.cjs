'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { packager } = require('@electron/packager');
const root = path.join(__dirname, '..');
async function build() {
  const result = await packager({
    dir: root,
    name: 'SimpleShare Desktop',
    appBundleId: 'dev.simpleshare.desktop',
    platform: 'win32',
    arch: 'x64',
    electronVersion: '45.2.1',
    download: { cacheRoot: path.join(root, '.local/electron-cache') },
    tmpdir: path.join(root, '.local/package-temp'),
    out: path.join(root, 'release'),
    overwrite: false,
    asar: false,
    prune: true,
    icon: path.join(root, 'assets/icon.ico'),
    ignore: [
      /^\/\.local(?:\/|$)/,
      /^\/tests(?:\/|$)/,
      /^\/release(?:\/|$)/,
      /^\/\.git(?:\/|$)/,
      /^\/user-data(?:\/|$)/,
    ],
    win32metadata: {
      CompanyName: 'SimpleShare',
      FileDescription: 'SimpleShare Desktop',
      ProductName: 'SimpleShare Desktop',
    },
  });
  for (const directory of result)
    fs.writeFileSync(
      path.join(directory, 'START-HERE.txt'),
      'Open SimpleShare Desktop.exe. Keep the entire folder together. Local rooms and preferences are stored in user-data beside the app. This is an unsigned preview build.\r\n',
    );
  console.log(result.join('\n'));
}
build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
