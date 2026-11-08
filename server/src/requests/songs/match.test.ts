import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { type FetchLike } from '../../adapters/http/fetch.js';
import { type Recording, recordingSchema } from '../../adapters/http/recording.js';
import { replayFetch } from '../../adapters/http/replay.js';
import { MusicBrainzClient, MUSICBRAINZ_USER_AGENT } from '../../adapters/musicbrainz/client.js';
import { MUSICBRAINZ_SONGS } from '../../adapters/record-musicbrainz.js';
import { StepUnavailable } from '../steps.js';
import { matchSong, MATCH_MOST_CALLS, orderReleases, type SongToMatch, trackOn } from './match.js';

const adapters = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'adapters');
const recorded = (call: string): Recording =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(adapters, 'musicbrainz', 'recordings', `${call}.json`), 'utf8')),
  );
const ALL = [
  'release-search-mama-africa',
  'release-mama-africa',
  'release-search-dame-tu-cosita',
  'release-dame-tu-cosita',
  'release-search-staying-alive',
  'recording-search-stallone',
  'release-staying-alive',
  'recording-search-none',
].map(recorded);

/** A client on every recording, with a clock that never waits, counting the calls it makes. */
function musicBrainz(recordings: Recording[] = ALL) {
  const replay = replayFetch(recordings);
  const calls: string[] = [];
  const fetch: FetchLike = (url, init) => {
    calls.push(new URL(url).pathname);
    return replay(url, init);
  };
  const client = new MusicBrainzClient({
    baseUrl: 'http://upstream.invalid',
    fetch,
    userAgent: MUSICBRAINZ_USER_AGENT,
    clock: { now: () => 0, sleep: async () => {} },
  });
  return { client, calls };
}

/** The songs as YouTube Music names them (the build plan's live table). */
const SONGS = {
  mamaAfrica: {
    title: 'Not Gonna Give It Up (2002 Remaster)',
    artists: ['Peter Tosh'],
    album: 'Mama Africa',
    durationSeconds: 348,
  },
  dameTuCosita: {
    title: 'Dame Tu Cosita (feat. Cutty Ranks)',
    artists: ['El Chombo'],
    album: 'Dame Tu Cosita',
    durationSeconds: 152,
  },
  stallone: {
    title: "I'm Never Gonna Give You Up",
    artists: ['Frank Stallone', 'Cynthia Rhodes'],
    album: 'Staying Alive (Original Motion Picture Soundtrack)',
    durationSeconds: 211,
  },
  nonsense: {
    title: 'Zqxv Plorb Wendigast',
    artists: ['Nobody Atall'],
    album: null,
    durationSeconds: 180,
  },
} as const satisfies Record<string, SongToMatch>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('[M3.keep] a song is matched to MusicBrainz', () => {
  it('[M3.keep] a song on a named album is found by its release, with every id', async () => {
    const { client, calls } = musicBrainz();
    const match = await matchSong({ musicBrainz: client }, SONGS.mamaAfrica);
    expect(match).toMatchObject({
      source: 'MusicBrainz',
      by: 'release',
      title: 'Not Gonna Give It Up',
      artist: 'Peter Tosh',
      album: 'Mama Africa',
      albumArtist: 'Peter Tosh',
      releaseId: MUSICBRAINZ_SONGS.mamaAfrica.lookup,
      trackNumber: 3,
      trackTotal: 9,
      discNumber: 1,
      discTotal: 1,
      date: '1983',
      originalDate: '1983',
      hasFrontCover: true,
    });
    if (match.source !== 'MusicBrainz') throw new Error('not matched');
    for (const id of [match.recordingId, match.releaseTrackId, match.releaseGroupId]) {
      expect(id).toMatch(UUID);
    }
    expect(match.artists).toEqual([{ name: 'Peter Tosh', id: expect.stringMatching(UUID) }]);
    expect(match.albumArtists).toEqual(match.artists);
    expect(calls).toEqual([
      '/ws/2/release',
      `/ws/2/release/${MUSICBRAINZ_SONGS.mamaAfrica.lookup}`,
    ]);
  });

  it('[M3.keep] a single by several artists is the earliest release, track 1, crediting each', async () => {
    const { client } = musicBrainz();
    const match = await matchSong({ musicBrainz: client }, SONGS.dameTuCosita);
    expect(match).toMatchObject({
      source: 'MusicBrainz',
      by: 'release',
      releaseId: MUSICBRAINZ_SONGS.dameTuCosita.lookup,
      title: 'Dame tu cosita',
      artist: 'El Chombo feat. Cutty Ranks',
      albumArtist: 'El Chombo feat. Cutty Ranks',
      trackNumber: 1,
      trackTotal: 1,
    });
    if (match.source !== 'MusicBrainz') throw new Error('not matched');
    expect(match.artists.map((a) => a.name)).toEqual(['El Chombo', 'Cutty Ranks']);
    expect(new Set(match.artists.map((a) => a.id)).size).toBe(2);
    for (const { id } of match.artists) expect(id).toMatch(UUID);
  });

  it("[M3.keep] a soundtrack's song, whose release is by Various Artists, is found by its recording", async () => {
    const { client, calls } = musicBrainz();
    const match = await matchSong({ musicBrainz: client }, SONGS.stallone);
    expect(match).toMatchObject({
      source: 'MusicBrainz',
      by: 'recording',
      releaseId: MUSICBRAINZ_SONGS.stayingAlive.lookup,
      title: "I'm Never Gonna Give You Up",
      artist: 'Frank Stallone & Cynthia Rhodes',
      album: 'Staying Alive',
      albumArtist: 'Various Artists',
      trackNumber: 12,
      date: '1983',
    });
    expect(calls).toEqual([
      '/ws/2/release',
      '/ws/2/recording',
      `/ws/2/release/${MUSICBRAINZ_SONGS.stayingAlive.lookup}`,
    ]);
  });

  it('[M3.keep] a song MusicBrainz does not know is kept on what YouTube Music says, with no ids', async () => {
    const { client, calls } = musicBrainz();
    const match = await matchSong({ musicBrainz: client }, SONGS.nonsense);
    expect(match).toEqual({
      source: 'YouTube Music',
      title: 'Zqxv Plorb Wendigast',
      artists: [{ name: 'Nobody Atall' }],
      artist: 'Nobody Atall',
      album: 'Zqxv Plorb Wendigast',
    });
    expect(calls).toEqual(['/ws/2/recording']);
  });

  it('[M3.keep] with MusicBrainz off, a song is kept on what YouTube Music says, asking nothing', async () => {
    const match = await matchSong({ musicBrainz: null }, SONGS.mamaAfrica);
    expect(match).toEqual({
      source: 'YouTube Music',
      title: 'Not Gonna Give It Up (2002 Remaster)',
      artists: [{ name: 'Peter Tosh' }],
      artist: 'Peter Tosh',
      album: 'Mama Africa',
    });
  });

  it('[M3.keep] MusicBrainz unreachable holds the request rather than keeping it untagged', async () => {
    const busy = recorded('search-503');
    const { client } = musicBrainz([busy]);
    await expect(matchSong({ musicBrainz: client }, SONGS.mamaAfrica)).rejects.toBeInstanceOf(
      StepUnavailable,
    );
  });

  it(`[M3.keep] no song takes more than ${MATCH_MOST_CALLS} calls`, async () => {
    for (const song of Object.values(SONGS)) {
      const { client, calls } = musicBrainz();
      await matchSong({ musicBrainz: client }, song);
      expect(calls.length).toBeLessThanOrEqual(MATCH_MOST_CALLS);
    }
    expect(MATCH_MOST_CALLS).toBe(4);
  });
});

