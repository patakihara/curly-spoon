/**
 * Tagging an MP3 without touching its audio, on the fixture album's MP3 (scripts/fixtures/album.mjs):
 * an ID3v2.3 tag with 2 KiB of padding before the frames, an ID3v1 tag after them.
 */
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TagsRefused, type TrackTags } from '../tags.js';
import { frameStrings, type Id3Frame, readId3Tag, ufid } from './frames.js';
import { writeId3Tags } from './write.js';
import type { CloneRange, RangeClone } from '../audio/cloneRange.js';

const here = dirname(fileURLToPath(import.meta.url));
const ALBUM = join(here, '..', '..', 'requests', 'albums', 'fixtures', 'the-slip');
const MP3 = '01 - 999,999.mp3';
const source = readFileSync(join(ALBUM, MP3));
/** The fixture's tag: header, seven frames and 2 KiB of padding. */
const SOURCE_TAG = readId3Tag(source)!.length;

const tags: TrackTags = {
  title: '999,999',
  artist: 'Nine Inch Nails',
  artists: [
    { name: 'Nine Inch Nails', id: 'b7ffd2af-418f-4be2-bdd1-22f8b48613da' },
    { name: 'Guest', id: '44444444-4444-4444-8444-444444444444' },
  ],
  album: 'The Slip',
  albumArtist: 'Nine Inch Nails',
  albumArtists: [{ name: 'Nine Inch Nails', id: 'b7ffd2af-418f-4be2-bdd1-22f8b48613da' }],
  trackNumber: 1,
  trackTotal: 10,
  discNumber: 1,
  discTotal: 1,
  date: '2008-07-22',
  originalDate: '2008-05-05',
  recordingId: '11111111-1111-4111-8111-111111111111',
  releaseTrackId: '22222222-2222-4222-8222-222222222222',
  releaseId: '6842b8f3-b108-3c13-8998-6886e3b84300',
  releaseGroupId: '33333333-3333-4333-8333-333333333333',
};

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'auralis-id3-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function write(bytes: Buffer, name = 'track.mp3'): string {
  const path = join(dir, name);
  writeFileSync(path, bytes);
  return path;
}

function frames(path: string) {
  const tag = readId3Tag(readFileSync(path))!;
  const text = (id: string) => tag.frames.filter((f) => f.id === id).map(frameStrings);
  const user = (description: string) =>
    tag.frames
      .filter((f) => f.id === 'TXXX' && frameStrings(f)[0] === description)
      .map((f) => frameStrings(f).slice(1));
  return { tag, text, user };
}

/** A 2.3 frame as a ripper writes it. */
function v23(id: string, body: Buffer): Buffer {
  const header = Buffer.alloc(10);
  header.write(id, 0, 'latin1');
  header.writeUInt32BE(body.length, 4);
  return Buffer.concat([header, body]);
}

function v23Tag(frameBytes: Buffer[], padding: number, flags = 0): Buffer {
  const body = Buffer.concat([...frameBytes, Buffer.alloc(padding)]);
  const n = body.length;
  return Buffer.concat([
    Buffer.from([0x49, 0x44, 0x33, 3, 0, flags]),
    Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]),
    body,
  ]);
}

const audio = source.subarray(SOURCE_TAG);

