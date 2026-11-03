'use strict';
const { deflateSync } = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');
const table = Array.from({ length: 256 }, (_, i) => {
  let crc = i;
  for (let j = 0; j < 8; j++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type),
    length = Buffer.alloc(4),
    crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
const size = 256,
  raw = Buffer.alloc((size * 4 + 1) * size);
for (let y = 0; y < size; y++)
  for (let x = 0; x < size; x++) {
    let color = [28, 32, 28, 255];
    for (const [left, top, right, bottom] of [
      [43, 43, 153, 153],
      [103, 103, 213, 213],
    ]) {
      if (x >= left && x <= right && y >= top && y <= bottom) color = [28, 32, 28, 255];
      if (
        x >= left &&
        x <= right &&
        y >= top &&
        y <= bottom &&
        (x < left + 8 || x > right - 8 || y < top + 8 || y > bottom - 8)
      )
        color = [240, 151, 119, 255];
    }
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    raw.set(color, offset);
  }
const header = Buffer.alloc(13);
header.writeUInt32BE(size, 0);
header.writeUInt32BE(size, 4);
header[8] = 8;
header[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);
const iconHeader = Buffer.alloc(22);
iconHeader.writeUInt16LE(1, 2);
iconHeader.writeUInt16LE(1, 4);
iconHeader.writeUInt16LE(1, 10);
iconHeader.writeUInt16LE(32, 12);
iconHeader.writeUInt32LE(png.length, 14);
iconHeader.writeUInt32LE(22, 18);
fs.writeFileSync(path.join(__dirname, '../assets/icon.png'), png);
fs.writeFileSync(path.join(__dirname, '../assets/icon.ico'), Buffer.concat([iconHeader, png]));
