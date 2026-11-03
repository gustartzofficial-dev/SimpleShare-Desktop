'use strict';
let getPid;
let openProcess, queryImage, closeHandle;
const sharedHosts = new Set([
  'explorer.exe',
  'applicationframehost.exe',
  'shellexperiencehost.exe',
  'startmenuexperiencehost.exe',
  'svchost.exe',
  'dllhost.exe',
  'cmd.exe',
  'powershell.exe',
  'pwsh.exe',
  'conhost.exe',
  'windowsterminal.exe',
  'wt.exe',
]);
function windowPid(sourceId) {
  if (process.platform !== 'win32') return 0;
  const match = /^window:(\d+):\d+$/.exec(sourceId);
  if (!match || BigInt(match[1]) === 0n) return 0;
  if (!getPid) {
    const koffi = require('koffi');
    getPid = koffi
      .load('user32.dll')
      .func('uint32 __stdcall GetWindowThreadProcessId(void *hwnd, _Out_ uint32 *pid)');
    const kernel = koffi.load('kernel32.dll');
    openProcess = kernel.func(
      'void * __stdcall OpenProcess(uint32 access, int inherit, uint32 pid)',
    );
    queryImage = kernel.func(
      'int __stdcall QueryFullProcessImageNameW(void *handle, uint32 flags, void *name, _Inout_ uint32 *length)',
    );
    closeHandle = kernel.func('int __stdcall CloseHandle(void *handle)');
  }
  const pid = [0];
  getPid(BigInt(match[1]), pid);
  const handle = openProcess(0x1000, 0, pid[0]);
  if (!handle) return 0;
  try {
    const image = Buffer.alloc(65536),
      length = [32768];
    if (!queryImage(handle, 0, image, length)) return 0;
    const executable = require('node:path')
      .win32.basename(image.toString('utf16le', 0, length[0] * 2))
      .toLowerCase();
    // A shell/host can own unrelated child applications; never offer its process tree as scoped audio.
    if (sharedHosts.has(executable)) return 0;
  } finally {
    closeHandle(handle);
  }
  return pid[0];
}
module.exports = { windowPid };
