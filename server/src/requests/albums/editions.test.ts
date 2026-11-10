import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { FetchLike } from '../../adapters/http/fetch.js';
import { type Recording, recordingSchema } from '../../adapters/http/recording.js';
import { replayFetch } from '../../adapters/http/replay.js';
import {
  type Clock,
  MusicBrainzClient,
  MUSICBRAINZ_USER_AGENT,
} from '../../adapters/musicbrainz/client.js';
import type { GroupRelease } from '../../adapters/musicbrainz/schemas.js';
import { ALBUM_GROUPS } from '../../adapters/record-musicbrainz.js';
import { openDatabase } from '../../store/connection.js';
import {
  ALBUM_EDITIONS_CACHE_MS,
  AlbumEditions,
  type Edition,
  foldEditions,
  releaseFor,
  targetEdition,
} from './editions.js';

const recordings = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../adapters/musicbrainz/recordings',
);
const recording = (call: string): Recording =>
  recordingSchema.parse(JSON.parse(readFileSync(join(recordings, `${call}.json`), 'utf8')));

const CALLS = [
  'rg-slip',
  'releases-slip',
  'rg-ghosts',
  'releases-ghosts',
  'rg-artificial-heart',
  'releases-artificial-heart',
  'rg-gone',
];

const fakeClock = (): Clock => {
  let now = 0;
  return { now: () => now, sleep: async (ms) => void (now += ms) };
};

/** A MusicBrainz client on the recordings, counting what it asks. */
function replayed() {
  const replay = replayFetch(CALLS.map(recording));
  const asked: string[] = [];
  const fetch: FetchLike = (url, init) => {
    asked.push(new URL(url).pathname + new URL(url).search);
    return replay(url, init);
  };
  const musicBrainz = new MusicBrainzClient({
    baseUrl: 'http://upstream.invalid',
    fetch,
    userAgent: MUSICBRAINZ_USER_AGENT,
    clock: fakeClock(),
  });
  return { musicBrainz, asked };
}

const { slip, ghosts, artificialHeart, gone } = ALBUM_GROUPS;

async function releasesOf(group: string): Promise<GroupRelease[]> {
  return replayed().musicBrainz.releasesOfGroup(group);
}

const ids = (edition: Edition) => edition.releases.map((r) => r.id);
const recordingsOf = (edition: Edition) => edition.tracks.map((t) => t.recordingId);

describe("[M3.albums] an album's editions, from MusicBrainz's release group", () => {
  it("[M3.albums] Ghosts I–IV's releases give its 36 recordings as editions apart from the 9-track one", async () => {
    const editions = foldEditions(await releasesOf(ghosts.group));
    expect(editions.map((e) => [e.tracks.length, e.releases.length])).toEqual([
      [36, 3],
      [36, 3],
      [9, 1],
      [40, 1],
      [38, 1],
    ]);
    // The digital release, the box whose Blu-ray and DVD are left out, and the vinyl share every
    // recording; the three plain CDs carry a shorter "18 Ghosts II", a recording of its own.
    const [album, cds] = editions;
    expect(album!.releases.map((r) => r.formats.join('+'))).toEqual([
      'Digital Media',
      'CD+CD',
      '12" Vinyl+12" Vinyl+12" Vinyl+12" Vinyl',
    ]);
    expect(album!.releases[0]!.id).toBe(ghosts.digital);
    expect(cds!.releases.map((r) => r.formats.join('+'))).toEqual(['CD+CD', 'CD+CD', 'CD+CD']);
    expect(album!.tracks[0]).toMatchObject({ title: '1 Ghosts I', length: 169_000 });
    expect(album!.tracks[17]).toMatchObject({ title: '18 Ghosts II', length: 323_000 });
    expect(cds!.tracks[17]).toMatchObject({ title: '18 Ghosts II', length: 314_000 });
    const differ = album!.tracks.filter((t, i) => t.recordingId !== cds!.tracks[i]!.recordingId);
    expect(differ).toHaveLength(1);
    const ghostsI = editions.find((e) => e.tracks.length === 9)!;
    expect(recordingsOf(album!).slice(0, 9)).toEqual(recordingsOf(ghostsI));
  });

  it("[M3.albums] The Slip's official releases are one edition, its CD's DVD of videos left out", async () => {
    const editions = foldEditions(await releasesOf(slip.group));
    expect(editions.map((e) => e.tracks.length)).toContain(10);
    const album = editions[0]!;
    expect(album.tracks).toHaveLength(10);
    const cd = album.releases.find((r) => r.id === slip.cd)!;
    expect(cd).toMatchObject({ formats: ['CD'], trackCounts: [10], country: 'US' });
  });

  it('[M3.albums] a bootleg and a pseudo-release are left out', async () => {
    const official = await releasesOf(slip.group);
    const others = (['Bootleg', 'Pseudo-Release', null] as const).map((status, i) => ({
      ...official[0]!,
      id: `not-official-${i}`,
      status,
    }));
    const editions = foldEditions([...official, ...others]);
    const listed = editions.flatMap(ids);
    expect(listed).toHaveLength(official.length);
    expect(listed.some((id) => id.startsWith('not-official'))).toBe(false);
  });

  it('[M3.albums] the target is the edition the most releases share', async () => {
    const editions = foldEditions(await releasesOf(ghosts.group));
    expect(targetEdition(editions)!.tracks).toHaveLength(36);
    expect(targetEdition(editions, [])).toBe(editions[0]);
    expect(targetEdition([])).toBeNull();
  });

  it('[M3.albums] a kept recording the most shared edition holds keeps it the target', async () => {
    const editions = foldEditions(await releasesOf(ghosts.group));
    // "1 Ghosts I" is on the 9-track Ghosts I too, which is smaller but not the album.
    const first = editions[0]!.tracks[0]!.recordingId;
    expect(targetEdition(editions, [first])).toBe(editions[0]);
  });

  it('[M3.albums] a kept recording the most shared edition lacks makes the smallest holding it the target', async () => {
    const editions = foldEditions(await releasesOf(ghosts.group));
    const [album, cds] = editions;
    // The CDs' own "18 Ghosts II": the 36-track CD edition, not the 40-track one that also has it.
    const cdOnly = cds!.tracks[17]!.recordingId;
    expect(targetEdition(editions, [cdOnly])).toBe(cds);
    // A bonus track of the Japanese CD: only its 40-track edition holds it.
    const jp = editions.find((e) => e.tracks.length === 40)!;
    const bonus = jp.tracks.at(-1)!.recordingId;
    expect(targetEdition(editions, [bonus, album!.tracks[0]!.recordingId])).toBe(jp);
    // A kept recording no edition holds leaves the most shared.
    expect(targetEdition(editions, ['no-such-recording'])).toBe(album);
  });

  it('[M3.albums] one folder is tagged from a single-medium release, two disc folders from the CD', async () => {
    const [album, cds] = foldEditions(await releasesOf(ghosts.group));
    expect(releaseFor(album!, [36])).toMatchObject({ id: ghosts.digital, trackCounts: [36] });
    // The box set, its video discs left out.
    expect(releaseFor(album!, [18, 18])).toMatchObject({ formats: ['CD', 'CD'], country: 'US' });
    // Among the three CDs, the earliest.
    const cd = releaseFor(cds!, [18, 18]);
    expect(cd).toMatchObject({ formats: ['CD', 'CD'], date: '2008-04-05' });
    // A layout no release has: the earliest CD.
    expect(releaseFor(cds!, [12, 12, 12]).id).toBe(cd.id);
    expect(releaseFor(album!, [12, 12, 12]).formats).toEqual(['CD', 'CD']);
  });

  it('[M3.albums] The Slip in one folder is tagged from its CD, the single-medium release it has', async () => {
    const [album] = foldEditions(await releasesOf(slip.group));
    expect(releaseFor(album!, [10]).id).toBe(slip.cd);
  });
});

