/**
 * Replacing kept songs once their album is in: the import's second phase, after the album's own
 * tracks are indexed.
 *
 * 1. **Find.** Arrived song requests matched to this release group on MusicBrainz, and those kept by
 *    YouTube Music's names alone whose album, first artist and title fold equal to the album's.
 * 2. **Pair** each with one of the album's tracks: by the recording (`MUSICBRAINZ_TRACKID`, which
 *    Jellyfin gives as `MusicBrainzRecording`), else by title and a length within 4 s, and find
 *    its kept file: the one whose Opus tags carry its request's `YOUTUBE_MUSIC_ID`. A kept song
 *    with no pair stays as it is, and so does one with no such file: its keep was answered by a
 *    household file, a track the household still has, so nothing of it moves.
 * 3. **Carry each person's state** in Jellyfin, with their own token: the new track takes either's
 *    favourite and played mark, the larger play count and the later last play. The larger, not the
 *    sum, so it is right whether or not Jellyfin carried any of it over by itself. A Jellyfin user
 *    with no Auralis account keeps nothing; how many there are is logged.
 * 4. **Move Auralis's references** (`store/refs.ts`) from the old track to the new, and from the old
 *    album to the new where every track of the old one is replaced, in one transaction. The song's
 *    request then names the new track, so the song plays the lossless file; everyone on it has the
 *    album claimed as added.
 * 5. **Delete the kept file**, only when its Opus tags still carry its request's `YOUTUBE_MUSIC_ID`.
 *    Then each folder the
 *    keep made, deepest first, only while what is left is Jellyfin's own (`*.nfo`, `folder.*`,
 *    `backdrop*.*`, `logo.*` and the like) or the keep's `cover.jpg`.
 * 6. **Tell Jellyfin** in one call: each deleted file and folder `Deleted`. Until Jellyfin no longer
 *    lists a deleted track the phase is `waiting`; then each old album is indexed again, or leaves
 *    the index when Jellyfin no longer has it.
 *
 * Each step is noted on the album request's handle once done, and each path before it is deleted,
 * so a repeat of the key goes on where the last try stopped.
 */
