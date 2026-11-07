/**
 * What outside songs a search or a radio names. A search, never a suggestion, asks YouTube Music,
 * keeps the answer five minutes, and waits for it only up to the limit: anything going wrong is no
 * rows, never a failed search. Every song named is remembered, which is what lets it play; one that
 * is no song (too long, or of no length) is not named at all. A song the household owns is told by
 * the words of its title and its artists: on Search it is left out, and on a radio it plays from
 * Jellyfin, so one song is never listed twice. Words in brackets, and a dash's edition, do not count.
 */
import type { MediaRef, SearchSong } from '@auralis/schema';
import type { YtSong } from '../adapters/ytmusic/client.js';
import { indexedRow } from '../libraryIndex/store.js';
import { artOf } from '../routes/art.js';
import type { Db } from '../store/connection.js';
import { rememberTracks } from '../store/streamedTracks.js';
import { searchFold } from '../text/fold.js';

const SEARCH_LIMIT_MS = 3_000;
const KEPT_MS = 5 * 60_000;
const MOST_KEPT = 200;
/** The longest song that plays; anything longer is not a song. */
export const MOST_SONG_SECONDS = 3 * 60 * 60;

const EDITION = /\s+-\s+.*(?:remaster|version|edit|mono|stereo|mix|live).*$/;

const titleKey = (title: string) =>
  searchFold(title)
    .replace(/\s*[([{][^)\]}]*[)\]}]/g, '')
    .replace(EDITION, '')
    .trim();

interface OwnedTrack {
  id: string;
  artists: string[];
}

/** The tracks the household holds, by the words of their title. */
export type OwnedTracks = Map<string, OwnedTrack[]>;

export function ownedTracks(db: Db): OwnedTracks {
  const rows = db
    .prepare(
      `SELECT upstream_id AS id, title, creators FROM index_items
       WHERE source = 'jellyfin' AND kind = 'track'`,
    )
    .all() as { id: string; title: string; creators: string }[];
  const owned: OwnedTracks = new Map();
  for (const { id, title, creators } of rows) {
    const key = titleKey(title);
    const names = (JSON.parse(creators) as { name: string }[]).map(({ name }) => searchFold(name));
    owned.set(key, [...(owned.get(key) ?? []), { id, artists: names }]);
  }
  return owned;
}

/** Whether any name on one side is, or holds, a name on the other. No names on a side is not sure. */
function sameArtists(ours: readonly string[], theirs: readonly string[]): boolean {
  if (ours.length === 0 || theirs.length === 0) return true;
  return ours.some((a) => theirs.some((b) => a === b || a.includes(b) || b.includes(a)));
}

/** The Jellyfin track that is this song, when the household holds one. */
export function ownedTrack(owned: OwnedTracks, song: Pick<YtSong, 'title' | 'artists'>) {
  const names = song.artists.map(searchFold);
  return owned.get(titleKey(song.title))?.find((t) => sameArtists(t.artists, names))?.id ?? null;
}

/** Search's rows: the songs the household does not hold, each once. */
export function songRows(db: Db, songs: readonly YtSong[]): SearchSong[] {
  const owned = ownedTracks(db);
  const seen = new Set<string>();
  return songs.flatMap((song): SearchSong[] => {
    const once = `${titleKey(song.title)}\n${song.artists.map(searchFold).join()}`;
    if (seen.has(once) || ownedTrack(owned, song) !== null) return [];
    seen.add(once);
    const ref: MediaRef = { source: 'ytmusic', id: song.id };
    return [
      {
        ref,
        title: song.title,
        artists: song.artists,
        album: song.album,
        duration: song.duration,
        art: artOf(db, ref),
        availability: { kind: 'streamable' },
      },
    ];
  });
}

export interface SongSource {
  search(query: string): Promise<YtSong[]>;
  radio(id: string): Promise<YtSong[]>;
}

export interface SongCatalogueDeps {
  client: SongSource;
  db: Db;
  now: () => number;
  log: { warn: (details: Record<string, unknown>, message: string) => void };
  limitMs?: number;
}

