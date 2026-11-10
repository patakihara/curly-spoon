/**
 * Where a kept song goes in a real temp Music folder: into an album's folder already there under
 * any of the household's forms (read live from its library), never beside the household's own file
 * of the track, and with only the folders this import made changed, finished or taken away.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SongMatch } from './match.js';
import { albumFolders, COVER_FILE } from '../../music/folders.js';
import { householdTrack, placeSong, type PlaceSongInput, songPlace } from './place.js';

const MATCH: SongMatch = {
  source: 'MusicBrainz',
  by: 'release',
  title: 'Not Gonna Give It Up',
  artist: 'Peter Tosh',
  artists: [{ name: 'Peter Tosh', id: '00000000-0000-4000-8000-000000000001' }],
  album: 'Mama Africa',
  albumArtist: 'Peter Tosh',
  albumArtists: [{ name: 'Peter Tosh', id: '00000000-0000-4000-8000-000000000001' }],
  trackNumber: 3,
  trackTotal: 9,
  discNumber: 1,
  discTotal: 1,
  date: '1983',
  originalDate: '1983',
  recordingId: '00000000-0000-4000-8000-000000000002',
  releaseTrackId: '00000000-0000-4000-8000-000000000003',
  releaseId: '00000000-0000-4000-8000-000000000004',
  releaseGroupId: '00000000-0000-4000-8000-000000000005',
  hasFrontCover: true,
};
const PLACE = songPlace(MATCH);
const JPEG = { mime: 'image/jpeg', bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) };

let music: string;
let built: string;
let noted: string[][];

beforeEach(() => {
  music = mkdtempSync(join(tmpdir(), 'auralis-place-'));
  built = join(music, '.staging-built.opus');
  writeFileSync(built, 'an Ogg Opus file');
  noted = [];
});
afterEach(() => {
  rmSync(music, { recursive: true, force: true });
});

const mode = (path: string) => statSync(path).mode & 0o777;
const folder = (rel: string, folderMode = 0o755) => {
  mkdirSync(join(music, rel), { recursive: true });
  chmodSync(join(music, rel), folderMode);
};

async function place(
  input: Omit<Partial<PlaceSongInput>, 'made'> & { made?: readonly string[] } = {},
) {
  const { made = [], ...rest } = input;
  return placeSong({
    musicDir: music,
    folders: await albumFolders(music, PLACE),
    place: PLACE,
    youtubeMusicId: 'lYBUbBu4W08',
    built,
    cover: JPEG,
    made: { made, note: (now) => noted.push(now) },
    ...rest,
  });
}

describe('[M3.keep/a] a kept song is filed into the album’s folder already there', () => {
  it.each(['1983 - Mama Africa', 'Mama Africa (1983)', 'Mama Africa', 'mama africa (1983)'])(
    '[M3.keep/a] the folder %s, rather than a new one beside it',
    async (name) => {
      folder(`Peter Tosh/${name}`);
      const placed = await place();
      expect(placed.relPath).toBe(`Peter Tosh/${name}/03 - Not Gonna Give It Up.opus`);
      expect(readdirSync(join(music, 'Peter Tosh'))).toEqual([name]);
    },
  );

  it('[M3.keep/a] a folder whose bracket starts with the year, as `(2015 original Broadway cast)`', async () => {
    folder('Peter Tosh/Mama Africa (1983 Jamaican pressing)');
    expect((await albumFolders(music, PLACE)).album).toBe('Mama Africa (1983 Jamaican pressing)');
  });

  it('[M3.keep/a] not a folder of the album from another year, nor another album', async () => {
    folder('Peter Tosh/Mama Africa (2002)');
    folder('Peter Tosh/1983 - Mama Africa Live');
    expect((await albumFolders(music, PLACE)).album).toBe('1983 - Mama Africa');
  });

  it('[M3.keep/a] a song with no year takes the album’s folder of any year', async () => {
    folder('Peter Tosh/Mama Africa (1983)');
    const noYear = songPlace({ ...MATCH, date: null, originalDate: null });
    expect((await albumFolders(music, noYear)).album).toBe('Mama Africa (1983)');
  });
});

describe('[M3.keep/a] the household’s own file of the track is the song, and nothing is added', () => {
  it.each([
    '03 - Not Gonna Give It Up.flac',
    '03. Not Gonna Give It Up.mp3',
    '3 - Peter Tosh - Not Gonna Give It Up.mp3',
    '03.-Not Gonna Give It Up.flac',
  ])('[M3.keep/a] %s', async (name) => {
    folder('Peter Tosh/Mama Africa (1983)');
    writeFileSync(join(music, 'Peter Tosh/Mama Africa (1983)', name), 'the household’s');
    const folders = await albumFolders(music, PLACE);
    expect(await householdTrack(music, folders, PLACE)).toEqual({
      relPath: `Peter Tosh/Mama Africa (1983)/${name}`,
      outcome: 'household',
    });
  });

  it('[M3.keep/a] but not another number, another title or another version of it', async () => {
    folder('Peter Tosh/Mama Africa (1983)');
    for (const name of [
      '04 - Not Gonna Give It Up.flac',
      '03 - Glass House.flac',
      '03 - Not Gonna Give It Up (demo).flac',
      '03 - Not Gonna Give It Up.lrc/',
    ]) {
      if (name.endsWith('/')) mkdirSync(join(music, 'Peter Tosh/Mama Africa (1983)', name));
      else writeFileSync(join(music, 'Peter Tosh/Mama Africa (1983)', name), 'another');
    }
    const folders = await albumFolders(music, PLACE);
    expect(await householdTrack(music, folders, PLACE)).toBeNull();
  });
});

describe('[M3.keep/a] only the folders this import made are changed', () => {
  it('[M3.keep/a] notes each folder before making it, and makes it 0775', async () => {
    await place();
    expect(noted.at(-1)).toEqual(['Peter Tosh', 'Peter Tosh/1983 - Mama Africa']);
    expect(mode(join(music, 'Peter Tosh'))).toBe(0o775);
    expect(mode(join(music, 'Peter Tosh/1983 - Mama Africa'))).toBe(0o775);
  });

  it('[M3.keep/a] a retry sets 0775 on a folder an earlier try made and noted, and never on one someone else made', async () => {
    folder('Peter Tosh');
    folder('Peter Tosh/1983 - Mama Africa');
    await place({ made: ['Peter Tosh/1983 - Mama Africa'] });
    expect(mode(join(music, 'Peter Tosh/1983 - Mama Africa'))).toBe(0o775);
    expect(mode(join(music, 'Peter Tosh'))).toBe(0o755);
  });

  it('[M3.keep/a] writes cover.jpg into an album folder it made, and none into one already there', async () => {
    await place();
    expect(existsSync(join(music, 'Peter Tosh/1983 - Mama Africa', COVER_FILE))).toBe(true);

    rmSync(join(music, 'Peter Tosh'), { recursive: true });
    folder('Peter Tosh/1983 - Mama Africa');
    await place();
    expect(readdirSync(join(music, 'Peter Tosh/1983 - Mama Africa'))).toEqual([
      '03 - Not Gonna Give It Up.opus',
    ]);
  });

  it('[M3.keep/a] a placing that fails takes away the folders it made, each only while empty', async () => {
    rmSync(built);
    await expect(place()).rejects.toThrow();
    expect(readdirSync(music)).toEqual([]);
    expect(noted.at(-1)).toEqual([]);

    folder('Peter Tosh/Legalize It');
    await expect(place({ made: ['Peter Tosh'] })).rejects.toThrow();
    expect(readdirSync(join(music, 'Peter Tosh'))).toEqual(['Legalize It']);
    expect(noted.at(-1)).toEqual(['Peter Tosh']);
  });
});
