#!/usr/bin/env node
/**
 * Generates the PWA manifest icons as real PNGs, with no image-processing
 * dependency (none is installed for this phase, and adding one is out of
 * scope — see the Phase 4 report). Hand-rolls a minimal PNG encoder (8-bit
 * RGBA, one zlib-deflated IDAT) good enough for flat/simple raster shapes:
 * a rounded amber square with a centred "A" glyph, matching the Auralis
 * fallback source colour (`packages/ui/src/tokens/color.ts`).
 *
 * Run with `node scripts/generate-icons.mjs` (also wired as a `prebuild`-style
 * step — see package.json) whenever the icon design changes; the output PNGs
 * are checked in so a fresh clone doesn't need to run it to build.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const AMBER = [0xb8, 0x68, 0x3c]; // AURALIS_SOURCE_COLOR, #B8683C
const CREAM = [0xfb, 0xf1, 0xe8];

function crc32(buf) {
  let c;
  const table = crc32.table ??= (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** `paint(x, y)` returns `[r, g, b, a]` for pixel `(x, y)` in a `size`x`size` canvas. */
function encodePng(size, paint) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // no filter
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = paint(x, y);
      const px = rowStart + 1 + x * 4;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
      raw[px + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Simple 5x7 block-letter "A" glyph, drawn as filled cells scaled to the icon. */
const GLYPH_A = [
  '..XXX..',
  '.X...X.',
  'X.....X',
  'X.....X',
  'XXXXXXX',
  'X.....X',
  'X.....X',
];

function paintIcon({ size, maskable }) {
  // Maskable icons need a "safe zone": content inside the centre ~80% so OS
  // masking (circle, squircle, etc.) never clips it.
  const pad = maskable ? size * 0.1 : size * 0.06;
  const glyphRows = GLYPH_A.length;
  const glyphCols = GLYPH_A[0].length;
  const contentSize = size - pad * 2;
  const cell = contentSize / Math.max(glyphRows, glyphCols);
  const glyphW = cell * glyphCols;
  const glyphH = cell * glyphRows;
  const glyphX0 = (size - glyphW) / 2;
  const glyphY0 = (size - glyphH) / 2;
  const cornerRadius = maskable ? 0 : size * 0.18;

  return (x, y) => {
    if (!maskable) {
      // Rounded-square background — outside the rounded rect is transparent.
      const cx = x < cornerRadius ? cornerRadius : x > size - cornerRadius ? size - cornerRadius : x;
      const cy = y < cornerRadius ? cornerRadius : y > size - cornerRadius ? size - cornerRadius : y;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > cornerRadius * cornerRadius) return [0, 0, 0, 0];
    }

    const gx = Math.floor((x - glyphX0) / cell);
    const gy = Math.floor((y - glyphY0) / cell);
    const onGlyph =
      gx >= 0 && gx < glyphCols && gy >= 0 && gy < glyphRows && GLYPH_A[gy][gx] === 'X';

    return onGlyph ? [...CREAM, 255] : [...AMBER, 255];
  };
}

const targets = [
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-512.png', size: 512, maskable: false },
  { name: 'icon-maskable-192.png', size: 192, maskable: true },
  { name: 'icon-maskable-512.png', size: 512, maskable: true },
];

for (const target of targets) {
  const png = encodePng(target.size, paintIcon(target));
  writeFileSync(join(outDir, target.name), png);
  console.log(`wrote ${target.name} (${png.length} bytes)`);
}
