#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

function drawGlyph(size) {
  const buf = Buffer.alloc(size * size * 4);
  const padding = Math.round(size * (2 / 22));
  const inner = size - padding * 2;
  const radius = Math.round(inner * 0.32);
  const rippleR = Math.round(inner * 0.18);
  const cx = padding + inner / 2;
  const cy = padding + inner / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const localX = x - padding;
      const localY = y - padding;
      let inside = false;
      if (localX >= 0 && localY >= 0 && localX < inner && localY < inner) {
        const ix =
          localX < radius
            ? radius - localX
            : Math.max(0, localX - (inner - 1 - radius));
        const iy =
          localY < radius
            ? radius - localY
            : Math.max(0, localY - (inner - 1 - radius));
        if (ix === 0 || iy === 0) {
          inside = true;
        } else {
          inside = ix * ix + iy * iy <= radius * radius;
        }
      }
      if (inside) {
        const dx = x - cx + 0.5;
        const dy = y - cy + 0.5;
        if (dx * dx + dy * dy <= rippleR * rippleR) {
          inside = false;
        }
      }
      if (inside) {
        buf[i] = 0;
        buf[i + 1] = 0;
        buf[i + 2] = 0;
        buf[i + 3] = 255;
      } else {
        buf[i] = 0;
        buf[i + 1] = 0;
        buf[i + 2] = 0;
        buf[i + 3] = 0;
      }
    }
  }
  return buf;
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idatData = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idatData),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = crc32(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function write(size) {
  const rgba = drawGlyph(size);
  const png = encodePng(size, size, rgba);
  const out = join(outDir, `${size}.png`);
  writeFileSync(out, png);
  console.log(`wrote ${out} (${size}×${size}, ${png.length} bytes)`);
}

for (const size of [16, 32, 48, 128]) write(size);
