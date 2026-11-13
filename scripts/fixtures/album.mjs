#!/usr/bin/env node
/**
 * Makes the fixture album the album import's tests run on: The Slip by Nine Inch Nails (CC BY-NC-SA),
 * laid out as a torrent of it would be, every track digital silence of the recorded CD release's
 * length. No audio from any torrent is ever committed. Written by hand, byte by byte, with no
 * encoder: the laptop has no ffmpeg, and silence needs none.
 *
 *   node scripts/fixtures/album.mjs <out folder>
 *
 * - Ten FLACs, 44.1 kHz 16-bit stereo, 4,096-sample frames of constant subframes (about 16 bytes
 *   a frame), STREAMINFO with the exact sample count and the MD5 of the silence. Vorbis comments as a
 *   rip carries them, an old MusicBrainz id on track 1, and track 1 holds a front-cover PICTURE.
 *   Every track has 4 KiB of padding but track 3, which has none.
 * - Track 1 again as MP3: MPEG-1 Layer III, 32 kbps CBR stereo (silent frames with empty side
 *   info), an `Info` frame with the frame and byte counts, an ID3v2.3 tag with 2 KiB padding before
 *   it and an ID3v1 tag after it.
 * - `cover.jpg`, the Cover Art Archive's stand-in (scripts/fixtures/still.sh), and a rip log.
 *
 * The same run writes the same bytes.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = process.argv[2];
if (!out) {
  console.error('usage: album.mjs <out folder>');
  process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));
const COVER = join(here, '../../server/src/adapters/coverart/recordings/front.jpg');

/** The Slip's CD release as MusicBrainz lists it (recordings/release-slip-cd.json), in ms. */
const TRACKS = [
  ['999,999', 85586],
  ['1,000,000', 236133],
  ['Letting You', 229560],
  ['Discipline', 259200],
  ['Echoplex', 285106],
  ['Head Down', 295560],
  ['Lights in the Sky', 209680],
  ['Corona Radiata', 453520],
  ['The Four of Us Are Dying', 277813],
  ['Demon Seed', 299400],
];
const RATE = 44_100;
const BLOCK = 4096;
const OLD_RECORDING_ID = '00000000-0000-4000-8000-000000000000';

const pad2 = (n) => String(n).padStart(2, '0');

function crc8(bytes) {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
  }
  return crc;
}

function crc16(bytes) {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++)
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x8005) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

/** FLAC's UTF-8-like coding of a frame number. */
function utf8Number(n) {
  if (n < 0x80) return [n];
  if (n < 0x800) return [0xc0 | (n >> 6), 0x80 | (n & 0x3f)];
  if (n < 0x10000) return [0xe0 | (n >> 12), 0x80 | ((n >> 6) & 0x3f), 0x80 | (n & 0x3f)];
  throw new Error('frame number too large');
}

function u32le(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
}

function u32be(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}

function blockHeader(type, length, last) {
  return Buffer.from([(last ? 0x80 : 0) | type, length >> 16, (length >> 8) & 0xff, length & 0xff]);
}

function silentFlacFrames(samples) {
  const frames = [];
  let minSize = Infinity;
  let maxSize = 0;
  for (let number = 0, at = 0; at < samples; number++, at += BLOCK) {
    const size = Math.min(BLOCK, samples - at);
    const header = [0xff, 0xf8, size === BLOCK ? 0xc9 : 0x79, 0x18, ...utf8Number(number)];
    if (size !== BLOCK) header.push((size - 1) >> 8, (size - 1) & 0xff);
    header.push(crc8(header));
    // Two constant subframes of the value 0, 16 bits each.
    const body = [...header, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    const crc = crc16(body);
    const frame = Buffer.from([...body, crc >> 8, crc & 0xff]);
    minSize = Math.min(minSize, frame.length);
    maxSize = Math.max(maxSize, frame.length);
    frames.push(frame);
  }
  return { frames: Buffer.concat(frames), minSize, maxSize };
}

function streamInfo(samples, minSize, maxSize) {
  const info = Buffer.alloc(34);
  info.writeUInt16BE(BLOCK, 0);
  info.writeUInt16BE(BLOCK, 2);
  info.writeUIntBE(minSize, 4, 3);
  info.writeUIntBE(maxSize, 7, 3);
  // 20 bits rate, 3 bits channels - 1, 5 bits bits-per-sample - 1, 36 bits total samples.
  const packed = (BigInt(RATE) << 44n) | (1n << 41n) | (15n << 36n) | BigInt(samples);
  info.writeBigUInt64BE(packed, 10);
  createHash('md5')
    .update(Buffer.alloc(samples * 4))
    .digest()
    .copy(info, 18);
  return info;
}

function vorbisComments(comments) {
  const vendor = Buffer.from('Auralis fixture', 'utf8');
  const parts = [u32le(vendor.length), vendor, u32le(comments.length)];
  for (const [key, value] of comments) {
    const text = Buffer.from(`${key}=${value}`, 'utf8');
    parts.push(u32le(text.length), text);
  }
  return Buffer.concat(parts);
}

function picture(jpeg) {
  const mime = Buffer.from('image/jpeg', 'latin1');
  return Buffer.concat([
    u32be(3),
    u32be(mime.length),
    mime,
    u32be(0),
    u32be(64),
    u32be(64),
    u32be(24),
    u32be(0),
    u32be(jpeg.length),
    jpeg,
  ]);
}

function flac(number, title, ms, cover) {
  const samples = Math.round((ms * RATE) / 1000);
  const { frames, minSize, maxSize } = silentFlacFrames(samples);
  const comments = [
    ['TITLE', title],
    ['ARTIST', 'Nine Inch Nails'],
    ['ALBUM', 'The Slip'],
    ['TRACKNUMBER', String(number)],
    ['DATE', '2008'],
    ['GENRE', 'Industrial'],
    ['REPLAYGAIN_TRACK_GAIN', '-6.00 dB'],
  ];
  if (number === 1) comments.push(['MUSICBRAINZ_TRACKID', OLD_RECORDING_ID]);
  const blocks = [
    [0, streamInfo(samples, minSize, maxSize)],
    [4, vorbisComments(comments)],
  ];
  if (number === 1) blocks.push([6, picture(cover)]);
  if (number !== 3) blocks.push([1, Buffer.alloc(4096)]);
  const parts = [Buffer.from('fLaC', 'latin1')];
  blocks.forEach(([type, body], i) =>
    parts.push(blockHeader(type, body.length, i === blocks.length - 1), body),
  );
  parts.push(frames);
  return Buffer.concat(parts);
}

function syncsafe(n) {
  return Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]);
}