describe('[M3.albums] the kept editions', () => {
  const setup = () => {
    const db = openDatabase(':memory:');
    let now = 1_000_000;
    const { musicBrainz, asked } = replayed();
    const editions = new AlbumEditions({ db, musicBrainz, now: () => now });
    return { db, editions, asked, advance: (ms: number) => void (now += ms) };
  };

  it('[M3.albums] reads the group and its editions, and the second read asks nothing', async () => {
    const { editions, asked } = setup();
    const album = (await editions.read(ghosts.group))!;
    expect(album.group).toMatchObject({ id: ghosts.group, title: 'Ghosts I–IV' });
    expect(album.group.artistCredit[0]!.name).toBe('Nine Inch Nails');
    expect(album.editions[0]!.tracks).toHaveLength(36);
    expect(asked).toHaveLength(2);
    expect(await editions.read(ghosts.group)).toEqual(album);
    expect(asked).toHaveLength(2);
  });

  it('[M3.albums] the kept editions outlive the process: a new reader on the same store asks nothing', async () => {
    const { db, editions, asked } = setup();
    const album = await editions.read(artificialHeart.group);
    const again = replayed();
    const fresh = new AlbumEditions({ db, musicBrainz: again.musicBrainz, now: () => 1_000_000 });
    expect(await fresh.read(artificialHeart.group)).toEqual(album);
    expect(again.asked).toHaveLength(0);
    expect(asked).toHaveLength(2);
  });

  it('[M3.albums] two reads at once ask MusicBrainz once', async () => {
    const { editions, asked } = setup();
    const [a, b] = await Promise.all([editions.read(slip.group), editions.read(slip.group)]);
    expect(a).toEqual(b);
    expect(asked).toHaveLength(2);
  });

  it('[M3.albums] a week later the group is asked again', async () => {
    const { editions, asked, advance } = setup();
    await editions.read(slip.group);
    advance(ALBUM_EDITIONS_CACHE_MS - 1);
    await editions.read(slip.group);
    expect(asked).toHaveLength(2);
    advance(1);
    await editions.read(slip.group);
    expect(asked).toHaveLength(4);
  });

  it('[M3.albums] a group that is gone answers null, and its releases are never asked', async () => {
    const { editions, asked, db } = setup();
    expect(await editions.read(gone.group)).toBeNull();
    expect(asked).toEqual([expect.stringMatching(/^\/ws\/2\/release-group\//)]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM album_editions').get()).toEqual({ n: 0 });
  });
});
