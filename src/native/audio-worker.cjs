'use strict';
// Each user-approved source has its own process; a native failure cannot take down the room.
const addon = require('loopback-capture');
const { LoopbackCapture } = addon.default || addon;
const { createCreditGate } = require('../lib/audio-flow.cjs');
const flow = createCreditGate();
let capture;
process.parentPort.on('message', ({ data }) => {
  if (data.type === 'start') {
    try {
      if (!Number.isInteger(data.pid) || data.pid <= 0) throw new Error('Invalid application.');
      capture = new LoopbackCapture();
      capture.start(data.pid, (chunk) => {
        if (chunk.byteLength > 65536 || !chunk.byteLength || !flow.take()) return;
        process.parentPort.postMessage({ type: 'pcm', bytes: Uint8Array.from(chunk) });
      });
      process.parentPort.postMessage({ type: 'started' });
    } catch (error) {
      process.parentPort.postMessage({ type: 'error', message: error.message });
    }
  }
  if (data.type === 'stop') {
    try {
      capture?.stop();
    } finally {
      process.exit(0);
    }
  }
  if (data.type === 'credit') flow.release();
});
process.parentPort.postMessage({ type: 'ready' });
