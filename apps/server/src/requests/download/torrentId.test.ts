import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { infoHashFromMagnet, infoHashFromTorrentFile } from './torrentId.js';

// --- tiny hand-rolled bencode builders, used only to assemble test fixtures -------------

function bStr(s: string): Buffer {
  const body = Buffer.from(s, 'utf8');
  return Buffer.concat([Buffer.from(`${body.length}:`, 'ascii'), body]);
}

function bInt(n: number): Buffer {
  return Buffer.from(`i${n}e`, 'ascii');
}

function bList(items: Buffer[]): Buffer {
  return Buffer.concat([Buffer.from('l', 'ascii'), ...items, Buffer.from('e', 'ascii')]);
}

/** `entries` are pre-encoded `[key, value]` pairs; concatenated in the order given. */
function bDict(entries: [string, Buffer][]): Buffer {
  const parts = entries.flatMap(([key, value]) => [bStr(key), value]);
  return Buffer.concat([Buffer.from('d', 'ascii'), ...parts, Buffer.from('e', 'ascii')]);
}

function sha1Hex(bytes: Buffer): string {
  return createHash('sha1').update(bytes).digest('hex');
}

describe('infoHashFromTorrentFile', () => {
  it('hashes the raw bytes of the info dict, not a re-encoding of it', () => {
    const info = bDict([
      ['length', bInt(123)],
      ['name', bStr('book')],
    ]);
    const torrent = bDict([
      ['announce', bStr('http://tracker.test/')],
      ['info', info],
    ]);

    const hash = infoHashFromTorrentFile(new Uint8Array(torrent));

    expect(hash).toBe(sha1Hex(info));
  });

  it('finds info correctly when it is not the first top-level key', () => {
    const info = bDict([['name', bStr('book')]]);
    const torrent = bDict([
      ['announce', bStr('http://tracker.test/')],
      ['comment', bStr('ripped with love')],
      ['info', info],
      ['creation date', bInt(1690000000)],
    ]);

    const hash = infoHashFromTorrentFile(new Uint8Array(torrent));

    expect(hash).toBe(sha1Hex(info));
  });

  it('skips nested lists and dicts inside info correctly', () => {
    const fileEntry1 = bDict([
      ['length', bInt(10)],
      ['path', bList([bStr('cd1'), bStr('01.mp3')])],
    ]);
    const fileEntry2 = bDict([
      ['length', bInt(20)],
      ['path', bList([bStr('cd1'), bStr('02.mp3')])],
    ]);
    const info = bDict([
      ['files', bList([fileEntry1, fileEntry2])],
      ['name', bStr('book')],
      ['piece length', bInt(262144)],
      ['pieces', bStr('not real sha1 data, just bytes')],
    ]);
    const torrent = bDict([
      ['announce', bStr('http://tracker.test/')],
      ['info', info],
    ]);

    const hash = infoHashFromTorrentFile(new Uint8Array(torrent));

    expect(hash).toBe(sha1Hex(info));
  });

  it('returns null for a dict with no top-level info key', () => {
    const torrent = bDict([['announce', bStr('http://tracker.test/')]]);

    expect(infoHashFromTorrentFile(new Uint8Array(torrent))).toBeNull();
  });

  it('returns null rather than throwing for input that is not bencode at all', () => {
    expect(infoHashFromTorrentFile(new Uint8Array(Buffer.from('not bencode', 'utf8')))).toBeNull();
    expect(infoHashFromTorrentFile(new Uint8Array())).toBeNull();
  });

  it('returns null rather than throwing for truncated input', () => {
    const info = bDict([['name', bStr('book')]]);
    const torrent = bDict([
      ['announce', bStr('http://tracker.test/')],
      ['info', info],
    ]);
    // Cut it off partway through the info dict's "book" string.
    const truncated = torrent.subarray(0, torrent.length - 6);

    expect(infoHashFromTorrentFile(new Uint8Array(truncated))).toBeNull();
  });

  it('returns null for a top-level bencode value that is not a dict', () => {
    const list = bList([bStr('a'), bStr('b')]);

    expect(infoHashFromTorrentFile(new Uint8Array(list))).toBeNull();
  });

  it('degrades to null on a pathologically nested file instead of overflowing the stack', () => {
    // Bencode costs one byte per nesting level, so a file small enough to fetch without
    // suspicion can be thousands of lists deep. These bytes come from a third-party
    // indexer's download URL, and a raw RangeError here would escape `add()` untyped.
    const depth = 5000;
    const nested = Buffer.concat([
      Buffer.from('l'.repeat(depth), 'ascii'),
      Buffer.from('e'.repeat(depth), 'ascii'),
    ]);
    const torrent = Buffer.concat([
      Buffer.from('d', 'ascii'),
      bStr('info'),
      nested,
      Buffer.from('e', 'ascii'),
    ]);

    expect(() => infoHashFromTorrentFile(new Uint8Array(torrent))).not.toThrow();
    expect(infoHashFromTorrentFile(new Uint8Array(torrent))).toBeNull();
  });

  it('still hashes a torrent nested as deeply as a real one ever goes', () => {
    // `info.files[].path[]` is the deepest legitimate structure — a handful of levels.
    const info = bDict([
      ['files', bList([bDict([['path', bList([bStr('a'), bStr('b.mp3')])]])])],
      ['name', bStr('Book')],
    ]);
    const torrent = Buffer.concat([
      Buffer.from('d', 'ascii'),
      bStr('info'),
      info,
      Buffer.from('e', 'ascii'),
    ]);

    expect(infoHashFromTorrentFile(new Uint8Array(torrent))).toBe(sha1Hex(info));
  });
});