import { lstat, readdir, rm, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { AdapterError } from '../../adapters/http/fetch.js';
import { stepFailure } from '../../adapters/http/unavailable.js';
import type { JellyfinClient } from '../../adapters/jellyfin/client.js';
import type { UserItemData } from '../../adapters/jellyfin/schemas.js';
import type { JobLog } from '../../jobs/schedule.js';
import { indexOneJellyfinAlbum } from '../../libraryIndex/job.js';
import {
  albumTracks,
  emptyCounts,
  indexedRow,
  removeItem,
  type StoredRow,
} from '../../libraryIndex/store.js';
import { everyAlbumFolder } from '../../music/folders.js';
import { searchFold, titleKey } from '../../text/fold.js';
import { addClaim } from '../../store/claims.js';
import type { Db } from '../../store/connection.js';
import { moveRefs, type RefMove } from '../../store/refs.js';
import {
  getRequest,
  noteHandle,
  peopleOn,
  requestsInLibrary,
  type StoredRequest,
} from '../../store/requests.js';
import { linkedAccounts } from '../../store/upstreamLinks.js';
import { SongHandle } from '../songs/download.js';
import { findPlaced, keptIdOf, songPlace } from '../songs/place.js';
import type { SongMatch } from '../songs/match.js';
import { SongDetails } from '../songs/search.js';
import { SongMatchSchema } from '../songs/tags.js';

/** How far a kept song's length may be from its track's, as a keep matches (M3.keep). */
const LENGTH_TOLERANCE_SECONDS = 4;

/** What Jellyfin writes into a music folder of its own, and the keep's cover. */
const LEFT_BY_JELLYFIN = [
  /\.nfo$/i,
  /^folder\.[^.]+$/i,
  /^backdrop[^.]*\.[^.]+$/i,
  /^logo\.[^.]+$/i,
  /^banner\.[^.]+$/i,
  /^disc\.[^.]+$/i,
  /^clearart\.[^.]+$/i,
  /^thumb\.[^.]+$/i,
  /^landscape\.[^.]+$/i,
  /^cover\.jpg$/i,
];

/** A person with a linked Jellyfin account, and a client acting as them. */
export interface JellyfinPerson {
  userId: string;
  jellyfinUserId: string;
  jellyfin: Pick<JellyfinClient, 'getUserData' | 'setUserData'>;
}

/** Everyone linked on Jellyfin, each with their own client; one with none is left out. */
export function jellyfinPeople(
  db: Db,
  clientFor: (userId: string) => JellyfinPerson['jellyfin'] | null,
): JellyfinPerson[] {
  return linkedAccounts(db, 'jellyfin').flatMap(({ userId, upstreamUserId }) => {
    const jellyfin = clientFor(userId);
    return jellyfin === null ? [] : [{ userId, jellyfinUserId: upstreamUserId, jellyfin }];
  });
}

export interface ReplaceDeps {
  db: Db;
  /** `MEDIA_DIR/Music` as this server sees it. */
  musicDir: string;
  /** A path under Music as Jellyfin sees it. */
  jellyfinPath: (relPath: string) => string;
  libraryId: string;
  jellyfin: Pick<JellyfinClient, 'findAlbum' | 'getAlbumTracks' | 'reportDeleted' | 'userIds'>;
  people: () => JellyfinPerson[];
  now: () => number;
  log: JobLog;
}

export interface ReplaceInput {
  /** The album's request, whose handle the steps are noted on. */
  requestId: string;
  releaseGroupId: string;
  albumId: string;
  /** The album's tracks just placed, ours and the household's, by their Jellyfin ids. */
  trackIds: readonly string[];
}

const Pair = z
  .object({
    /** The song's request. */
    request: z.string(),
    youtubeMusicId: z.string(),
    from: z.string(),
    /** The kept track's album, as the index had it when paired. */
    fromAlbum: z.string().nullable(),
    to: z.string(),
    /** The kept file, as found when paired. */
    file: z.string(),
  })
  .strict();
type Pair = z.infer<typeof Pair>;

export const Replacing = z
  .object({
    pairs: z.array(Pair),
    carried: z.literal(true).optional(),
    moved: z.literal(true).optional(),
    deleting: z.array(z.string()).optional(),
    deleted: z.array(z.string()).optional(),
    reported: z.literal(true).optional(),
  })
  .strict();
type Replacing = z.infer<typeof Replacing>;

const jellyfinCall = async <T>(call: () => Promise<T>): Promise<T> => {
  try {
    return await call();
  } catch (error) {
    throw stepFailure('jellyfin', error);
  }
};

const fold = (text: string) => searchFold(text).trim();

/** A song request's match and handle, or null for one that is not a kept song's. */
export function keptSong(request: StoredRequest) {
  const details = SongDetails.safeParse(request.release?.details);
  if (!details.success) return null;
  const match = SongMatchSchema.safeParse(details.data.match);
  if (!match.success) return null;
  const handle = SongHandle.safeParse(request.handle);
  return {
    youtubeMusicId: details.data.youtubeMusicId,
    match: match.data,
    made: handle.success ? (handle.data.made ?? []) : [],
  };
}

/** The kept song's own file, carrying its id; null when a household file answered its keep. */
async function keptFileOf(deps: ReplaceDeps, match: SongMatch, youtubeMusicId: string) {
  const place = songPlace(match);
  for (const at of await everyAlbumFolder(deps.musicDir, place)) {
    const found = await findPlaced(deps.musicDir, at, place, youtubeMusicId);
    if (found !== null) return found.relPath;
  }
  return null;
}

/** Each kept song of this album with its own file, and the album's track it becomes. */
async function pairsOf(deps: ReplaceDeps, input: ReplaceInput): Promise<Pair[]> {
  const { db } = deps;
  const ours = new Set(input.trackIds);
  const tracks = albumTracks(db, input.albumId).filter((row) => ours.has(row.id));
  const album = indexedRow(db, 'jellyfin', input.albumId);
  const albumTitle = album === undefined ? null : fold(album.title);
  const albumArtist = album?.creators[0]?.name;
  const pairs: Pair[] = [];
  for (const request of requestsInLibrary(db, 'song', deps.log)) {
    const kept = keptSong(request);
    const result = request.result;
    if (kept === null || result?.source !== 'jellyfin' || ours.has(result.id)) continue;
    const { match } = kept;
    const old: StoredRow | undefined = indexedRow(db, 'jellyfin', result.id);
    const sameLength = (row: StoredRow) =>
      old?.duration != null &&
      row.duration != null &&
      Math.abs(old.duration - row.duration) <= LENGTH_TOLERANCE_SECONDS;
    const byTitle = () =>
      tracks.find((row) => titleKey(row.title) === titleKey(match.title) && sameLength(row));
    let to: StoredRow | undefined;
    if (match.source === 'MusicBrainz') {
      if (match.releaseGroupId !== input.releaseGroupId) continue;
      to = tracks.find((row) => row.ids.musicbrainz_recording === match.recordingId) ?? byTitle();
    } else {
      const artist = match.artists[0]?.name ?? match.artist;
      if (albumTitle === null || albumArtist === undefined) continue;
      if (fold(match.album) !== albumTitle || fold(artist) !== fold(albumArtist)) continue;
      to = byTitle();
    }
    if (to === undefined) continue;
    const file = await keptFileOf(deps, match, kept.youtubeMusicId);
    if (file === null) continue;
    pairs.push({
      request: request.id,
      youtubeMusicId: kept.youtubeMusicId,
      from: result.id,
      fromAlbum: old?.parentId ?? null,
      to: to.id,
      file,
    });
  }
  return pairs;
}

const later = (a?: string | null, b?: string | null) => {
  if (a == null) return b ?? null;
  if (b == null) return a;
  return Date.parse(b) > Date.parse(a) ? b : a;
};

/** The new track's state for a person: the old one's and its own, taken together. */
function merged(old: UserItemData, now: UserItemData) {
  return {
    PlaybackPositionTicks: now.PlaybackPositionTicks,
    PlayCount: Math.max(old.PlayCount, now.PlayCount),
    IsFavorite: old.IsFavorite || now.IsFavorite,
    Played: old.Played || now.Played,
    LastPlayedDate: later(old.LastPlayedDate, now.LastPlayedDate),
  };
}

const isGone = (error: unknown) =>
  error instanceof AdapterError && error.kind === 'status' && error.status === 404;

/** Step 3: each person's favourite, plays and last play, carried onto the new tracks. */
async function carry(deps: ReplaceDeps, pairs: readonly Pair[]): Promise<void> {
  const people = deps.people();
  for (const person of people) {
    for (const pair of pairs) {
      let old: UserItemData;
      try {
        old = await person.jellyfin.getUserData(pair.from);
      } catch (error) {
        if (isGone(error)) continue;
        throw stepFailure('jellyfin', error);
      }
      const now = await jellyfinCall(() => person.jellyfin.getUserData(pair.to));
      const next = merged(old, now);
      const same =
        next.PlayCount === now.PlayCount &&
        next.IsFavorite === now.IsFavorite &&
        next.Played === now.Played &&
        next.LastPlayedDate === (now.LastPlayedDate ?? null);
      if (!same) await jellyfinCall(() => person.jellyfin.setUserData(pair.to, next));
    }
  }
  try {
    const linked = new Set(people.map((person) => person.jellyfinUserId));
    const left = (await deps.jellyfin.userIds()).filter((id) => !linked.has(id)).length;
    if (left > 0) {
      deps.log.error(
        { users: left },
        'Jellyfin users with no Auralis account kept their state on the replaced songs only',
      );
    }
  } catch (error) {
    deps.log.error({ reason: (error as Error).message }, 'Jellyfin’s users could not be counted');
  }
}

/** Step 4: Auralis's references to each kept song and its album, moved, and the album claimed. */
function move(deps: ReplaceDeps, input: ReplaceInput, pairs: readonly Pair[]): RefMove[] {
  const { db } = deps;
  const jellyfin = (id: string) => ({ source: 'jellyfin' as const, id });
  const moves: RefMove[] = pairs.map((pair) => ({
    from: jellyfin(pair.from),
    to: jellyfin(pair.to),
  }));
  const replaced = new Set(pairs.map((pair) => pair.from));
  const oldAlbums = new Set(
    pairs.flatMap((pair) => (pair.fromAlbum === null ? [] : [pair.fromAlbum])),
  );
  for (const album of oldAlbums) {
    if (album === input.albumId) continue;
    const tracks = albumTracks(db, album);
    if (tracks.length > 0 && tracks.every((track) => replaced.has(track.id))) {
      moves.push({ from: jellyfin(album), to: jellyfin(input.albumId) });
    }
  }
  moveRefs(db, moves);
  for (const pair of pairs) {
    for (const userId of peopleOn(db, pair.request)) {
      addClaim(db, userId, jellyfin(input.albumId), 'added', deps.now());
    }
  }
  return moves;
}

/** The names in a folder when every one is a file Jellyfin leaves; null when anything else is. */
async function onlyJellyfins(path: string): Promise<string[] | null> {
  const entries = await readdir(path, { withFileTypes: true });
  const left = entries.every(
    (entry) => entry.isFile() && LEFT_BY_JELLYFIN.some((name) => name.test(entry.name)),
  );
  return left ? entries.map((entry) => entry.name) : null;
}

const exists = (path: string) =>
  lstat(path).then(
    () => true,
    () => false,
  );

export function replaceKept(deps: ReplaceDeps) {
  const { db } = deps;

  /** Step 5: each kept file of ours, then each folder its keep made that holds nothing else. */
  const remove = async (replacing: Replacing, note: (change: Partial<Replacing>) => void) => {
    const deleting = [...(replacing.deleting ?? [])];
    const noteDeleting = (relPath: string) => {
      if (deleting.includes(relPath)) return;
      deleting.push(relPath);
      note({ deleting: [...deleting] });
    };
    const { pairs } = replacing;
    const folders = new Set<string>();
    for (const pair of pairs) {
      const request = getRequest(db, pair.request);
      const kept = request === null ? null : keptSong(request);
      for (const folder of kept?.made ?? []) folders.add(folder);
    }
    for (const pair of pairs) {
      const path = join(deps.musicDir, pair.file);
      if ((await keptIdOf(path)) !== pair.youtubeMusicId) continue;
      noteDeleting(pair.file);
      await rm(path);
    }
    for (const folder of [...folders].sort((a, b) => b.length - a.length)) {
      const path = join(deps.musicDir, folder);
      if (!(await exists(path))) continue;
      const names = await onlyJellyfins(path);
      if (names === null) continue;
      noteDeleting(folder);
      for (const name of names) await rm(join(path, name));
      await rmdir(path);
    }
    const deleted: string[] = [];
    for (const relPath of deleting) {
      if (!(await exists(join(deps.musicDir, relPath)))) deleted.push(relPath);
    }
    note({ deleted });
    return { deleted };
  };

  /** Step 6: each old album indexed again once Jellyfin lists none of the deleted tracks. */
  const reindex = async (pairs: readonly Pair[], deleted: readonly string[]) => {
    const gone = pairs.filter((pair) => deleted.includes(pair.file));
    const goneIds = new Set(gone.map((pair) => pair.from));
    const albums = new Set(
      gone.flatMap((pair) => (pair.fromAlbum === null ? [] : [pair.fromAlbum])),
    );
    for (const album of albums) {
      const there = await jellyfinCall(() => deps.jellyfin.findAlbum(album));
      if (there === undefined) {
        removeItem(db, 'jellyfin', album, emptyCounts());
        continue;
      }
      const tracks = await jellyfinCall(() => deps.jellyfin.getAlbumTracks(album));
      if (tracks.some((track) => goneIds.has(track.Id))) return 'waiting';
      await jellyfinCall(() =>
        indexOneJellyfinAlbum(db, deps.jellyfin, album, deps.libraryId, deps.now()),
      );
    }
    return 'done';
  };

  return async (input: ReplaceInput): Promise<'waiting' | 'done'> => {
    const notes = { ...(getRequest(db, input.requestId)?.handle ?? {}) };
    const noted = Replacing.safeParse(notes.replacing);
    const replacing: Replacing = noted.success ? noted.data : { pairs: await pairsOf(deps, input) };
    const note = (change: Partial<Replacing>) => {
      Object.assign(replacing, change);
      notes.replacing = replacing;
      noteHandle(db, input.requestId, notes);
    };
    if (!noted.success) note({});
    if (replacing.pairs.length === 0) return 'done';

    if (replacing.carried !== true) {
      await carry(deps, replacing.pairs);
      note({ carried: true });
    }
    if (replacing.moved !== true) {
      db.transaction(() => {
        move(deps, input, replacing.pairs);
        note({ moved: true });
      })();
    }
    let { deleted } = replacing;
    if (deleted === undefined) ({ deleted } = await remove(replacing, note));
    if (deleted.length > 0 && replacing.reported !== true) {
      const paths = deleted.map(deps.jellyfinPath);
      await jellyfinCall(() => deps.jellyfin.reportDeleted(paths));
      note({ reported: true });
    }
    return reindex(replacing.pairs, deleted);
  };
}
