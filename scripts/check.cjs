'use strict';
const { readdirSync } = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
function check(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) check(file);
    else if (/\.(cjs|js)$/.test(file))
      execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  }
}
check(path.join(__dirname, '../src'));
check(path.join(__dirname, '../scripts'));
