import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
assert.equal(process.platform,'linux','Run this smoke check on Linux under a desktop/Xvfb session');
const profile=path.resolve('.local/qa/linux-smoke'),executable=path.join(process.env.CARGO_TARGET_DIR||'.local/target','x86_64-unknown-linux-gnu/release/simpleshare-desktop');
await mkdir(profile,{recursive:true});
let diagnostics={},requests=0;
const fixture=await readFile('tests/linux-fixture.html','utf8');
const server=createServer((request,response)=>{
 if(request.url==='/probe'){let body='';request.on('data',data=>body+=data);request.on('end',()=>{try{diagnostics=JSON.parse(body);}catch{}response.end('ok');});return;}
 requests++;response.setHeader('Content-Type','text/html');response.end(fixture);
});
await new Promise(resolve=>server.listen(1439,'127.0.0.1',resolve));
let stderr='';const app=spawn(executable,['--qa'],{env:{...process.env,SIMPLESHARE_QA_URL:'http://127.0.0.1:1439',SIMPLESHARE_QA_PROFILE:profile,SIMPLESHARE_LINUX_SMOKE:'1',WEBKIT_DISABLE_DMABUF_RENDERER:'1'},stdio:['ignore','ignore','pipe']});
app.stderr.on('data',data=>{stderr=(stderr+data).slice(-16000);});
let failure;app.on('error',error=>failure=error);
try{
 const deadline=Date.now()+55000;let reached=false;
 while(Date.now()<deadline){
  if(diagnostics.error)throw Error(diagnostics.error+'\n'+(diagnostics.stack||''));if(failure)throw failure;if(app.exitCode!==null)throw Error(`Linux app exited ${app.exitCode}: ${stderr}`);
  try{
    const data=JSON.parse(await readFile(path.join(profile,'profile.json'),'utf8'));
    const probe=JSON.parse(await readFile(path.join(profile,'desktop-smoke.json'),'utf8'));
    if(probe.error)throw Error(probe.error);
    if(data.sitePreferences?.['simpleshare-name']==='Linux native smoke'&&data.lastRoom?.includes('abcdef1234567890abcdef12')&&probe.compactWidth<=500){reached=true;break;}
  }catch(error){if(error.message?.includes('Linux compact'))throw error;}
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 if(!reached){for(const file of ['profile.json','desktop-smoke.json'])console.log(file,await readFile(path.join(profile,file),'utf8').catch(()=>'(missing)'));}
 assert(reached,'Linux room webview must load the native bridge and persist a preference: '+JSON.stringify({requests,diagnostics})+'\n'+stderr);
 assert(!stderr.includes('panicked at'),stderr);
 console.log('PASS: Linux GTK shell and room started; native IPC saved the isolated profile.');
}finally{
 app.kill('SIGTERM');await Promise.race([new Promise(resolve=>app.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,3000))]);if(app.exitCode===null)app.kill('SIGKILL');server.close();
}
