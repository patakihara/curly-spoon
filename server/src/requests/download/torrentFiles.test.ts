import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { infoBytes, TORRENT_MAX_BYTES, torrentContents } from './torrentFiles.js';

type B = number | string | B[] | { [key: string]: B };

/** Bencode, keys in order, as a torrent writes them. */
function encode(value: B): string {
  if (typeof value === 'number') return `i${value}e`;
  if (typeof value === 'string') return `${Buffer.byteLength(value)}:${value}`;
  if (Array.isArray(value)) return `l${value.map(encode).join('')}e`;
  const keys = Object.keys(value).sort();
  return `d${keys.map((k) => encode(k) + encode(value[k]!)).join('')}e`;
}

const torrent = (value: B) => new Uint8Array(Buffer.from(encode(value), 'utf8'));

const album = (files: B[], extra: { [key: string]: B } = {}) =>
  torrent({
    announce: 'udp://tracker.invalid:1337/announce',
    info: { name: 'An Album [FLAC]', 'piece length': 262144, pieces: 'x'.repeat(20), files },
    ...extra,
  });

const file = (length: number, ...path: string[]): B => ({ length, path });

describe('[M3.albums] a torrent read before anything is downloaded', () => {
  it('[M3.albums] lists each file under the torrent’s folder, with its size', () => {
    const contents = torrentContents(
      album([file(30_000_000, '01 - First.flac'), file(1200, 'Scans', 'cover.jpg')]),
    );
    expect(contents?.name).toBe('An Album [FLAC]');
    expect(contents?.files).toEqual([
      { path: 'An Album [FLAC]/01 - First.flac', size: 30_000_000 },
      { path: 'An Album [FLAC]/Scans/cover.jpg', size: 1200 },
    ]);
    expect(contents?.webSeeds).toEqual([]);
  });

  it('[M3.albums] a single-file torrent is that one file', () => {
    const contents = torrentContents(
      torrent({ info: { name: 'album.wav', length: 500_000_000, 'piece length': 1, pieces: '' } }),
    );
    expect(contents?.files).toEqual([{ path: 'album.wav', size: 500_000_000 }]);
  });

  it('[M3.albums] names its web seeds, one or a list, and only web addresses', () => {
    const one = torrentContents(
      album([file(1, 'a.flac')], { 'url-list': 'https://seed.invalid/a/' }),
    );
    expect(one?.webSeeds).toEqual(['https://seed.invalid/a/']);
    const many = torrentContents(
      album([file(1, 'a.flac')], {
        'url-list': ['http://seed.invalid/', 'ftp://seed.invalid/', 'https://other.invalid/'],
      }),
    );
    expect(many?.webSeeds).toEqual(['http://seed.invalid/', 'https://other.invalid/']);
  });

  it('[M3.albums] its hash is the info dictionary’s, as the magnet names it', () => {
    const bytes = album([file(1, 'a.flac')], { comment: 'anything' });
    const info = infoBytes(bytes)!;
    const hash = createHash('sha1').update(info).digest('hex');
    expect(torrentContents(bytes)?.hash).toBe(hash);
    expect(Buffer.from(info).toString('utf8')).toMatch(/^d5:filesl/);
  });

  it('[M3.albums] refuses a path that could leave the torrent’s folder', () => {
    for (const path of [
      ['..', 'etc', 'passwd'],
      ['.', 'a.flac'],
      ['a/b.flac'],
      [''],
      ['a\0.flac'],
    ]) {
      expect(torrentContents(album([file(1, ...path)])), JSON.stringify(path)).toBeNull();
    }
    expect(
      torrentContents(torrent({ info: { name: '..', length: 1, 'piece length': 1, pieces: '' } })),
    ).toBeNull();
  });

  it('[M3.albums] refuses nesting deeper than any torrent, without overflowing', () => {
    const deep = `d4:info${'l'.repeat(100_000)}${'e'.repeat(100_000)}e`;
    expect(torrentContents(new Uint8Array(Buffer.from(deep)))).toBeNull();
  });

  it('[M3.albums] refuses a torrent past 8 MiB, however sound', () => {
    const big = album([file(1, 'a.flac')], { padding: 'x'.repeat(TORRENT_MAX_BYTES) });
    expect(big.length).toBeGreaterThan(TORRENT_MAX_BYTES);
    expect(torrentContents(big)).toBeNull();
  });

  it('[M3.albums] refuses what is not a torrent: cut short, trailing bytes, no info, bad sizes', () => {
    const good = album([file(1, 'a.flac')]);
    expect(torrentContents(good.subarray(0, good.length - 3))).toBeNull();
    expect(torrentContents(new Uint8Array([...good, 0x78]))).toBeNull();
    expect(torrentContents(torrent({ announce: 'x' }))).toBeNull();
    expect(torrentContents(album([file(-1, 'a.flac')]))).toBeNull();
    expect(torrentContents(album([{ path: ['a.flac'] }]))).toBeNull();
    expect(torrentContents(new TextEncoder().encode('<html>not found</html>'))).toBeNull();
  });
});