describe('[M3.albums] an MP3’s tags', () => {
  it('[M3.albums] read back as ID3v2.4 frames under Picard’s names', async () => {
    const path = write(source);
    await writeId3Tags(path, tags);
    const { tag, text, user } = frames(path);
    expect(tag.major).toBe(4);
    expect(text('TIT2')).toEqual([['999,999']]);
    expect(text('TPE1')).toEqual([['Nine Inch Nails']]);
    expect(text('TPE2')).toEqual([['Nine Inch Nails']]);
    expect(text('TALB')).toEqual([['The Slip']]);
    expect(text('TRCK')).toEqual([['1/10']]);
    expect(text('TPOS')).toEqual([['1/1']]);
    expect(text('TDRC')).toEqual([['2008-07-22']]);
    expect(text('TDOR')).toEqual([['2008-05-05']]);
    expect(user('ARTISTS')).toEqual([['Nine Inch Nails', 'Guest']]);
    expect(user('MusicBrainz Album Id')).toEqual([[tags.releaseId]]);
    expect(user('MusicBrainz Release Group Id')).toEqual([[tags.releaseGroupId]]);
    expect(user('MusicBrainz Artist Id')).toEqual([
      ['b7ffd2af-418f-4be2-bdd1-22f8b48613da', '44444444-4444-4444-8444-444444444444'],
    ]);
    expect(user('MusicBrainz Album Artist Id')).toEqual([['b7ffd2af-418f-4be2-bdd1-22f8b48613da']]);
    expect(user('MusicBrainz Release Track Id')).toEqual([[tags.releaseTrackId]]);
    expect(tag.frames.filter((f) => f.id === 'UFID').map(ufid)).toEqual([
      { owner: 'http://musicbrainz.org', id: tags.recordingId },
    ]);
  });

  it('[M3.albums] are written in place over a tag with room, the size, audio and ID3v1 unchanged', async () => {
    const path = write(source);
    expect(await writeId3Tags(path, tags)).toBe('inPlace');
    const after = readFileSync(path);
    expect(after.length).toBe(source.length);
    expect(readId3Tag(after)!.length).toBe(SOURCE_TAG);
    expect(after.subarray(SOURCE_TAG).equals(audio)).toBe(true);
    expect(after.subarray(-128).toString('latin1', 0, 3)).toBe('TAG');
    expect(after.subarray(-128).equals(source.subarray(-128))).toBe(true);
  });

  it('[M3.albums] keep the file’s other frames and drop its old dates and MusicBrainz ids', async () => {
    const path = write(source);
    expect(frames(path).user('MusicBrainz Album Id')).toEqual([
      ['00000000-0000-4000-8000-000000000000'],
    ]);
    await writeId3Tags(path, tags);
    const { tag, text, user } = frames(path);
    expect(text('TCON')).toEqual([['Industrial']]);
    expect(tag.frames.some((f) => f.id === 'TYER')).toBe(false);
    expect(user('MusicBrainz Album Id')).toEqual([[tags.releaseId]]);
    expect(text('TIT2')).toHaveLength(1);
  });

  it('[M3.albums] leave a picture already in the file as it was', async () => {
    const cover = readFileSync(join(ALBUM, 'cover.jpg'));
    const apic = Buffer.concat([Buffer.from('\0image/jpeg\0\x03\0', 'latin1'), cover]);
    const path = write(
      Buffer.concat([
        v23Tag([v23('TIT2', Buffer.from('\0old', 'latin1')), v23('APIC', apic)], 0),
        audio,
      ]),
    );
    expect(await writeId3Tags(path, tags)).toBe('rewritten');
    const pictures = frames(path).tag.frames.filter((f: Id3Frame) => f.id === 'APIC');
    expect(pictures.map((f) => f.body)).toEqual([apic]);
  });

  it('[M3.albums] rewrite a file with no tag, giving it 8 KiB of padding or more so its audio starts on a 4 KiB boundary, the audio byte for byte the same', async () => {
    const path = write(audio);
    expect(await writeId3Tags(path, tags)).toBe('rewritten');
    const after = readFileSync(path);
    const tag = readId3Tag(after)!;
    expect(after.subarray(tag.length).equals(audio)).toBe(true);
    expect(tag.length % 4096).toBe(0);
    expect(after.subarray(tag.length - 8192, tag.length).equals(Buffer.alloc(8192))).toBe(true);
  });

  it('[M3.albums] rewritten, start the audio at the same offset modulo 4 KiB and ask the aligned rest to be cloned', async () => {
    const small = v23Tag([v23('TIT2', Buffer.from('\0old', 'latin1'))], 0);
    const path = write(Buffer.concat([small, audio]));
    const asked: CloneRange[] = [];
    const clone: RangeClone = async (from, _to, range) => {
      expect(from).toBe(path);
      asked.push(range);
      return false;
    };
    await writeId3Tags(path, tags, clone);
    const after = readFileSync(path);
    const tagLength = readId3Tag(after)!.length;
    expect(tagLength % 4096).toBe(small.length % 4096);
    const boundary = Math.ceil(small.length / 4096) * 4096;
    expect(asked).toEqual([
      {
        sourceOffset: boundary,
        length: small.length + audio.length - boundary,
        targetOffset: tagLength + boundary - small.length,
      },
    ]);
  });

  it('[M3.albums] rewrite a file whose tag is too small, the audio byte for byte the same', async () => {
    const small = v23Tag([v23('TIT2', Buffer.from('\0old', 'latin1'))], 0);
    const path = write(Buffer.concat([small, audio]));
    expect(await writeId3Tags(path, tags)).toBe('rewritten');
    const after = readFileSync(path);
    expect(after.subarray(readId3Tag(after)!.length).equals(audio)).toBe(true);
    expect(frames(path).text('TIT2')).toEqual([['999,999']]);
  });

  it('[M3.albums] written again change nothing, in place', async () => {
    const path = write(audio);
    await writeId3Tags(path, tags);
    const once = readFileSync(path);
    expect(await writeId3Tags(path, tags)).toBe('inPlace');
    expect(readFileSync(path).equals(once)).toBe(true);
  });
});

describe('[M3.albums] an MP3 Auralis cannot tag', () => {
  async function refused(path: string): Promise<void> {
    const before = readFileSync(path);
    await expect(writeId3Tags(path, tags)).rejects.toBeInstanceOf(TagsRefused);
    expect(readFileSync(path).equals(before)).toBe(true);
  }

  it('[M3.albums] is refused and left as it was when its tag is unsynchronised', async () => {
    const tag = v23Tag([v23('TIT2', Buffer.from('\0old', 'latin1'))], 64, 0x80);
    await refused(write(Buffer.concat([tag, audio])));
  });

  it('[M3.albums] is refused and left as it was when a frame runs past its tag', async () => {
    const frame = v23('TIT2', Buffer.from('\0old', 'latin1'));
    frame.writeUInt32BE(5000, 4);
    await refused(write(Buffer.concat([v23Tag([frame], 0), audio])));
  });

  it('[M3.albums] is refused and left as it was when it is not an MP3', async () => {
    copyFileSync(join(ALBUM, '03 - Letting You.flac'), join(dir, 'a.flac'));
    await refused(join(dir, 'a.flac'));
    copyFileSync(join(ALBUM, 'The Slip.log'), join(dir, 'a.log'));
    await refused(join(dir, 'a.log'));
  });
});
