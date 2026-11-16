/**
 * The import job: one Spotify import at a time across the server, the rest waiting in
 * `list_imports`, oldest started first. It reads the playlist's order, then resolves each entry
 * from the import's `done` onwards (music/import/resolve.ts), writing each song to the end of the
 * list as it matches, so the list fills in Spotify's order while it runs and a restart goes on from
 * where it was (the caches make what came before cheap).
 *
 * The reader's refusals stop the import, never fail the server: `playlist_not_found` and
 * `spotify_unavailable` as themselves, any other Spotify failure as `spotify_unavailable`, and
 * YouTube Music streaming off, or its search failing, as `medium_unavailable`. A stopped import
 * runs again from where it stopped when asked to. Nothing upstream is asked while none is queued.
 */
import type { ListImportStop } from '@auralis/schema';
import type { Clock } from '../../adapters/musicbrainz/client.js';
import { SpotifyError, type SpotifyPlaylist } from '../../adapters/spotify/client.js';
import type { SpotifyTrack } from '../../adapters/spotify/schemas.js';
import type { YtSong } from '../../adapters/ytmusic/client.js';
import { pacedSearch, resolveEntries } from '../../music/import/resolve.js';
import type { Db } from '../../store/connection.js';
import { handled, importOf, nextImport, setState, type StoredImport } from './state.js';

/** What the job reads of Spotify: a playlist's name, cover and order, and one track. */
export interface SpotifyReader {
  playlistHeader(id: string): Promise<{ name: string; cover: string | null }>;
  playlist(id: string): Promise<SpotifyPlaylist>;
  track(id: string): Promise<SpotifyTrack | null>;
}

export interface ImportJobDeps {
  db: Db;
  spotify: SpotifyReader;
  /** YouTube Music's song search; paced here, apart from the search route's own. */
  search: (query: string) => Promise<YtSong[]>;
  /** Whether YouTube Music streaming is on. */
  available: () => boolean;
  clock: Clock;
  log: { warn(details: object, message: string): void };
}

/** A failure that stops an import, with the reason it is shown with. */
class Stop extends Error {
  constructor(readonly reason: ListImportStop) {
    super(reason);
  }
}

export class ImportJob {
  private running: Promise<void> | null = null;
  private stopping = false;
  private readonly search: (query: string) => Promise<YtSong[]>;

  constructor(private readonly deps: ImportJobDeps) {
    const paced = pacedSearch(deps.search, deps.clock);
    this.search = async (query) => {
      if (!deps.available()) throw new Stop('medium_unavailable');
      try {
        return await paced(query);
      } catch (error) {
        deps.log.warn({ error: String(error) }, 'An import’s YouTube Music search failed');
        throw new Stop('medium_unavailable');
      }
    };
  }

  /** Runs every queued import, one at a time, unless a run is under way. */
  wake(): void {
    if (this.running !== null || this.stopping) return;
    this.running = this.drain().finally(() => {
      this.running = null;
    });
  }

  /** Once the run under way, if any, is over. */
  async settled(): Promise<void> {
    await this.running;
  }

  /** Stops after the place being handled; what is left goes on at the next start. */
  async stop(): Promise<void> {
    this.stopping = true;
    await this.running;
  }

  private async drain(): Promise<void> {
    for (let next = nextImport(this.deps.db); next !== null && !this.stopping;) {
      await this.run(next);
      next = nextImport(this.deps.db);
    }
  }

  private async run(i: StoredImport): Promise<void> {
    const { db, clock } = this.deps;
    try {
      const playlist = await this.spotify(() => this.deps.spotify.playlist(i.playlistId));
      if (importOf(db, i.listId) === null) return;
      setState(db, i.listId, { state: 'matching', total: playlist.entries.length });
      const deps = {
        db,
        clock,
        search: this.search,
        track: (id: string) => this.spotify(() => this.deps.spotify.track(id)),
      };
      for await (const r of resolveEntries(deps, playlist.entries.slice(i.done))) {
        handled(
          db,
          i.listId,
          r.youtubeId === null
            ? { report: r.unmatched }
            : {
                song: r.youtubeId,
                entry: {
                  position: r.position,
                  uri: r.uri,
                  title: null,
                  artists: [],
                  album: null,
                  durationMs: null,
                  near: null,
                },
              },
          clock.now(),
        );
        // A list deleted while it imports takes its import with it: nothing more is read for it.
        if (this.stopping || importOf(db, i.listId) === null) return;
      }
      setState(db, i.listId, { state: 'done' });
    } catch (error) {
      // Anything unforeseen stops this import as Spotify's, so the queue goes on past it.
      const reason = error instanceof Stop ? error.reason : 'spotify_unavailable';
      this.deps.log.warn({ list: i.listId, reason, error: String(error) }, 'An import stopped');
      setState(db, i.listId, { state: 'stopped', stopped: reason });
    }
  }

  /** A Spotify read, its refusals as the stop they cause. */
  private async spotify<T>(read: () => Promise<T>): Promise<T> {
    try {
      return await read();
    } catch (error) {
      if (error instanceof Stop) throw error;
      if (error instanceof SpotifyError) throw new Stop(error.code);
      this.deps.log.warn({ error: String(error) }, 'An import’s Spotify read failed');
      throw new Stop('spotify_unavailable');
    }
  }
}
