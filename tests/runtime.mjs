import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(), profile=path.join(root,'.local/qa/profile');
await mkdir(profile,{recursive:true});
const html=`<!doctype html><html data-theme="dark"><body style="background:#182118;color:white"><h1>SimpleShare isolated QA</h1><input id="myName"><span id="roomCode">QA room</span><span id="status">Connected</span><button id="shareBtn">Share screen</button><button id="stopBtn" hidden>Stop</button><div class="tile local"><video autoplay muted style="width:600px"></video></div><div id="people"></div><script>
myName.value=window.__simpleShareNative?.preference('simpleshare-name')||'missing';
shareBtn.onclick=async()=>{try{window.capture=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true});document.querySelector('video').srcObject=capture;shareBtn.hidden=true;stopBtn.hidden=false;window.captureError=null;}catch(e){window.captureError=e.message;}};
stopBtn.onclick=()=>{window.capture?.getTracks().forEach(t=>t.stop());stopBtn.hidden=true;shareBtn.hidden=false;};
</script></body></html>`;
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(html);});
await new Promise(r=>server.listen(1439,'127.0.0.1',r));
let app,browser,fixture;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function bounded(promise,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' timed out')),12000);})]);}finally{clearTimeout(timer);}}
async function launch(){
 app=spawn(process.env.SIMPLESHARE_TEST_EXE||path.join(root,'.local/target/x86_64-pc-windows-msvc/debug/simpleshare-desktop.exe'),['--qa'],{cwd:root,windowsHide:true,env:{...process.env,SIMPLESHARE_QA_URL:'http://127.0.0.1:1439',SIMPLESHARE_QA_PROFILE:profile,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9225 --remote-allow-origins=*'}});
 app.stderr.on('data',d=>process.stderr.write(d));
 app.on('exit',(code,signal)=>console.log('Test app exited',code,signal));
 for(let i=0;i<100;i++){try{browser=await chromium.connectOverCDP('http://127.0.0.1:9225');break;}catch{await delay(200);}}
 assert(browser,'WebView2 CDP endpoint unavailable');
 let shell,live;
 for(let i=0;i<100;i++){const pages=browser.contexts().flatMap(c=>c.pages());shell=pages.find(p=>p.url().includes('tauri.localhost')||p.url().startsWith('http://127.0.0.1:1420'));live=pages.find(p=>p.url().startsWith('http://127.0.0.1:1439'));if(shell&&live)break;await delay(100);}
 assert(shell&&live,'Desktop shell and live webviews must load: '+browser.contexts().flatMap(c=>c.pages()).map(p=>p.url()));
 shell.on('console',m=>console.log('SHELL',m.type(),m.text()));shell.on('pageerror',e=>console.log('SHELL ERROR',e.message));
 console.log('Shell diagnostic',await shell.evaluate(()=>({url:location.href,body:document.body.innerText.slice(0,500),ipc:!!window.__TAURI_INTERNALS__,scripts:[...document.scripts].map(s=>s.src)})));
 await shell.waitForFunction(()=>window.desktop);
 await live.waitForFunction(()=>window.__simpleShareNative);
 return {shell,live};
}
const result={};
try{
 if(process.argv.includes('--capture')){
  console.log('Launching native Win32/WASAPI capture fixture');
  fixture=spawn(process.env.SIMPLESHARE_TEST_EXE||path.join(root,'.local/target/x86_64-pc-windows-msvc/debug/simpleshare-desktop.exe'),['--native-fixture'],{cwd:root,windowsHide:false,stdio:['pipe','ignore','pipe']});
  fixture.on('exit',code=>console.log('Native fixture exited',code));fixture.stderr.on('data',d=>console.log('FIXTURE',String(d)));
  await delay(1500);
 }
 let {shell,live}=await launch();
 console.log('Pages:',browser.contexts().flatMap(c=>c.pages()).map(p=>p.url()));
 const command=(name,payload)=>bounded(shell.evaluate(([name,payload])=>window.desktop.command(name,payload),[name,payload]),name);
 assert.equal((await command('ready')).ok,true);
 const initial=await live.locator('#myName').inputValue();assert(!['missing',''].includes(initial));
 await live.evaluate(()=>window.__simpleShareNative.savePreference('simpleshare-name','Tauri QA'));
 await live.waitForFunction(()=>window.__simpleShareNative.preference('simpleshare-name')==='Tauri QA');
 await command('prefs',{sidebarCollapsed:true,reopenLastRoom:true,autoUpdate:false});
 await command('collapse-sidebar');await command('collapse-sidebar');
 await command('navigate','abcdef1234567890abcdef12');
 await live.waitForURL('**/?room=abcdef1234567890abcdef12');
 await command('favorite',{name:'QA favorite'});
 await command('compact');await delay(600);
 await shell.screenshot({path:'.local/qa/compact.png'});
 await command('compact');await delay(300);
 await shell.screenshot({path:'.local/qa/shell.png'});
 assert(await shell.locator('#sidebar #sidebarToggle').count(),'Sidebar toggle must belong to the sidebar');
 const alignment=await shell.evaluate(()=>{const sidebar=document.getElementById('sidebar').getBoundingClientRect(),button=document.getElementById('createRoom').getBoundingClientRect();return Math.abs((sidebar.left+sidebar.right-button.left-button.right)/2);});assert(alignment<=1,'Collapsed new-room button must be centered');
 await command('show-notice','Sidebar notification visibility test');await live.waitForFunction(()=>document.getElementById('ss-desktop-notice')?.textContent.includes('Sidebar notification visibility test'));await live.screenshot({path:'.local/qa/notice.png'});await live.getByRole('button',{name:'Dismiss desktop notification'}).click();await command('show-notice','');result.sidebarNotices=true;
 await live.evaluate(()=>window.__TAURI_INTERNALS__.invoke('site_notice',{message:'Compact notification check'}));await command('compact');await shell.locator('#feedback').waitFor({state:'visible'});await shell.locator('#feedbackClose').click();await command('compact');await live.waitForFunction(()=>getComputedStyle(document.getElementById('ss-desktop-notice')).display==='none');result.noticeDismissalAcrossModes=true;
 result.shell=true;result.compact=true;
 if(fixture){
  console.log('Starting native capture');
  await live.locator('#shareBtn').click();
  let picker;for(let i=0;i<200;i++){picker=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('capture.html'));if(picker)break;const err=await live.evaluate(()=>window.captureError);if(err)throw Error('Capture: '+err);await delay(100);}
  assert(picker,'App-owned native capture picker must open');console.log('Native capture picker ready');picker.on('pageerror',e=>console.log('PICKER ERROR',e.message));await picker.locator('#sourceSearch').fill('SimpleShare Native Capture Fixture');
  await picker.locator('.source-preview img').first().waitFor({state:'visible',timeout:15000});assert(await picker.locator('.source-preview img').first().evaluate(image=>image.naturalWidth===320),'Source picker must show a native image preview');result.sourcePreview=true;
  await picker.locator('#refreshPreviews').click();await picker.locator('.source-preview img').first().waitFor({state:'visible',timeout:15000});result.previewRefresh=true;
  await picker.locator('.capture-source').filter({hasText:'SimpleShare Native Capture Fixture'}).first().click();await picker.screenshot({path:'.local/qa/native-picker.png'});await picker.locator('#captureConfirm').click();
  await live.waitForFunction(()=>window.capture?.getAudioTracks().length===1,{},{timeout:15000});
  await live.waitForFunction(()=>document.querySelector('video').videoWidth>0);
  result.capture=await live.evaluate(()=>({video:capture.getVideoTracks()[0].getSettings(),audio:capture.getAudioTracks()[0].readyState,scope:__simpleShareCapture.audioScope(capture)}));
  const rms=()=>live.evaluate(async()=>{const ctx=new AudioContext(),source=ctx.createMediaStreamSource(capture),analyser=ctx.createAnalyser();source.connect(analyser);await ctx.resume();await new Promise(r=>setTimeout(r,1200));const data=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(data);const rms=Math.sqrt(data.reduce((sum,n)=>sum+n*n,0)/data.length);await ctx.close();return rms;});
  result.audioRms=await rms();assert(result.audioRms>.001,'Native application audio should contain the fixture tone');
  console.log('Native video and audio are live');
  await live.evaluate(async()=>{
   const a=window.qaSender=new RTCPeerConnection(),b=window.qaReceiver=new RTCPeerConnection();window.qaRemote=new MediaStream();
   b.ontrack=e=>qaRemote.addTrack(e.track);a.onicecandidate=e=>e.candidate&&b.addIceCandidate(e.candidate).catch(()=>{});b.onicecandidate=e=>e.candidate&&a.addIceCandidate(e.candidate).catch(()=>{});
   capture.getTracks().forEach(t=>a.addTrack(t,capture));await a.setLocalDescription(await a.createOffer());await b.setRemoteDescription(a.localDescription);await b.setLocalDescription(await b.createAnswer());await a.setRemoteDescription(b.localDescription);
  });
  const receivedFrames=()=>live.evaluate(async()=>[...(await qaReceiver.getStats()).values()].find(s=>s.type==='inbound-rtp'&&s.kind==='video')?.framesDecoded||0);
  await delay(1200);const before=await receivedFrames();assert(before>0,'Native frames must traverse a real WebRTC connection');
  await command('compact');await delay(2000);assert.equal(await live.evaluate(()=>capture.getVideoTracks()[0].readyState),'live');await shell.waitForFunction(()=>!document.getElementById('localPreview').hidden);await shell.screenshot({path:'.local/qa/capture-compact.png'});await command('compact');result.webRtcFrames={before,after:await receivedFrames()};assert(result.webRtcFrames.after>before,'Native frames must keep reaching WebRTC while compact');
  fixture.stdin.write('silent\n');await delay(1300);result.silentRms=await rms();assert(result.silentRms<.001,'Stopped application audio must become silent');
  const preResize=await receivedFrames();fixture.stdin.write('resize\n');await delay(1300);result.resizeFrames={before:preResize,after:await receivedFrames()};assert(result.resizeFrames.after>preResize,'Native capture must keep sending after the selected window resizes');
  fixture.stdin.write('minimize\n');await delay(600);assert.equal(await live.evaluate(()=>capture.getVideoTracks()[0].readyState),'live');fixture.stdin.write('restore\n');await delay(1600);assert((await receivedFrames())>result.resizeFrames.after,'Native capture must resume after restoring the selected window');result.minimizeRestore=true;
  console.log('Native compact/resize/minimize checks passed; checking tray');
  const beforeTray=await receivedFrames();await command('close');await delay(1400);result.trayFrames={before:beforeTray,after:await receivedFrames()};assert(result.trayFrames.after>beforeTray,'Native frames must continue when the main window closes to the tray');
  await command('room-action','stop');await delay(500);assert.equal(await live.evaluate(()=>capture.getVideoTracks()[0].readyState),'ended');result.captureStopped=true;
  await live.evaluate(()=>{qaSender.close();qaReceiver.close();});
 }
 const forbidden=await live.evaluate(async()=>{try{await window.__TAURI_INTERNALS__.invoke('shell_command',{name:'quit'});return false;}catch{return true;}});assert(forbidden,'Remote page must not control native shell');result.remoteIsolation=true;
 await command('quit');await new Promise(r=>app.once('exit',r));await browser.close();browser=null;
 ({shell,live}=await launch());
 assert.equal(await live.locator('#myName').inputValue(),'Tauri QA');
 const saved=JSON.parse(await readFile(path.join(profile,'profile.json'),'utf8'));
 assert(saved.prefs.sidebarCollapsed);assert.equal(saved.favorites[0].name,'QA favorite');assert.equal(saved.sitePreferences['simpleshare-name'],'Tauri QA');
 result.persistence=true;
 if(fixture){
  await live.evaluate(()=>{window.restartError=null;navigator.mediaDevices.getDisplayMedia({video:{width:1280,height:720,frameRate:30},audio:false}).then(stream=>{window.restartCapture=stream;document.querySelector('video').srcObject=stream;}).catch(error=>{window.restartError=error.message;});});
  let picker;for(let i=0;i<100;i++){picker=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('capture.html'));if(picker)break;await delay(100);}assert(picker,'Native capture must be available after app restart');
  await picker.locator('#sourceSearch').fill('SimpleShare Native Capture Fixture');await picker.locator('.capture-source').first().click();await picker.locator('#captureConfirm').click();
  await live.waitForFunction(()=>window.restartCapture&&document.querySelector('video').videoWidth>0);
  await live.evaluate(()=>{navigator.mediaDevices.getDisplayMedia({video:{width:640,height:360,frameRate:5},audio:false}).then(stream=>window.secondaryCapture=stream).catch(error=>window.restartError=error.message);});
  picker=null;for(let i=0;i<100;i++){picker=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('capture.html'));if(picker)break;await delay(100);}assert(picker,'Secondary native capture selector must open');await picker.locator('#sourceSearch').fill('SimpleShare Native Capture Fixture');await picker.locator('.capture-source').first().click();await picker.locator('#captureConfirm').click();
  await live.waitForFunction(()=>window.secondaryCapture);await live.waitForFunction(async()=>{const locks=await navigator.locks.query();return locks.held.filter(lock=>lock.name.startsWith('simpleshare-capture-')).length===2;});
  await command('room-action','stop');await delay(500);assert.equal(await live.evaluate(()=>restartCapture.getVideoTracks()[0].readyState),'ended');assert.equal(await live.evaluate(()=>secondaryCapture.getVideoTracks()[0].readyState),'ended');
  await live.waitForFunction(async()=>{const locks=await navigator.locks.query();return ![...locks.held,...locks.pending].some(lock=>lock.name.startsWith('simpleshare-capture-'));});result.nativeStopAfterRestart=true;result.secondaryCaptureReleased=true;
 }
 await shell.evaluate(()=>window.desktop.command('quit'));await new Promise(r=>app.once('exit',r));
 console.log(JSON.stringify(result));
 await writeFile('.local/qa/results.json',JSON.stringify(result,null,2));
}catch(error){console.error('TEST FAILED',error);throw error;}finally{if(app?.exitCode===null)app.kill();if(fixture?.exitCode===null)fixture.kill();await Promise.race([browser?.close().catch(()=>{}),delay(2000)]);server.close();}