describe('infoHashFromMagnet', () => {
  it('extracts and lowercases a 40-character hex btih', () => {
    const hash = 'AABBCCDDEEFF00112233445566778899AABBCCDD';
    const magnet = `magnet:?xt=urn:btih:${hash}&dn=Some+Book`;

    expect(infoHashFromMagnet(magnet)).toBe(hash.toLowerCase());
  });

  it('decodes a 32-character base32 btih to the correct hex hash', () => {
    // 20 raw bytes, base32-encoded by hand against the RFC 4648 alphabet.
    const rawBytes = Buffer.from('0123456789abcdef0123456789abcdef01234567', 'hex').subarray(0, 20);
    const base32 = encodeBase32ForTest(rawBytes);
    const magnet = `magnet:?xt=urn:btih:${base32}&dn=Some+Book`;

    expect(infoHashFromMagnet(magnet)).toBe(rawBytes.toString('hex'));
  });

  it('finds xt among other params, before and after it', () => {
    const hash = '00112233445566778899aabbccddeeff00112233';
    const magnet = `magnet:?dn=Some+Book&xt=urn:btih:${hash}&tr=http://tracker.test/announce`;

    expect(infoHashFromMagnet(magnet)).toBe(hash);
  });

  it('returns null for a v2-only urn:btmh magnet', () => {
    const magnet =
      'magnet:?xt=urn:btmh:1220caf1e1c30e81cb361b9ee167c4aa64228a7fa4fa9f6105232b28ad099f3a302e&dn=Book';

    expect(infoHashFromMagnet(magnet)).toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(infoHashFromMagnet('not a magnet at all')).toBeNull();
    expect(infoHashFromMagnet('magnet:?dn=Book')).toBeNull();
    expect(infoHashFromMagnet('magnet:?xt=urn:btih:tooshort')).toBeNull();
  });
});

/** Minimal RFC 4648 base32 encoder, used only to build the decode test's fixture. */
function encodeBase32ForTest(bytes: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += alphabet[(value >>> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    out += alphabet[(value << (5 - bits)) & 0x1f];
  }
  return out;
}
