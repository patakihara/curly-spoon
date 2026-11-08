/**
 * A kept song's search, on MusicBrainz's recorded answers: the song is read from what search named
 * of it, matched, and always picked, with the whole match in its release.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { type FetchLike } from '../../adapters/http/fetch.js';
import { recordingSchema } from '../../adapters/http/recording.js';
import { replayFetch } from '../../adapters/http/replay.js';
import { MusicBrainzClient, MUSICBRAINZ_USER_AGENT } from '../../adapters/musicbrainz/client.js';
import type { RecordingSearch } from '../../adapters/musicbrainz/schemas.js';
import { openDatabase, type Db } from '../../store/connection.js';
import { createRequest, saveRequest } from '../../store/requests.js';
import { rememberTracks, type StreamedTrack } from '../../store/streamedTracks.js';
import { upsertUser } from '../../store/users.js';
import { StepUnavailable } from '../steps.js';
import { songSearch } from './search.js';

const adapters = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'adapters');
const recorded = (call: string) =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(adapters, 'musicbrainz', 'recordings', `${call}.json`), 'utf8')),
  );

const client = (fetch: FetchLike) =>
  new MusicBrainzClient({
    baseUrl: 'http://upstream.invalid',
    fetch,
    userAgent: MUSICBRAINZ_USER_AGENT,
    clock: { now: () => 0, sleep: async () => {} },
  });

const NOW = 1_800_000_000_000;
const MAMA_AFRICA: StreamedTrack = {
  id: 'aaaaaaaaaaa',
  title: 'Not Gonna Give It Up (2002 Remaster)',
  artists: ['Peter Tosh'],
  album: 'Mama Africa',
  duration: 348,
  artUrl: null,
};
const DAME_TU_COSITA: StreamedTrack = {
  id: 'bbbbbbbbbbb',
  title: 'Dame Tu Cosita (feat. Cutty Ranks)',
  artists: ['El Chombo'],
  album: 'Dame Tu Cosita',
  duration: 152,
  artUrl: null,
};

let db: Db;
let user: string;
beforeEach(() => {
  db = openDatabase(':memory:');
  user = upsertUser(db, { username: 'ana', role: 'member' }).id;
  rememberTracks(db, [MAMA_AFRICA, DAME_TU_COSITA], NOW);
});

const keep = (song: StreamedTrack) =>
  createRequest(
    db,
    user,
    {
      medium: 'song',
      target: { title: song.title, creator: song.artists[0]!, ids: { youtubeMusicId: song.id } },
    },
    NOW,
  ).request;

describe('[M3.keep] a kept song is searched for on MusicBrainz', () => {
  it('[M3.keep] picks the matched release, carrying the song and every id of the match', async () => {
    const replay = replayFetch(['release-search-mama-africa', 'release-mama-africa'].map(recorded));
    const search = songSearch({ db, musicBrainz: client(replay) });
    const found = await search(keep(MAMA_AFRICA));
    expect(found).toMatchObject({
      kind: 'picked',
      others: [],
      release: {
        title: 'Mama Africa',
        source: 'MusicBrainz',
        size: null,
        details: {
          youtubeMusicId: MAMA_AFRICA.id,
          match: { source: 'MusicBrainz', by: 'release', trackNumber: 3, album: 'Mama Africa' },
        },
      },
    });
    if (found.kind !== 'picked') throw new Error('not picked');
    const { match } = found.release.details as { match: { releaseId: string } };
    expect(found.release.id).toBe(match.releaseId);
  });

  it('[M3.keep] with MusicBrainz off, the song is picked on its own names, by its own id', async () => {
    const found = await songSearch({ db, musicBrainz: null })(keep(MAMA_AFRICA));
    expect(found).toEqual({
      kind: 'picked',
      others: [],
      release: {
        id: MAMA_AFRICA.id,
        title: 'Mama Africa',
        source: 'YouTube Music',
        size: null,
        details: {
          youtubeMusicId: MAMA_AFRICA.id,
          match: {
            source: 'YouTube Music',
            title: MAMA_AFRICA.title,
            artist: 'Peter Tosh',
            artists: [{ name: 'Peter Tosh' }],
            album: 'Mama Africa',
          },
        },
      },
    });
  });

  it('[M3.keep] MusicBrainz unreachable holds the request rather than keeping the song untagged', async () => {
    const down: FetchLike = () => Promise.reject(new TypeError('fetch failed'));
    const search = songSearch({ db, musicBrainz: client(down) });
    await expect(search(keep(MAMA_AFRICA))).rejects.toBeInstanceOf(StepUnavailable);
  });

  it('[M3.keep] looks up first a release of a group another kept song went with', async () => {
    const replay = replayFetch([recorded('release-search-dame-tu-cosita')]);
    const real = client(replay);
    const lookedUp: string[] = [];
    const none: RecordingSearch = { count: 0, recordings: [] };
    const musicBrainz = {
      searchReleases: real.searchReleases.bind(real),
      searchRecordings: () => Promise.resolve(none),
      release: (id: string) => {
        lookedUp.push(id);
        return Promise.resolve(null);
      },
    };
    // An earlier keep went with the later of the song's two release groups.
    const earlier = keep(MAMA_AFRICA);
    saveRequest(
      db,
      earlier.id,
      {
        state: { status: 'downloading', progress: 0 },
        release: {
          id: 'a14761ad-683f-4c8c-b68f-4a0e4a749241',
          title: 'Dame tu cosita',
          source: 'MusicBrainz',
          size: null,
          details: {
            youtubeMusicId: MAMA_AFRICA.id,
            match: {
              source: 'MusicBrainz',
              releaseGroupId: '506ce31c-1ab1-40ee-a02a-d98b4be5eed3',
            },
          },
        },
      },
      NOW,
    );
    await songSearch({ db, musicBrainz })(keep(DAME_TU_COSITA));
    expect(lookedUp[0]).toBe('a14761ad-683f-4c8c-b68f-4a0e4a749241');
  });

  it('[M3.keep] a song search never named finds no release', async () => {
    const one = keep({ ...MAMA_AFRICA, id: 'zzzzzzzzzzz' });
    expect(await songSearch({ db, musicBrainz: null })(one)).toEqual({
      kind: 'none',
      reason: 'noRelease',
    });
  });
});
