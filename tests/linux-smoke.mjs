import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdir,readFile,access} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
assert.equal(process.platform,'linux');
const profile=path.resolve(process.env.SIMPLESHARE_LINUX_TEST_PROFILE||'.local/qa/linux-smoke'),executable=process.env.SIMPLESHARE_LINUX_TEST_EXECUTABLE||path.join(process.env.CARGO_TARGET_DIR||'.local/target','x86_64-unknown-linux-gnu/release/simpleshare-desktop');
await mkdir(profile,{recursive:true});
let chromePath;for(const p of [process.env.CHROMIUM,'/usr/bin/google-chrome','/usr/bin/chromium'].filter(Boolean))try{await access(p);chromePath=p;break;}catch{}
assert(chromePath,'A Chromium test peer is required for Linux/browser media interop');
const browser=await chromium.launch({executablePath:chromePath,headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const peer=await browser.newPage();let diagnostics={},requests=0,stderr='',app;
function stopOwnedGroup(signal){if(app?.pid)try{process.kill(-app.pid,signal);}catch(error){if(error.code!=='ESRCH')throw error;}}
process.on('exit',()=>stopOwnedGroup('SIGKILL'));
const watchdog=setTimeout(()=>{console.error('Linux smoke watchdog expired',JSON.stringify({requests,diagnostics}),stderr);process.exit(1);},120000);watchdog.unref();
const fixture=await readFile('tests/linux-fixture.html','utf8');
const server=createServer(async(request,response)=>{
 try{
  if(request.url==='/probe'||request.url==='/offer'){
   let body='';for await(const chunk of request)body+=chunk;const value=JSON.parse(body);
   if(request.url==='/probe'){diagnostics=value;response.end('ok');return;}
   const answer=await peer.evaluate(async offer=>{
    const b=window.receiver=new RTCPeerConnection({iceServers:[]});
    b.ondatachannel=e=>e.channel.onmessage=event=>e.channel.send(event.data);
    const video=window.remoteVideo=document.createElement('video');video.autoplay=true;video.muted=true;document.body.append(video);b.ontrack=e=>{video.srcObject=e.streams[0]||new MediaStream([e.track]);video.play().catch(()=>{});};
    await b.setRemoteDescription(offer);
    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;document.body.append(canvas);const paint=canvas.getContext('2d');let n=0;window.paintTimer=setInterval(()=>{paint.fillStyle=n++%2?'#c4d297':'#172015';paint.fillRect(0,0,320,180);},100);window.returnStream=canvas.captureStream(10);b.addTrack(returnStream.getVideoTracks()[0],returnStream);
    await b.setLocalDescription(await b.createAnswer());const deadline=Date.now()+7000;while(b.iceGatheringState!=='complete'&&Date.now()<deadline)await new Promise(r=>setTimeout(r,50));return b.localDescription.toJSON();
   },value);response.setHeader('Content-Type','application/json');response.end(JSON.stringify(answer));return;
  }
  requests++;response.setHeader('Content-Type','text/html');response.end(request.url==='/browser'?'<html><body>SimpleShare browser peer</body></html>':fixture);
 }catch(error){diagnostics={error:String(error)};response.writeHead(500).end(JSON.stringify(diagnostics));}
});
await new Promise(r=>server.listen(1439,'127.0.0.1',r));await peer.goto('http://127.0.0.1:1439/browser');
try{
 app=spawn(executable,['--qa'],{env:{...process.env,SIMPLESHARE_QA_URL:'http://127.0.0.1:1439',SIMPLESHARE_QA_PROFILE:profile,SIMPLESHARE_LINUX_SMOKE:'1',WEBKIT_DISABLE_DMABUF_RENDERER:'1'},detached:true,stdio:['ignore','ignore','pipe']});app.stderr.on('data',data=>stderr=(stderr+data).slice(-16000));let failure;app.on('error',error=>failure=error);
 const deadline=Date.now()+65000;let reached=false;
 while(Date.now()<deadline){
  if(failure)throw failure;if(app.exitCode!==null)throw Error(`Linux app exited ${app.exitCode}: ${stderr}`);if(diagnostics.error)throw Error(diagnostics.error+'\n'+(diagnostics.stack||''));
  let data,probe;try{data=JSON.parse(await readFile(path.join(profile,'profile.json'),'utf8'));probe=JSON.parse(await readFile(path.join(profile,'desktop-smoke.json'),'utf8'));}catch{}
  if(probe?.error)throw Error(probe.error+" "+JSON.stringify({requests,diagnostics})+"\n"+stderr);
  if(data?.sitePreferences?.['simpleshare-name']==='Linux native smoke'&&data.lastRoom?.includes('abcdef1234567890abcdef12')&&probe?.compactWidth<=500){reached=true;break;}
  await new Promise(r=>setTimeout(r,250));
 }
 assert(reached,'Linux bridge/profile/compact check failed: '+JSON.stringify({requests,diagnostics})+'\n'+stderr);
 let frames=0;const mediaDeadline=Date.now()+25000;while(!frames&&Date.now()<mediaDeadline){frames=await peer.evaluate(async()=>[...(await receiver.getStats()).values()].find(s=>s.type==='inbound-rtp'&&s.kind==='video')?.framesDecoded||0);await new Promise(r=>setTimeout(r,100));}assert(frames>0,'Browser must decode video from the Linux Rust transport: '+JSON.stringify(diagnostics)+' '+JSON.stringify(await peer.evaluate(async()=>[...(await receiver.getStats()).values()])));
 console.log('PASS: Linux/browser bidirectional video, data channel, native IPC, persistent profile and compact window.',JSON.stringify({browserFrames:frames,...diagnostics}));
}finally{
 if(app){stopOwnedGroup('SIGTERM');await Promise.race([new Promise(r=>app.once('exit',r)),new Promise(r=>setTimeout(r,3000))]);stopOwnedGroup('SIGKILL');}
 server.closeAllConnections();server.close();
 await Promise.race([browser.close(),new Promise((_,reject)=>setTimeout(()=>reject(Error('Browser peer cleanup timed out')),10000).unref())]);clearTimeout(watchdog);
}
