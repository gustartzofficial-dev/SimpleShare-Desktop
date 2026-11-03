(() => {
  'use strict';
  const bridge = window.__simpleShareNative;
  if (!bridge || !navigator.mediaDevices?.getDisplayMedia || window.__simpleShareCaptureInstalled)
    return;
  window.__simpleShareCaptureInstalled = true;
  const original = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
  const processor = `class NativeAppAudio extends AudioWorkletProcessor {
    constructor() { super(); this.queue = new Float32Array(48000); this.read = 0; this.write = 0; this.count = 0; this.port.onmessage = ({data}) => {
      const bytes = new DataView(data.buffer, data.byteOffset, data.byteLength);
      for(let i=0;i+3<bytes.byteLength;i+=4) { if(this.count >= this.queue.length - 2) { this.read=(this.read+2)%this.queue.length;this.count-=2; }
        this.queue[this.write]=bytes.getInt16(i,true)/32768;this.write=(this.write+1)%this.queue.length;
        this.queue[this.write]=bytes.getInt16(i+2,true)/32768;this.write=(this.write+1)%this.queue.length;this.count+=2;
      }
      if(this.count > 12000) { const discard=this.count-6000;this.read=(this.read+discard)%this.queue.length;this.count-=discard; }
    }; }
    process(inputs,outputs) { const out=outputs[0]; for(let i=0;i<out[0].length;i++) { for(let channel=0;channel<2;channel++) { out[channel][i]=this.count ? this.queue[this.read] : 0; if(this.count){this.read=(this.read+1)%this.queue.length;this.count--;} } } return true; }
  } registerProcessor('native-app-audio',NativeAppAudio);`;
  navigator.mediaDevices.getDisplayMedia = async (options) => {
    const stream = await original(options);
    const grant = await bridge.takeGrant();
    if (!grant?.id || !grant.audio || options?.audio === false) return stream;
    let context,
      track,
      unsubscribe,
      stopped = false;
    const cleanup = () => {
      if (stopped) return;
      stopped = true;
      unsubscribe?.();
      bridge.stopAudio(grant.id);
      track?.stop();
      context?.close().catch(() => {});
    };
    try {
      context = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
      if (context.sampleRate !== 48000)
        throw new Error('The audio engine could not start at 48 kHz.');
      const url = URL.createObjectURL(new Blob([processor], { type: 'text/javascript' }));
      try {
        await context.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      if (stream.getVideoTracks()[0]?.readyState !== 'live')
        throw new Error('Screen selection ended.');
      const node = new AudioWorkletNode(context, 'native-app-audio', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      const output = context.createMediaStreamDestination();
      node.connect(output);
      track = output.stream.getAudioTracks()[0];
      unsubscribe = bridge.onAudio((packet) => {
        if (packet.id !== grant.id || stopped) return;
        if (packet.error) {
          cleanup();
          return;
        }
        if (packet.bytes) node.port.postMessage(packet.bytes);
      });
      const result = await bridge.startAudio(grant.id);
      if (!result.ok) throw new Error(result.error || 'Application audio could not start.');
      await context.resume();
      stream.addTrack(track);
      stream.getVideoTracks()[0].addEventListener('ended', cleanup, { once: true });
      track.addEventListener('ended', cleanup, { once: true });
      // The website owns capture teardown and may stop individual tracks directly.
      const originalVideoStop = stream.getVideoTracks()[0].stop.bind(stream.getVideoTracks()[0]);
      stream.getVideoTracks()[0].stop = () => {
        originalVideoStop();
        cleanup();
      };
      return stream;
    } catch (error) {
      cleanup();
      stream.getTracks().forEach((item) => item.stop());
      throw new DOMException(error.message, 'NotReadableError');
    }
  };
})();