describe("[M3.keep] a release's track is the song only within 4 s", () => {
  const release = () => {
    const { client } = musicBrainz([recorded('release-mama-africa')]);
    return client.release(MUSICBRAINZ_SONGS.mamaAfrica.lookup);
  };

  it('[M3.keep] the track 4 s off is the song', async () => {
    const found = trackOn((await release())!, { ...SONGS.mamaAfrica, durationSeconds: 349.8 });
    expect(found?.track.position).toBe(3);
  });

  it('[M3.keep] the track 6 s off is refused', async () => {
    expect(trackOn((await release())!, { ...SONGS.mamaAfrica, durationSeconds: 351.8 })).toBeNull();
    expect(trackOn((await release())!, { ...SONGS.mamaAfrica, durationSeconds: 339.8 })).toBeNull();
  });
});

describe('[M3.keep] which release a song is looked up on', () => {
  const search = (call: string) => {
    const { client } = musicBrainz([recorded(call)]);
    return call.includes('mama')
      ? client.searchReleases(MUSICBRAINZ_SONGS.mamaAfrica.release)
      : client.searchReleases(MUSICBRAINZ_SONGS.dameTuCosita.release);
  };

  it('[M3.keep] the earliest official release of that title comes first', async () => {
    const found = await search('release-search-dame-tu-cosita');
    const order = orderReleases(found.releases, 'Dame Tu Cosita', new Set());
    expect(order[0]!.id).toBe(MUSICBRAINZ_SONGS.dameTuCosita.lookup);
    const africa = await search('release-search-mama-africa');
    const first = orderReleases(africa.releases, 'Mama Africa', new Set())[0]!;
    expect(first.id).toBe(MUSICBRAINZ_SONGS.mamaAfrica.lookup);
  });

  it('[M3.keep] a release group a kept song already used comes before an earlier one', async () => {
    const found = await search('release-search-dame-tu-cosita');
    const later = found.releases.find((r) => r.date === '2018-08-24')!;
    const order = orderReleases(found.releases, 'Dame Tu Cosita', new Set([later.releaseGroup.id]));
    expect(order[0]!.id).toBe(later.id);
    expect(order[1]!.id).toBe(MUSICBRAINZ_SONGS.dameTuCosita.lookup);
  });

  it('[M3.keep] a release of another title is never the album', async () => {
    const found = await search('release-search-dame-tu-cosita');
    expect(orderReleases(found.releases, 'Mama Africa', new Set())).toEqual([]);
  });
});
