/**
 * Tagging a FLAC without touching its audio, on the fixture album (scripts/fixtures/album.mjs):
 * track 1 holds 4 KiB of padding and a front cover, track 3 no padding at all.
 */
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TagsRefused, trackComments, type TrackTags } from '../tags.js';
import { BLOCK, flacComments, flacPictures, type FlacFile, readFlac } from './blocks.js';
import { writeFlacTags } from './write.js';

const here = dirname(fileURLToPath(import.meta.url));
const ALBUM = join(here, '..', '..', 'requests', 'albums', 'fixtures', 'the-slip');
const PADDED = '01 - 999,999.flac';
const UNPADDED = '03 - Letting You.flac';

const tags: TrackTags = {
  title: '999,999',
  artist: 'Nine Inch Nails',
  artists: [{ name: 'Nine Inch Nails', id: 'b7ffd2af-418f-4be2-bdd1-22f8b48613da' }],
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
  dir = mkdtempSync(join(tmpdir(), 'auralis-flac-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function copy(name: string): string {
  const path = join(dir, name);
  copyFileSync(join(ALBUM, name), path);
  return path;
}

async function read(path: string): Promise<FlacFile> {
  const file = await open(path, 'r');
  try {
    return await readFlac(file);
  } finally {
    await file.close();
  }
}

const audioOf = async (path: string) => readFileSync(path).subarray((await read(path)).audioStart);
const padding = (flac: FlacFile) =>
  flac.blocks.filter((block) => block.type === BLOCK.PADDING).map((block) => block.body.length);

describe('[M3.albums] a FLAC’s tags', () => {
  it('[M3.albums] read back as written, in Picard’s names', async () => {
    const path = copy(PADDED);
    await writeFlacTags(path, trackComments(tags));
    const comments = flacComments(await read(path))!.comments;
    for (const comment of trackComments(tags)) expect(comments).toContainEqual(comment);
    expect(comments.filter((c) => c.key === 'TITLE')).toEqual([{ key: 'TITLE', value: '999,999' }]);
  });

  it('[M3.albums] are written in place when the padding holds them, the size and audio unchanged', async () => {
    const path = copy(PADDED);
    const before = readFileSync(path);
    const audio = await audioOf(path);
    expect(await writeFlacTags(path, trackComments(tags))).toBe('inPlace');
    const after = readFileSync(path);
    expect(after.length).toBe(before.length);
    expect((await read(path)).audioStart).toBe(before.length - audio.length);
    expect(after.subarray(after.length - audio.length).equals(audio)).toBe(true);
  });

  it('[M3.albums] rewrite a file with no padding, giving it 8 KiB, the audio byte for byte the same', async () => {
    const path = copy(UNPADDED);
    const audio = await audioOf(path);
    expect(padding(await read(path))).toEqual([]);
    expect(await writeFlacTags(path, trackComments({ ...tags, title: 'Letting You' }))).toBe(
      'rewritten',
    );
    const flac = await read(path);
    expect(padding(flac)).toEqual([8192]);
    expect(flac.blocks.at(-1)?.type).toBe(BLOCK.PADDING);
    expect(readFileSync(path).subarray(flac.audioStart).equals(audio)).toBe(true);
    expect(flacComments(flac)!.comments).toContainEqual({ key: 'TITLE', value: 'Letting You' });
  });

  it('[M3.albums] keep the file’s other keys and vendor, and replace its old MusicBrainz ids', async () => {
    const path = copy(PADDED);
    const before = flacComments(await read(path))!;
    expect(before.comments).toContainEqual({
      key: 'MUSICBRAINZ_TRACKID',
      value: '00000000-0000-4000-8000-000000000000',
    });
    await writeFlacTags(path, trackComments(tags));
    const after = flacComments(await read(path))!;
    expect(after.vendor).toBe(before.vendor);
    expect(after.comments).toContainEqual({ key: 'GENRE', value: 'Industrial' });
    expect(after.comments).toContainEqual({ key: 'REPLAYGAIN_TRACK_GAIN', value: '-6.00 dB' });
    expect(after.comments.filter((c) => c.key === 'MUSICBRAINZ_TRACKID')).toEqual([
      { key: 'MUSICBRAINZ_TRACKID', value: tags.recordingId },
    ]);
    expect(after.comments.filter((c) => c.key === 'DATE')).toEqual([
      { key: 'DATE', value: '2008-07-22' },
    ]);
  });

  it('[M3.albums] leave a picture already in the file as it was', async () => {
    const path = copy(PADDED);
    const cover = readFileSync(join(ALBUM, 'cover.jpg'));
    expect(flacPictures(await read(path)).map((p) => p.data)).toEqual([cover]);
    await writeFlacTags(path, trackComments(tags));
    const pictures = flacPictures(await read(path));
    expect(pictures).toHaveLength(1);
    expect(pictures[0]).toMatchObject({ mime: 'image/jpeg', data: cover });
  });

  it('[M3.albums] written again change nothing, in place', async () => {
    const path = copy(UNPADDED);
    await writeFlacTags(path, trackComments(tags));
    const once = readFileSync(path);
    expect(await writeFlacTags(path, trackComments(tags))).toBe('inPlace');
    expect(readFileSync(path).equals(once)).toBe(true);
  });

  it('[M3.albums] go after an ID3 tag a ripper put before the FLAC, which stays', async () => {
    const path = join(dir, 'prefixed.flac');
    const id3 = Buffer.concat([
      Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x0a', 'latin1'),
      Buffer.alloc(10),
    ]);
    const source = readFileSync(join(ALBUM, UNPADDED));
    writeFileSync(path, Buffer.concat([id3, source]));
    await writeFlacTags(path, trackComments(tags));
    const after = readFileSync(path);
    expect(after.subarray(0, id3.length).equals(id3)).toBe(true);
    const flac = await read(path);
    expect(flac.start).toBe(id3.length);
    expect(
      after
        .subarray(flac.audioStart)
        .equals(source.subarray((await read(join(ALBUM, UNPADDED))).audioStart)),
    ).toBe(true);
  });
});

describe('[M3.albums] a FLAC Auralis cannot tag', () => {
  async function refused(path: string): Promise<void> {
    const before = readFileSync(path);
    await expect(writeFlacTags(path, trackComments(tags))).rejects.toBeInstanceOf(TagsRefused);
    expect(readFileSync(path).equals(before)).toBe(true);
  }

  it('[M3.albums] is refused and left as it was when it is not FLAC', async () => {
    await refused(copy('01 - 999,999.mp3'));
    await refused(copy('cover.jpg'));
  });

  it('[M3.albums] is refused and left as it was when a metadata block runs past the file', async () => {
    const path = join(dir, 'cut.flac');
    writeFileSync(path, readFileSync(join(ALBUM, PADDED)).subarray(0, 200));
    await refused(path);
  });

  it('[M3.albums] is refused and left as it was when no frame follows its metadata', async () => {
    const path = join(dir, 'shifted.flac');
    const source = readFileSync(join(ALBUM, UNPADDED));
    const audioStart = (await read(join(ALBUM, UNPADDED))).audioStart;
    writeFileSync(
      path,
      Buffer.concat([
        source.subarray(0, audioStart),
        Buffer.from('junk'),
        source.subarray(audioStart),
      ]),
    );
    await refused(path);
  });
});
