// WebKitGTK compatibility for the Linux-only Rust RTC adapter.
(() => {
  // WebKit #320327: older WebCodecs entry points do not initialize GStreamer.
  document.createElement('video').canPlayType('video/webm');
  const prototype = HTMLVideoElement.prototype;
  const request = prototype.requestVideoFrameCallback;
  const cancel = prototype.cancelVideoFrameCallback;
  if (typeof request !== 'function') return;
  let sequence = 0;
  const timers = new Map();
  // The adapter's offscreen encoder video is never composited. WebKit can omit
  // presentation callbacks for it, so use the adapter's existing timer fallback
  // semantics while preserving native callbacks for every visible room video.
  prototype.requestVideoFrameCallback = function(callback) {
    if (!this.closest('#__tauri_webrtc_media')) return request.call(this, callback);
    const id = --sequence;
    timers.set(id, setTimeout(() => {
      timers.delete(id);
      const now = performance.now();
      callback(now, {presentationTime: now, expectedDisplayTime: now,
        mediaTime: this.currentTime, width: this.videoWidth, height: this.videoHeight,
        presentedFrames: -id, processingDuration: 0});
    }, 1000 / 30));
    return id;
  };
  prototype.cancelVideoFrameCallback = function(id) {
    if (timers.has(id)) {clearTimeout(timers.get(id));timers.delete(id);return;}
    return cancel?.call(this, id);
  };
})();