const playable = (song: YtSong) => song.duration > 0 && song.duration <= MOST_SONG_SECONDS;

export class SongCatalogue {
  private readonly kept = new Map<string, { at: number; songs: YtSong[] }>();
  private readonly running = new Map<string, Promise<YtSong[]>>();

  constructor(private readonly deps: SongCatalogueDeps) {}

  /** The songs this search finds; none past the limit, on any failure, or once `gone` aborts. */
  async search(q: string, gone?: AbortSignal): Promise<YtSong[]> {
    const key = searchFold(q);
    const kept = this.kept.get(key);
    if (kept !== undefined && this.deps.now() - kept.at < KEPT_MS) return kept.songs;
    let timer: NodeJS.Timeout | undefined;
    let leave: (() => void) | undefined;
    try {
      return await Promise.race([
        this.asked(key, q),
        new Promise<YtSong[]>((none) => {
          timer = setTimeout(() => none([]), this.deps.limitMs ?? SEARCH_LIMIT_MS);
          leave = () => none([]);
          if (gone?.aborted === true) leave();
          else gone?.addEventListener('abort', leave, { once: true });
        }),
      ]);
    } catch (error) {
      const reason = error instanceof Error ? error.name : 'unknown';
      this.deps.log.warn({ reason }, 'no song rows');
      return [];
    } finally {
      clearTimeout(timer);
      if (leave !== undefined) gone?.removeEventListener('abort', leave);
    }
  }

  /** One upstream ask per search at a time. A late answer is still kept for the next one. */
  private asked(key: string, q: string): Promise<YtSong[]> {
    const running = this.running.get(key);
    if (running !== undefined) return running;
    const ask = this.deps.client
      .search(q)
      .then((found) => {
        const songs = found.filter(playable);
        rememberTracks(this.deps.db, songs, this.deps.now());
        this.kept.delete(key);
        this.kept.set(key, { at: this.deps.now(), songs });
        const oldest = this.kept.keys().next().value;
        if (this.kept.size > MOST_KEPT && oldest !== undefined) this.kept.delete(oldest);
        return songs;
      })
      .finally(() => this.running.delete(key));
    // A search that stopped waiting has nothing left to tell of this failure.
    ask.catch(() => undefined);
    this.running.set(key, ask);
    return ask;
  }

  /** The radio after a song, each remembered, and a song the household holds as its Jellyfin track. */
  async radio(id: string): Promise<MediaRef[]> {
    const found = (await this.deps.client.radio(id)).filter(playable);
    rememberTracks(this.deps.db, found, this.deps.now());
    const owned = ownedTracks(this.deps.db);
    return found.map((song): MediaRef => {
      const track = ownedTrack(owned, song);
      return track === null
        ? { source: 'ytmusic', id: song.id }
        : { source: 'jellyfin', id: track };
    });
  }

  /** The song on YouTube Music that is this Jellyfin track, or null: its radio is what can follow. */
  async seedFor(jellyfinId: string): Promise<string | null> {
    const { db } = this.deps;
    const held = db
      .prepare('SELECT id FROM streamed_seeds WHERE jellyfin_id = ?')
      .get(jellyfinId) as { id: string } | undefined;
    if (held !== undefined) return held.id;
    const row = indexedRow(db, 'jellyfin', jellyfinId);
    if (row === undefined) return null;
    const artists = row.creators.map(({ name }) => searchFold(name));
    const songs = await this.search(`${row.title} ${row.creators[0]?.name ?? ''}`.trim());
    const seed = songs.find(
      (song) =>
        titleKey(song.title) === titleKey(row.title) &&
        sameArtists(artists, song.artists.map(searchFold)),
    );
    if (seed === undefined) return null;
    db.prepare('INSERT OR REPLACE INTO streamed_seeds (jellyfin_id, id) VALUES (?, ?)').run(
      jellyfinId,
      seed.id,
    );
    return seed.id;
  }
}
