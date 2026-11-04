import { chromium, expect } from '@playwright/test';
export async function checkDesktopBrowserInterop(remote, url) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url);
    const offer = await remote(
      `(async()=>{const pc=window.interopSender=new RTCPeerConnection({iceServers:[]});for(const track of window.currentCapture.getTracks())pc.addTrack(track,window.currentCapture);await pc.setLocalDescription(await pc.createOffer());if(pc.iceGatheringState!=='complete')await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Sender ICE gathering timed out')),10000);pc.addEventListener('icegatheringstatechange',()=>{if(pc.iceGatheringState==='complete'){clearTimeout(timeout);resolve();}});});return pc.localDescription.toJSON();})()`,
    );
    const answer = await page.evaluate(async (offer) => {
      const pc = (window.interopReceiver = new RTCPeerConnection({ iceServers: [] }));
      const media = (window.interopMedia = new MediaStream());
      const video = document.createElement('video');
      video.id = 'browserReceived';
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      document.body.append(video);
      video.srcObject = media;
      pc.ontrack = (event) => {
        media.addTrack(event.track);
        video.play().catch(() => {});
      };
      await pc.setRemoteDescription(offer);
      await pc.setLocalDescription(await pc.createAnswer());
      if (pc.iceGatheringState !== 'complete')
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(Error('Viewer ICE gathering timed out')), 10000);
          pc.addEventListener('icegatheringstatechange', () => {
            if (pc.iceGatheringState === 'complete') {
              clearTimeout(timeout);
              resolve();
            }
          });
        });
      return pc.localDescription.toJSON();
    }, offer);
    await remote('window.interopSender.setRemoteDescription(' + JSON.stringify(answer) + ')');
    await expect
      .poll(() => page.evaluate(() => window.interopReceiver.connectionState), { timeout: 20000 })
      .toBe('connected');
    await expect
      .poll(
        () =>
          page
            .locator('#browserReceived')
            .evaluate((v) => v.getVideoPlaybackQuality().totalVideoFrames),
        { timeout: 10000 },
      )
      .toBeGreaterThan(5);
    const result = await page.evaluate(async () => {
      const video = document.getElementById('browserReceived'),
        context = new AudioContext(),
        source = context.createMediaStreamSource(window.interopMedia),
        meter = context.createAnalyser();
      source.connect(meter);
      await context.resume();
      const samples = new Float32Array(meter.fftSize);
      let rms = 0;
      const before = video.getVideoPlaybackQuality().totalVideoFrames;
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 50));
        meter.getFloatTimeDomainData(samples);
        rms = Math.max(rms, Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length));
      }
      const frames = video.getVideoPlaybackQuality().totalVideoFrames - before;
      await context.close();
      return { frames, rms, state: window.interopReceiver.connectionState };
    });
    if (result.frames < 10 || result.rms < 0.001 || result.state !== 'connected')
      throw Error('Desktop to browser media was not continuous: ' + JSON.stringify(result));
    await remote('window.interopSender.close()');
    await page.evaluate(() => window.interopReceiver.close());
    return result;
  } finally {
    await browser.close();
  }
}
