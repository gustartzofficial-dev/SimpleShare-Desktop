import {invoke,Channel} from '@tauri-apps/api/core';
(()=>{
 const ORIGIN=__SS_ORIGIN_JSON__,saved=__SS_PREFS_JSON__;
 if(window.top!==window.self||location.origin!==ORIGIN||location.pathname!=='/')return;
 const keys=['simpleshare-name','simpleshare-theme','simpleshare-muted','simpleshare-volume','simpleshare-sfx','simpleshare-primary-mix','simpleshare-extra-mix'];
 const pending=new Set();
 function savePreference(key,value){if(!keys.includes(key)||typeof value!=='string')return false;saved[key]=value;try{localStorage.setItem(key,value);}catch{}const request=invoke('site_preferences',{operation:'save',key,value}).catch(error=>invoke('site_notice',{message:'Could not save your preferences: '+error}).catch(()=>{})).finally(()=>pending.delete(request));pending.add(request);return true;}
 // Initialization scripts are reused on navigation. The WebView profile contains newer
 // values than the startup snapshot after an in-app name or volume change.
 for(const key of keys)try{const value=localStorage.getItem(key);if(value!=null){saved[key]=value;savePreference(key,value);}else if(saved[key]!=null)localStorage.setItem(key,saved[key]);}catch{}
 window.__simpleShareNative=Object.freeze({preference:key=>keys.includes(key)?saved[key]??null:null,savePreference});
 window.__ssImportPreferences=values=>{for(const [key,value]of Object.entries(values))if(keys.includes(key)){saved[key]=value;try{localStorage.setItem(key,value);}catch{}}location.reload();};
 window.__ssFlushAndQuit=async token=>{for(const key of keys)try{const value=localStorage.getItem(key);if(value!=null)savePreference(key,value);}catch{}await Promise.allSettled([...pending]);await invoke('site_quit',{token});};
 window.__ssCompact=false;
 let desktopToast;
 window.__ssDesktopNotice=message=>{
  if(!document.body)return;
  if(!message&&!desktopToast)return;
  if(!desktopToast){desktopToast=document.createElement('div');desktopToast.id='ss-desktop-notice';desktopToast.setAttribute('role','status');desktopToast.style.cssText='position:fixed;top:16px;right:16px;z-index:2147483647;max-width:min(360px,calc(100vw - 32px));padding:14px 12px 14px 16px;display:flex;align-items:start;gap:16px;background:#30362d;color:#f2f0e8;border:1px solid #f09777;border-radius:10px;box-shadow:0 8px 30px #0004;font:13px/1.6 system-ui;overflow-wrap:anywhere';const text=document.createElement('span'),close=document.createElement('button');text.className='notice-text';close.textContent='×';close.setAttribute('aria-label','Dismiss desktop notification');close.style.cssText='border:0;background:none;color:inherit;font-size:20px;cursor:pointer;padding:0 4px';close.onclick=()=>{desktopToast.hidden=true;desktopToast.style.display='none';invoke('site_notice',{message:''}).catch(()=>{});};desktopToast.append(text,close);document.body.append(desktopToast);}
  desktopToast.querySelector('.notice-text').textContent=message;desktopToast.hidden=!message;desktopToast.style.display=message?'flex':'none';
 };
 let choices=new Map(),earlyChoices=new Map();
 window.__ssAudioChoice=(id,grant)=>{if(choices.has(id)){choices.get(id)(grant);choices.delete(id);}else earlyChoices.set(id,grant);};
 async function chooseAudio(){const id=await invoke('audio_choose');if(earlyChoices.has(id)){const value=earlyChoices.get(id);earlyChoices.delete(id);return value;}return new Promise(resolve=>choices.set(id,resolve));}
 const audioErrors=new Map();window.__ssAudioError=(id,error)=>audioErrors.get(id)?.(error);
 const scopes=new WeakMap();Object.defineProperty(window,'__simpleShareCapture',{value:Object.freeze({audioScope:stream=>scopes.get(stream)||'none'})});window.__simpleShareCaptureInstalled=true;
 const processor="class NativeAppAudio extends AudioWorkletProcessor {\n    constructor() { super(); this.queue = new Float32Array(48000); this.read = 0; this.write = 0; this.count = 0; this.port.onmessage = ({data}) => {\n      const bytes = new DataView(data.buffer, data.byteOffset, data.byteLength);\n      for(let i=0;i+3<bytes.byteLength;i+=4) { if(this.count >= this.queue.length - 2) { this.read=(this.read+2)%this.queue.length;this.count-=2; }\n        this.queue[this.write]=bytes.getInt16(i,true)/32768;this.write=(this.write+1)%this.queue.length;\n        this.queue[this.write]=bytes.getInt16(i+2,true)/32768;this.write=(this.write+1)%this.queue.length;this.count+=2;\n      }\n      if(this.count > 12000) { const discard=this.count-6000;this.read=(this.read+discard)%this.queue.length;this.count-=discard; }\n    }; }\n    process(inputs,outputs) { const out=outputs[0]; for(let i=0;i<out[0].length;i++) { for(let channel=0;channel<2;channel++) { out[channel][i]=this.count ? this.queue[this.read] : 0; if(this.count){this.read=(this.read+1)%this.queue.length;this.count--;} } } return true; }\n  } registerProcessor('native-app-audio',NativeAppAudio);";
 const captureChoices=new Map(),earlyCaptures=new Map(),sharedBuffers=new Map(),nativeEnds=new Map();
 window.__ssCaptureChoice=(id,value)=>{if(captureChoices.has(id)){captureChoices.get(id)(value);captureChoices.delete(id);}else earlyCaptures.set(id,value);};
 window.__ssVideoEnded=(id,message)=>nativeEnds.get(id)?.(message);
 window.__ssNativeStopAll=()=>{for(const end of [...nativeEnds.values()])end('Sharing stopped from the desktop controls.');};
 window.chrome.webview.addEventListener('sharedbufferreceived',event=>{if(event.additionalData?.type!=='simpleshare-native-video')return;const {id,slot}=event.additionalData;let buffers=sharedBuffers.get(id);if(!buffers){buffers=[];sharedBuffers.set(id,buffers);}buffers[slot]=event.getBuffer();});
 async function nativePicture(options){
  if(typeof MediaStreamTrackGenerator!=='function')throw Error('Update Microsoft Edge WebView2 to use native screen capture.');
  const request=await invoke('capture_choose',{audio:options?.audio!==false&&options?.audio!=null});
  const choice=earlyCaptures.has(request)?earlyCaptures.get(request):await new Promise(resolve=>captureChoices.set(request,resolve));earlyCaptures.delete(request);
  if(!choice)throw new DOMException('Screen selection cancelled','NotAllowedError');
  const number=(value,fallback)=>typeof value==='number'?value:Number(value?.ideal||value?.max)||fallback;
  const width=Math.max(320,Math.min(1920,number(options?.video?.width,1280))),height=Math.max(180,Math.min(1080,number(options?.video?.height,720))),fps=Math.max(1,Math.min(60,number(options?.video?.frameRate,60)));
  const video=new MediaStreamTrackGenerator({kind:'video'}),writer=video.writable.getWriter(),stream=new MediaStream([video]);video.contentHint='detail';
  const settings=video.getSettings.bind(video);video.getSettings=()=>({...settings(),width,height,frameRate:fps,displaySurface:choice.kind==='display'?'monitor':'window'});
  let ended=false;const pendingFrames=new Set();
  const stop=video.stop.bind(video);const finish=()=>{if(ended)return;ended=true;nativeEnds.delete(choice.video);stop();writer.abort().catch(()=>{});invoke('video_stop',{id:choice.video}).catch(()=>{}).finally(async()=>{await Promise.allSettled([...pendingFrames]);for(const buffer of sharedBuffers.get(choice.video)||[])if(buffer)window.chrome.webview.releaseBuffer(buffer);sharedBuffers.delete(choice.video);});};
  video.stop=finish;nativeEnds.set(choice.video,message=>{finish();video.dispatchEvent(new Event('ended'));invoke('site_notice',{message}).catch(()=>{});});
  const channel=new Channel();channel.onmessage=info=>{
   const work=(async()=>{let frame;try{if(ended)return;let buffer=sharedBuffers.get(choice.video)?.[info.slot];const deadline=performance.now()+3000;while(!buffer&&!ended&&performance.now()<deadline){await new Promise(resolve=>setTimeout(resolve,20));buffer=sharedBuffers.get(choice.video)?.[info.slot];}if(ended)return;if(!buffer)throw Error('Native frame memory was not delivered');frame=new VideoFrame(new Uint8Array(buffer),{format:'RGBA',codedWidth:info.width,codedHeight:info.height,timestamp:Math.round(performance.now()*1000)});await writer.write(frame);}catch(error){if(!ended){finish();video.dispatchEvent(new Event('ended'));invoke('site_notice',{message:'Native picture stopped: '+error.message}).catch(()=>{});}}finally{frame?.close();invoke('video_ack',{id:choice.video,slot:info.slot,sequence:info.sequence}).catch(()=>{});}})();pendingFrames.add(work);work.finally(()=>pendingFrames.delete(work));
  };
  try{await invoke('video_start',{id:choice.video,width,height,fps,onFrame:channel});if(ended){await invoke('video_stop',{id:choice.video});throw Error('Native capture ended while starting.');}}catch(error){finish();throw error;}
  return {stream,audio:choice.audio};
 }
 navigator.mediaDevices.getDisplayMedia=async options=>{
  const picture=await nativePicture(options),stream=picture.stream;
  const video=stream.getVideoTracks()[0];let context,track,channel,id,stopped=false;
  const lockCancel=new AbortController();let releaseLock;navigator.locks?.request('simpleshare-capture-'+video.id,{signal:lockCancel.signal},()=>video.readyState==='ended'?undefined:new Promise(resolve=>{releaseLock=resolve;})).catch(()=>{});
  const cleanup=()=>{if(stopped)return;stopped=true;if(id){audioErrors.delete(id);invoke('audio_stop',{id}).catch(()=>{});}track?.stop();context?.close().catch(()=>{});};
  const end=()=>{lockCancel.abort();releaseLock?.();cleanup();};const stop=video.stop.bind(video);video.stop=()=>{stop();end();};video.addEventListener('ended',end,{once:true});
  if(options?.audio===false||options?.audio==null)return stream;
  try{
   id=picture.audio;if(!id)return stream;if(video.readyState!=='live')throw Error('The selected picture ended.');
   context=new AudioContext({sampleRate:48000,latencyHint:'interactive'});if(context.sampleRate!==48000)throw Error('Application audio requires 48 kHz.');
   const url=URL.createObjectURL(new Blob([processor],{type:'text/javascript'}));try{await context.audioWorklet.addModule(url);}finally{URL.revokeObjectURL(url);}
   const node=new AudioWorkletNode(context,'native-app-audio',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]}),destination=context.createMediaStreamDestination();node.connect(destination);track=destination.stream.getAudioTracks()[0];
   channel=new Channel();channel.onmessage=packet=>{if(stopped)return;const data=new Uint8Array(packet),seq=new DataView(data.buffer,data.byteOffset).getUint32(0,true);node.port.postMessage(data.subarray(4));invoke('audio_ack',{id,sequence:seq}).catch(()=>{});};
   audioErrors.set(id,error=>{cleanup();invoke('site_notice',{message:error}).catch(()=>{});});
   await invoke('audio_start',{id,onAudio:channel});if(stopped){await invoke('audio_stop',{id});throw Error('Capture ended while application audio was starting.');}await context.resume();stream.addTrack(track);scopes.set(stream,'application');return stream;
  }catch(error){cleanup();invoke('site_notice',{message:'Application audio could not start: '+error+'. Your picture can continue.'}).catch(()=>{});if(video.readyState==='live')return stream;stream.getTracks().forEach(t=>t.stop());throw error;}
 };
 document.addEventListener('change',event=>{if(['myName','displayName'].includes(event.target?.id))savePreference('simpleshare-name',event.target.value);},true);
 let last='',scheduled;const seen=new WeakSet();
 function snapshot(){scheduled=null;const stop=document.getElementById('stopBtn'),sharing=Boolean(stop&&!stop.hidden&&!stop.classList.contains('hidden')&&getComputedStyle(stop).display!=='none');const streamers=[...document.querySelectorAll('#people .person')].filter(person=>person.querySelector('.badge')).map(person=>person.querySelector('.person-name')?.textContent||'');if(sharing&&!streamers.some(name=>name.includes('(you)')))streamers.unshift((document.getElementById('myName')?.value||'You')+' (you)');
 const value={url:location.href,title:document.getElementById('roomCode')?.textContent||'SimpleShare',status:document.getElementById('status')?.textContent||'',sharing,canShare:Boolean(document.getElementById('shareBtn')&&!document.getElementById('shareBtn').disabled),watching:[...document.querySelectorAll('.tile:not(.local):not(.idle) video')].some(v=>v.readyState>=2),streamers,theme:document.documentElement.dataset.theme};const next=JSON.stringify(value);if(next!==last){last=next;invoke('site_state',{value}).catch(()=>{});}
 const toast=document.getElementById('toast');if(toast?.classList.contains('show')&&!seen.has(toast.firstChild||toast)){if(/could not connect|publish failed|capture ended|TURN/i.test(toast.textContent))invoke('site_notice',{message:toast.textContent}).catch(()=>{});seen.add(toast.firstChild||toast);}}
 const observe=()=>{new MutationObserver(()=>{if(!scheduled)scheduled=setTimeout(snapshot,200);}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});snapshot();};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',observe,{once:true});else observe();
 const canvas=document.createElement('canvas');canvas.width=360;canvas.height=203;const paint=canvas.getContext('2d');setInterval(()=>{if(!window.__ssCompact)return;const video=document.querySelector('.tile.local video');if(!video||video.readyState<2||!video.videoWidth){invoke('site_preview',{value:null}).catch(()=>{});return;}try{paint.fillStyle='#101510';paint.fillRect(0,0,360,203);const ratio=Math.min(360/video.videoWidth,203/video.videoHeight),width=video.videoWidth*ratio,height=video.videoHeight*ratio;paint.drawImage(video,(360-width)/2,(203-height)/2,width,height);invoke('site_preview',{value:canvas.toDataURL('image/jpeg',.65)}).catch(()=>{});}catch{}},350);
})();