/** An ID3v2.3 text frame, ISO-8859-1. */
function id3v23Text(id, text) {
  const body = Buffer.concat([Buffer.from([0]), Buffer.from(text, 'latin1')]);
  return Buffer.concat([Buffer.from(id, 'latin1'), u32be(body.length), Buffer.alloc(2), body]);
}

function id3v23Txxx(description, text) {
  const body = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(description, 'latin1'),
    Buffer.from([0]),
    Buffer.from(text, 'latin1'),
  ]);
  return Buffer.concat([Buffer.from('TXXX', 'latin1'), u32be(body.length), Buffer.alloc(2), body]);
}

function id3v1(title) {
  const tag = Buffer.alloc(128);
  tag.write('TAG', 0, 'latin1');
  tag.write(title, 3, 30, 'latin1');
  tag.write('Nine Inch Nails', 33, 30, 'latin1');
  tag.write('The Slip', 63, 30, 'latin1');
  tag.write('2008', 93, 4, 'latin1');
  tag[125] = 0;
  tag[126] = 1;
  tag[127] = 255;
  return tag;
}

/** MPEG-1 Layer III, 32 kbps, 44.1 kHz, stereo: 1,152 samples a frame. */
function silentMp3(title, ms) {
  const samples = Math.round((ms * RATE) / 1000);
  const count = Math.ceil(samples / 1152);
  const frames = [];
  let carry = 0;
  const frame = () => {
    // 144 * 32000 / 44100 bytes a frame, the remainder carried as padding bytes.
    carry += (144 * 32_000) % RATE;
    const padded = carry >= RATE;
    if (padded) carry -= RATE;
    const bytes = Buffer.alloc(Math.floor((144 * 32_000) / RATE) + (padded ? 1 : 0));
    bytes[0] = 0xff;
    bytes[1] = 0xfb;
    bytes[2] = 0x10 | (padded ? 0x02 : 0);
    bytes[3] = 0x00;
    return bytes;
  };
  const info = frame();
  for (let i = 0; i < count; i++) frames.push(frame());
  const audioBytes = info.length + frames.reduce((sum, f) => sum + f.length, 0);
  info.write('Info', 36, 'latin1');
  info.writeUInt32BE(0x03, 40);
  info.writeUInt32BE(count, 44);
  info.writeUInt32BE(audioBytes, 48);

  const tagFrames = Buffer.concat([
    id3v23Text('TIT2', title),
    id3v23Text('TPE1', 'Nine Inch Nails'),
    id3v23Text('TALB', 'The Slip'),
    id3v23Text('TRCK', '1'),
    id3v23Text('TYER', '2008'),
    id3v23Text('TCON', 'Industrial'),
    id3v23Txxx('MusicBrainz Album Id', '00000000-0000-4000-8000-000000000000'),
  ]);
  const tagBody = Buffer.concat([tagFrames, Buffer.alloc(2048)]);
  const header = Buffer.concat([
    Buffer.from('ID3', 'latin1'),
    Buffer.from([3, 0, 0]),
    syncsafe(tagBody.length),
  ]);
  return Buffer.concat([header, tagBody, info, ...frames, id3v1(title)]);
}

mkdirSync(out, { recursive: true });
const cover = readFileSync(COVER);
TRACKS.forEach(([title, ms], i) => {
  writeFileSync(join(out, `${pad2(i + 1)} - ${title}.flac`), flac(i + 1, title, ms, cover));
});
writeFileSync(join(out, `01 - ${TRACKS[0][0]}.mp3`), silentMp3(TRACKS[0][0], TRACKS[0][1]));
copyFileSync(COVER, join(out, 'cover.jpg'));
writeFileSync(
  join(out, 'The Slip.log'),
  'Fixture rip log: The Slip, 10 tracks, digital silence of the CD release lengths.\n',
);
