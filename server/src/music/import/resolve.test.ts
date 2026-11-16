import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { type Recording, recordingSchema } from '../../adapters/http/recording.js';
import {
  RECORDED_PLAYLIST,
  replayedSpotify,
  replayedYtMusic,
} from '../../adapters/record-spotify.js';
import type { SpotifyTrack } from '../../adapters/spotify/schemas.js';
import type { YtSong } from '../../adapters/ytmusic/client.js';
import { openDatabase } from '../../store/connection.js';
import { streamedTrack } from '../../store/streamedTracks.js';
import { failedRule, matchSpotifyTrack, nameQuery } from './match.js';
import {
  IMPORT_SEARCH_GAP_MS,
  pacedSearch,
  type Resolved,
  resolveEntries,
  resolveTrack,
} from './resolve.js';

const adapters = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'adapters');
const read = (dir: string): Recording[] =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => recordingSchema.parse(JSON.parse(readFileSync(join(dir, f), 'utf8'))));
const spotifyRecordings = read(join(adapters, 'spotify', 'recordings'));
const ytRecordings = read(join(adapters, 'spotify', 'recordings', 'ytmusic'));

/** What the recorder printed for the recorded playlist. */
const RECORDED_MATCHED = Number(process.env.NEVER ?? NaN);

function setUp() {
  const db = openDatabase(':memory:');
  const queries: string[] = [];
  const yt = replayedYtMusic(ytRecordings);
  const spotify = replayedSpotify(spotifyRecordings);
  const deps = {
    db,
    clock: { now: () => 1_000 },
    track: (id: string) => spotify.track(id),
    search: async (q: string) => {
      queries.push(q);
      return yt.search(q);
    },
  };
  return { db, deps, queries, spotify };
}

async function resolveAll() {
  const set = setUp();
  const playlist = await set.spotify.playlist(RECORDED_PLAYLIST);
  const out: Resolved[] = [];
  for await (const r of resolveEntries(set.deps, playlist.entries)) out.push(r);
  return { ...set, playlist, out };
}

const trackAt = async (position: number): Promise<SpotifyTrack> => {
  const spotify = replayedSpotify(spotifyRecordings);
  const playlist = await spotify.playlist(RECORDED_PLAYLIST);
  const entry = playlist.entries[position]!;
  if (entry.kind !== 'track') throw new Error('not a track');
  return (await spotify.track(entry.id))!;
};

describe('[M3.spotify/a] a recorded public Spotify playlist, resolved on YouTube Music', () => {
  it('[M3.spotify/a] resolves every track to a YouTube Music id or an unmatched entry with its reason and place', async () => {
    const { out, playlist } = await resolveAll();
    expect(out.map((r) => r.position)).toEqual(playlist.entries.map((e) => e.position));
    for (const r of out) {
      if (r.unmatched === null) expect(r.youtubeId).toMatch(/^[\w-]{11}$/);
      else {
        expect(r.unmatched.position).toBe(r.position);
        expect(['noMatch', 'notASong', 'unavailable', 'listFull']).toContain(r.unmatched.reason);
      }
    }
    expect(out.filter((r) => r.unmatched === null)).toHaveLength(RECORDED_MATCHED);
  });

  it('[M3.spotify/a] asks the ISRC only after the name query found no match', async () => {
    const { out, queries, playlist } = await resolveAll();
    const isrc = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;
    for (const [n, q] of queries.entries()) {
      if (isrc.test(q)) expect(isrc.test(queries[n - 1] ?? '')).toBe(false);
    }
    const tracks = playlist.entries.filter((e) => e.kind === 'track').length;
    expect(queries.filter((q) => !isrc.test(q))).toHaveLength(tracks);
    // A track whose name query matched never has its ISRC asked.
    expect(queries.filter((q) => isrc.test(q)).length).toBeLessThanOrEqual(
      out.length - out.filter((r) => r.unmatched === null).length + queries.length - tracks,
    );
  });

  it('[M3.spotify/a] writes each match to streamed_tracks, so it may stream', async () => {
    const { out, db } = await resolveAll();
    for (const r of out) if (r.youtubeId !== null) expect(streamedTrack(db, r.youtubeId)).toBeDefined();
  });

  it('[M3.spotify/a] a track resolved before asks nothing', async () => {
    const { deps, queries } = setUp();
    const track = await trackAt(0);
    const first = await resolveTrack(deps, 'track0', track);
    const asked = queries.length;
    expect(await resolveTrack(deps, 'track0', track)).toEqual(first);
    expect(queries).toHaveLength(asked);
  });

  it('[M3.spotify/a] import searches run one at a time, 2 s apart', async () => {
    const clock = { at: 0, now: () => clock.at, sleep: async (ms: number) => void (clock.at += ms) };
    const starts: number[] = [];
    const search = pacedSearch(async () => {
      starts.push(clock.at);
      clock.at += 300;
      return [];
    }, clock);
    await Promise.all(['a', 'b', 'c'].map((q) => search(q)));
    expect(starts).toEqual([0, 300 + IMPORT_SEARCH_GAP_MS, 2 * (300 + IMPORT_SEARCH_GAP_MS)]);
  });
});

