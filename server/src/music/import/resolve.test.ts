import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
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
import { titleKey } from '../../text/fold.js';
import { failedRule, matchSpotifyTrack, nameQuery, withinLength } from './match.js';
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

/** The recorded playlist (All Out 80s, 150 places) under the rules: 145 matched. */
const RECORDED_MATCHED = 145;
/**
 * The places left unmatched, each `noMatch`: Bryan Adams' re-recorded `Classic Version` rows for
 * Heaven, Summer Of '69 and Run To You; Caribbean Queen's single edit (222 s for 244 s); and All
 * Night Long's single version, of which only the album and 12" lengths are listed.
 */
const RECORDED_UNMATCHED = [15, 28, 55, 63, 129];
/** The YouTube Music id each place of the recorded playlist resolves to, null where unmatched. */
const RECORDED_PICKS = z
  .array(z.string().nullable())
  .parse(
    JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'recorded-picks.json'), 'utf8'),
    ),
  );

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
    expect(out).toHaveLength(150);
    expect(out.filter((r) => r.unmatched === null)).toHaveLength(RECORDED_MATCHED);
  });

  it('[M3.spotify/a] gives each recorded track the YouTube Music id its rules pick', async () => {
    const { out } = await resolveAll();
    expect(out.map((r) => r.youtubeId)).toEqual(RECORDED_PICKS);
    expect(RECORDED_PICKS.flatMap((id, n) => (id === null ? [n] : []))).toEqual(RECORDED_UNMATCHED);
  });

  it('[M3.spotify/a] reports the unmatched ones with what Spotify names and the nearest row', async () => {
    const { out } = await resolveAll();
    const unmatched = out.flatMap((r) => (r.unmatched === null ? [] : [r.unmatched]));
    expect(unmatched.map((u) => u.position)).toEqual(RECORDED_UNMATCHED);
    for (const u of unmatched) {
      expect(u.reason).toBe('noMatch');
      expect(u.title).not.toBe(null);
      expect(u.artists.length).toBeGreaterThan(0);
      expect(u.durationMs).toBeGreaterThan(0);
      expect(['title', 'artist', 'length']).toContain(u.near?.failed);
    }
  });

  it('[M3.spotify/a] asks the ISRC only after the name query found no match, or only a remaster', async () => {
    const { queries, playlist, spotify } = await resolveAll();
    const yt = replayedYtMusic(ytRecordings);
    const expected: string[] = [];
    for (const entry of playlist.entries) {
      if (entry.kind !== 'track') continue;
      const track = (await spotify.track(entry.id))!;
      const byName = matchSpotifyTrack(track, await yt.search(nameQuery(track)));
      expected.push(nameQuery(track));
      const close = byName.match !== null && withinLength(track, byName.match);
      if (!close && track.isrc !== null) expected.push(track.isrc);
    }
    expect(queries).toEqual(expected);
    expect(queries.length).toBeGreaterThan(playlist.entries.length);
  });

  it("[M3.spotify/a] the ISRC's row within 4 s wins over the name query's remaster", async () => {
    // Your Love: the name query's row is Play Deep at 217 s, the ISRC's is Super Hits at 222 s.
    const { deps } = setUp();
    const track = await trackAt(71);
    const byName = matchSpotifyTrack(
      track,
      await replayedYtMusic(ytRecordings).search(nameQuery(track)),
    );
    expect(byName.match?.duration).toBe(217);
    const { youtubeId } = await resolveTrack(deps, 'track71', track);
    expect(youtubeId).not.toBe(byName.match?.id);
    expect(streamedTrack(deps.db, youtubeId!)?.album).toBe(track.album);
  });

  it('[M3.spotify/a] writes each match to streamed_tracks, so it may stream', async () => {
    const { out, db } = await resolveAll();
    for (const r of out)
      if (r.youtubeId !== null) expect(streamedTrack(db, r.youtubeId)).toBeDefined();
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
    const clock = {
      at: 0,
      now: () => clock.at,
      sleep: async (ms: number) => void (clock.at += ms),
    };
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

  it("[M3.spotify/a] picks the track's own album over a best-of that YouTube Music lists first", async () => {
    // Edge of Seventeen (Bella Donna over Timespace) and Lovesong (Disintegration over Galore).
    for (const position of [44, 127]) {
      const { track, rows } = await rowsFor(position);
      expect(failedRule(track, rows[0]!)).toBe(null);
      expect(titleKey(rows[0]!.album ?? '')).not.toBe(titleKey(track.album!));
      const { match } = matchSpotifyTrack(track, rows);
      expect(match).not.toBe(null);
      expect(titleKey(match!.album!)).toBe(titleKey(track.album!));
    }
  });

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

  it('[M3.spotify/a] a title with a soundtrack note is the same title as its bracketed row', async () => {
    // Holding Out for a Hero, Take My Breath Away, Danger Zone.
    for (const position of [12, 91, 94]) {
      const { track, rows } = await rowsFor(position);
      expect(track.title).toMatch(/ - .*from /i);
      expect(rows.some((row) => failedRule(track, row) === null)).toBe(true);
    }
  });

  it('[M3.spotify/a] by the same first artist and title, a remaster may be up to 15 s or 8% longer or shorter', async () => {
    // Dancing In the Dark (240 s for 245.3 s), Gloria (296 s for 289.9 s).
    for (const position of [32, 116]) {
      const { track, rows } = await rowsFor(position);
      expect(Math.abs(rows[0]!.duration * 1000 - track.durationMs)).toBeGreaterThan(4_000);
      expect(failedRule(track, rows[0]!)).toBe(null);
    }
    const { track, rows } = await rowsFor(32);
    const at = (seconds: number) => ({
      ...rows[0]!,
      duration: Math.round(track.durationMs / 1000) + seconds,
    });
    expect(failedRule(track, at(15))).toBe(null);
    expect(failedRule(track, at(-15))).toBe(null);
    expect(failedRule(track, at(21))).toBe('length');
    expect(failedRule(track, at(19))).toBe(null); // 8% of 245.3 s is 19.6 s
    expect(failedRule(track, { ...at(10), artists: ['Patti Scialfa', 'Bruce Springsteen'] })).toBe(
      'length',
    );
  });

  it('[M3.spotify/a] a row named as another take keeps the 4 s rule', async () => {
    // Heaven (Classic Version), Bryan Adams' re-recording: 264 s for 243.4 s.
    const { track, rows } = await rowsFor(15);
    const classic = rows.find((row) => /classic version/i.test(row.title))!;
    expect(failedRule(track, classic)).toBe('length');
    const near = { ...classic, duration: Math.round(track.durationMs / 1000) + 10 };
    expect(failedRule(track, near)).toBe('length');
    expect(failedRule(track, { ...near, title: `${track.title} (Live)` })).toBe('length');
    expect(failedRule(track, { ...near, title: `${track.title} (2012 Remaster)` })).toBe(null);
  });

  it("[M3.spotify/a] a row within 4 s ranks over a remaster further off, even on the track's album", async () => {
    const { track, rows } = await rowsFor(32);
    const exact = Math.round(track.durationMs / 1000);
    const loose = { ...rows[0]!, id: 'looseLOOSE0', album: track.album, duration: exact + 10 };
    const close = { ...rows[0]!, id: 'closeCLOSE0', album: 'Greatest Hits', duration: exact + 1 };
    expect(matchSpotifyTrack(track, [loose, close]).match?.id).toBe('closeCLOSE0');
  });

  it('[M3.spotify/a] a row more than 4 s longer or shorter is not the track', async () => {
    const { track, rows } = await rowsFor(0);
    const exact = { ...rows[0]!, duration: Math.round(track.durationMs / 1000) };
    expect(failedRule(track, { ...exact, duration: exact.duration + 3 })).toBe(null);
    expect(
      failedRule(track, {
        ...exact,
        artists: ['Someone Else', ...exact.artists],
        duration: exact.duration + 6,
      }),
    ).toBe('length');
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
