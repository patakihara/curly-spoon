/**
 * The albums Search lists on the recorded server, and an album made of kept songs: the real catalogue
 * over MusicBrainz's recorded release-group searches (`nine inch nails the slip` and `nine inch
 * nails`), so its score, its limit and its rows are what the app runs; each cover is one stand-in
 * image. Anything else it finds nothing for. The stand-in medium (`standInMedia.ts`) answers an album's
 * request with a choice of two releases.
 *
 * `keepEveryTrack` makes the recorded album one whose every track is a song kept from YouTube Music,
 * matched on MusicBrainz to one release group, as M3.keep files them: its page then offers the album's
 * lossless copy. The songs are kept by a stand-in person, not the one who signs in.
 *
 * Test doubles, for the browser tests only: the image holds none (`recorded.ts` says why).
 */
import { readFileSync } from 'node:fs';
import type { MediaRef } from '@auralis/schema';
import type { Recording } from '../src/adapters/http/recording.js';
import { replayFetch } from '../src/adapters/http/replay.js';
import { MusicBrainzClient, MUSICBRAINZ_USER_AGENT } from '../src/adapters/musicbrainz/client.js';
import { albumTracks, indexedRow } from '../src/libraryIndex/store.js';
import { type AlbumCatalogue, albumCatalogue } from '../src/requests/albums/catalogue.js';
import type { SongMatch } from '../src/requests/songs/match.js';
import { openDatabase } from '../src/store/connection.js';
import { createRequest, saveRequest } from '../src/store/requests.js';
import { upsertUser } from '../src/store/users.js';

/** The release group the kept album's songs were matched to: a stand-in, no real album's. */
export const KEPT_GROUP = '00000000-0000-4000-8000-00000000a1b0';

const KEPT_ARTIST = '00000000-0000-4000-8000-00000000a1a0';

const SEARCHES = ['rg-search-slip', 'rg-search-nin'];

export function standInAlbums(recordings: Recording[], art: string): AlbumCatalogue {
  const musicBrainz = new MusicBrainzClient({
    baseUrl: 'https://musicbrainz.org',
    fetch: replayFetch(recordings.filter(({ call }) => SEARCHES.includes(call))),
    userAgent: MUSICBRAINZ_USER_AGENT,
  });
  return albumCatalogue({
    musicBrainz: {
      searchReleaseGroups: (q) =>
        musicBrainz.searchReleaseGroups(q).catch(() => ({ count: 0, releaseGroups: [] })),
    },
    coverArt: {
      groupFront: async () => ({ mime: 'image/jpeg', bytes: readFileSync(art) }),
    },
    now: Date.now,
    log: { error: () => undefined },
  });
}

/** Every track of `album` in the index at `file`, kept from YouTube Music by a stand-in person. */
export function keepEveryTrack(file: string, album: MediaRef): void {
  const db = openDatabase(file);
  try {
    const row = indexedRow(db, album.source, album.id);
    if (row === undefined) throw new Error(`no album ${album.id} in the index`);
    const artist = row.creators[0]?.name ?? 'Unknown';
    const keeper = upsertUser(db, { username: 'stand-in-keeper', role: 'member' });
    const tracks = albumTracks(db, row.id);
    tracks.forEach((track, i) => {
      const youtubeMusicId = `standin${String(i).padStart(4, '0')}`;
      const match: SongMatch = {
        source: 'MusicBrainz',
        by: 'release',
        title: track.title,
        artist,
        artists: [{ name: artist, id: KEPT_ARTIST }],
        album: row.title,
        albumArtist: artist,
        albumArtists: [{ name: artist, id: KEPT_ARTIST }],
        trackNumber: i + 1,
        trackTotal: tracks.length,
        discNumber: 1,
        discTotal: 1,
        date: null,
        originalDate: null,
        recordingId: `${KEPT_GROUP.slice(0, -4)}${String(i).padStart(4, '0')}`,
        releaseTrackId: `${KEPT_GROUP.slice(0, -4)}${String(i + 5000).padStart(4, '0')}`,
        releaseId: KEPT_GROUP,
        releaseGroupId: KEPT_GROUP,
        hasFrontCover: false,
      };
      const { request } = createRequest(
        db,
        keeper.id,
        {
          medium: 'song',
          target: { title: track.title, creator: artist, ids: { youtubeMusicId } },
        },
        Date.now(),
      );
      saveRequest(
        db,
        request.id,
        {
          state: { status: 'inLibrary' },
          release: {
            id: youtubeMusicId,
            title: track.title,
            source: 'YouTube Music',
            size: 1_000_000,
            details: { youtubeMusicId, match },
          },
          result: { source: 'jellyfin', id: track.id },
        },
        Date.now(),
      );
    });
  } finally {
    db.close();
  }
}
