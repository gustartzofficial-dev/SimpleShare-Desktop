'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const other = process.argv.includes('--other');
app.setPath(
  'userData',
  path.join(__dirname, '../.local/capture-fixture' + (other ? '-other' : '')),
);
app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 640,
    height: 420,
    title: other ? 'SimpleShare Unselected Audio' : 'SimpleShare Capture Fixture',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  win.loadURL(
    'data:text/html,' +
      encodeURIComponent(`<!doctype html><title>${other ? 'SimpleShare Unselected Audio' : 'SimpleShare Capture Fixture'}</title><body style="margin:0;background:#30362d;color:#f2f0e8;font-family:system-ui"><canvas width="640" height="360"></canvas><script>
    const c=document.querySelector('canvas'),p=c.getContext('2d');
    setInterval(()=>{p.fillStyle='#30362d';p.fillRect(0,0,640,360);p.fillStyle='#f09777';p.font='32px system-ui';p.fillText('SimpleShare native capture test',35,150);p.font='20px system-ui';p.fillText(new Date().toLocaleTimeString(),35,205)},100);
    const audio=new AudioContext(),tone=audio.createOscillator(),gain=audio.createGain();gain.gain.value=.015;tone.connect(gain);gain.connect(audio.destination);tone.start();audio.resume();
    window.audioTest={audio,tone};
  </script>`),
  );
});
app.on('window-all-closed', () => app.quit());
