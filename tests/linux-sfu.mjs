import {randomBytes} from 'node:crypto';

// Creates an isolated room and synthetic publisher; never joins a user's room.
export function liveSfuBridge(browser) {
  const base='https://simpleshare.gustartzofficial.workers.dev';
  const room=randomBytes(12).toString('hex');
  let auth,headers,socket,publisher,subscriber,page,starting;
  async function call(route,body) {
    const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
    const result=await response.json();
    if(!response.ok||result.errorCode||result.error)throw Error(`SFU test ${route.split('?')[0]} failed (${response.status}): ${result.errorDescription||result.errorCode||result.error}`);
    return result;
  }
  async function start() {
    auth=await call(`/api/rooms/${room}/join`,{name:'Isolated Linux validation',mode:'cloud'});
    headers={'x-room':room,'x-participant-id':auth.participantId,'x-participant-token':auth.token};
    socket=new WebSocket(base.replace('https:','wss:')+`/api/rooms/${room}/socket?id=${encodeURIComponent(auth.participantId)}&token=${encodeURIComponent(auth.token)}`);
    socket.addEventListener('error',()=>{});
    const ice=await call('/partytracks/generate-ice-servers');
    
    page=await browser.newPage();await page.goto('http://127.0.0.1:1439/browser');
    const local=await page.evaluate(async iceServers=>{
      const pc=window.sfuPublisher=new RTCPeerConnection({iceServers,bundlePolicy:'max-bundle'});
      const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;document.body.append(canvas);
      const context=canvas.getContext('2d');let n=0;window.sfuTimer=setInterval(()=>{context.fillStyle=n++%2?'#f29a78':'#c4d297';context.fillRect(0,0,320,180);},200);
      window.sfuSource=canvas.captureStream(5);pc.addTransceiver(sfuSource.getVideoTracks()[0],{direction:'sendonly'});
      await pc.setLocalDescription(await pc.createOffer());
      const end=Date.now()+25000;while(pc.iceGatheringState!=='complete'&&Date.now()<end)await new Promise(r=>setTimeout(r,50));
      return {description:pc.localDescription.toJSON(),mid:pc.getTransceivers()[0].mid};
    },ice.iceServers);
    publisher=(await call('/partytracks/sessions/new',{})).sessionId;
    const publication=await call(`/partytracks/sessions/${publisher}/tracks/new`,{sessionDescription:local.description,tracks:[{location:'local',mid:local.mid,trackName:'linux-validation'}]});
    await page.evaluate(description=>sfuPublisher.setRemoteDescription(description),publication.sessionDescription);
    await page.evaluate(async()=>{const end=Date.now()+20000;while(Date.now()<end){const stats=await sfuPublisher.getStats();if(sfuPublisher.connectionState==='connected'&&[...stats.values()].some(s=>s.type==='outbound-rtp'&&s.bytesSent>0))return;await new Promise(r=>setTimeout(r,100));}throw Error('Synthetic browser publisher could not connect to the live SFU: '+sfuPublisher.connectionState);});
    await call(`/api/rooms/${room}/stream/upsert`,{...auth,stream:{id:auth.participantId+'-share',kind:'screen',sessionId:publisher,videoTrackName:'linux-validation',audioTrackName:null,profile:'720p60',audio:false}});
    subscriber=(await call('/partytracks/sessions/new',{})).sessionId;
    const subscription=await call(`/partytracks/sessions/${subscriber}/tracks/new`,{tracks:[{location:'remote',sessionId:publisher,trackName:'linux-validation'}]});
    return {iceServers:ice.iceServers,description:subscription.sessionDescription};
  }
  return {
    async offer(){return starting??=(start());},
    async answer(description){
      const response=await fetch(`${base}/partytracks/sessions/${subscriber}/renegotiate`,{method:'PUT',headers:{'content-type':'application/json',...headers},body:JSON.stringify({sessionDescription:description}),signal:AbortSignal.timeout(30000)});
      const data=await response.json();if(!response.ok||data.errorCode)throw Error(`SFU answer rejected (${response.status}): ${data.errorDescription||data.errorCode}`);return {ok:true};
    },
    async close(){
      try{await page?.evaluate(()=>{clearInterval(window.sfuTimer);window.sfuSource?.getTracks().forEach(t=>t.stop());window.sfuPublisher?.close();});}catch{}
      socket?.close();
      if(auth)try{await call(`/api/rooms/${room}/leave`,{participantId:auth.participantId,token:auth.token});}catch{}
    },
  };
}