describe('[M3.spotify/a] the match rules, on recorded rows', () => {
  const rowsFor = async (position: number) => {
    const track = await trackAt(position);
    return { track, rows: await replayedYtMusic(ytRecordings).search(nameQuery(track)) };
  };

  it('[M3.spotify/a] a row of another title is not the track', async () => {
    const { track, rows } = await rowsFor(0);
    const row = rows[0]!;
    expect(failedRule(track, { ...row, title: `${row.title} Medley` })).toBe('title');
  });

  it('[M3.spotify/a] a row by no artist of the track is not it, unless it is on its album within 2 s', async () => {
    const { track, rows } = await rowsFor(0);
    const row: YtSong = { ...rows[0]!, artists: ['Someone Else'] };
    const onAlbum = { ...row, album: track.album, duration: Math.round(track.durationMs / 1000) };
    expect(failedRule(track, { ...row, album: 'Another Album' })).toBe('artist');
    expect(failedRule(track, onAlbum)).toBe(null);
    expect(failedRule(track, { ...onAlbum, duration: onAlbum.duration + 3 })).toBe('artist');
  });

  it('[M3.spotify/a] a row more than 4 s longer or shorter is not the track', async () => {
    const { track, rows } = await rowsFor(0);
    const exact = { ...rows[0]!, duration: Math.round(track.durationMs / 1000) };
    expect(failedRule(track, { ...exact, duration: exact.duration + 3 })).toBe(null);
    expect(failedRule(track, { ...exact, duration: exact.duration + 6 })).toBe('length');
  });

  it("[M3.spotify/a] of the passing rows, the track's album wins, then ATV, then the nearer length, then YouTube Music's order", async () => {
    const { track, rows } = await rowsFor(0);
    const base = { ...rows[0]!, duration: Math.round(track.durationMs / 1000) };
    const other = { ...base, id: 'otherAlbum0', album: 'Greatest Hits', type: 'ATV' as const };
    const same = { ...base, id: 'sameAlbum00', album: track.album, type: 'OMV' as const };
    expect(matchSpotifyTrack(track, [other, same]).match?.id).toBe('sameAlbum00');
    const omv = { ...other, id: 'omvOMVomv00', type: 'OMV' as const };
    expect(matchSpotifyTrack(track, [omv, other]).match?.id).toBe('otherAlbum0');
    const far = { ...other, id: 'farFARfar00', duration: other.duration + 3 };
    expect(matchSpotifyTrack(track, [far, other]).match?.id).toBe('otherAlbum0');
    const twin = { ...other, id: 'twinTWIN000' };
    expect(matchSpotifyTrack(track, [other, twin]).match?.id).toBe('otherAlbum0');
  });

  it('[M3.spotify/a] with no row passing, the nearest row and the rule it failed are named', async () => {
    const { track, rows } = await rowsFor(0);
    const wrong = rows.map((r) => ({ ...r, duration: r.duration + 60 }));
    const found = matchSpotifyTrack(track, wrong);
    expect(found.match).toBe(null);
    expect(found.match === null && found.near?.failed).toBe('length');
  });
});
