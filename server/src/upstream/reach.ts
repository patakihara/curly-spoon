/**
 * Whether a person's own upstream account reaches an indexed row, and which account acts for them
 * on it. Everything indexed is the household's, so a row their own account does not reach (no
 * link, or a library their account is not granted) plays, opens and draws through Auralis's own
 * accounts: the listen-only Audiobookshelf key and Jellyfin's API key. Their own account always
 * goes first where it reaches, and an item the index does not hold is theirs alone to ask for.
 *
 * Nobody's account changes for a household play: where the person is stays in Auralis
 * (`store/heldProgress.ts`), and `withHeld` shows it wherever a standing shows, the newer of it
 * and their own account's. So when their own account later gains the item, nothing is lost: the
 * next plan starts at the held position if it is the newer, the first sync their account takes
 * carries it over, and the held row goes.
 *
 * A check of their own account is kept a minute per person, as `accessCache` keeps it; a token
 * their upstream refuses reaches nothing.
 */
import type { AbsClient } from '../adapters/audiobookshelf/client.js';
import { libraryAccessSchema } from '../adapters/audiobookshelf/schemas.js';
import { AdapterError } from '../adapters/http/fetch.js';
import type { JellyfinClient } from '../adapters/jellyfin/client.js';
import { indexedRow, type StoredRow } from '../libraryIndex/store.js';
import { Refusal } from '../route.js';
import { accessCache } from '../routes/accessCache.js';
import type { UpstreamAccess } from '../routes/play.js';
import type { Db } from '../store/connection.js';
import { heldProgressOf } from '../store/heldProgress.js';
import type { User } from '../store/users.js';
import { type Upstreams, upstreamFor } from './links.js';

/** Where a person stands with one book or episode: how far through, and whether finished. */
export interface Standing {
  /** From 0 to 1; null when not started, or begun but still at 0. Finished is 1. */
  progress: number | null;
  finished: boolean;
  /** When Audiobookshelf last changed it, in milliseconds since the epoch; null if never. */
  updatedAt: number | null;
}

/** A book or episode the person has begun or finished on Audiobookshelf. */
export interface Heard {
  /** The book's id, or the episode's own id. */
  id: string;
  /** When Audiobookshelf last changed it, in milliseconds since the epoch; null if never. */
  updatedAt: number | null;
}

/** What the person's own Audiobookshelf `GET /api/me` says: what they may open, how far they are. */
export interface AbsAccess {
  open(libraryId: string | null): boolean;
  /** A book's standing by its id, or an episode's by its own id. */
  standing(id: string): Standing;
  /**
   * Every book and episode begun, by time or share, or finished, that the person has not removed
   * from Continue Listening.
   */
  heard: readonly Heard[];
  /**
   * The books and shows they have begun or finished any of, removed from Continue Listening or not:
   * removing it from there does not take it out of their library.
   */
  begun: readonly string[];
  /** Whether the person removed a book or episode from Continue Listening, by its id. */
  hidden(id: string): boolean;
  /** Whether the person removed a series from Continue Series, by its id. */
  seriesHidden(seriesId: string): boolean;
}

export async function absAccess(abs: AbsClient): Promise<AbsAccess> {
  const me = await abs.getMe();
  const access = libraryAccessSchema.safeParse(me);
  if (!access.success) throw new Refusal(502, 'upstream_failed');
  const { permissions, librariesAccessible } = access.data;
  const standings = new Map<string, Standing>(
    me.mediaProgress.map((p) => {
      const share = p.isFinished ? 1 : Math.min(1, p.progress);
      return [
        p.episodeId ?? p.libraryItemId,
        {
          progress: share > 0 ? share : null,
          finished: p.isFinished,
          updatedAt: p.lastUpdate ?? null,
        },
      ];
    }),
  );
  const hiddenIds = new Set(
    me.mediaProgress
      .filter((p) => p.hideFromContinueListening === true)
      .map((p) => p.episodeId ?? p.libraryItemId),
  );
  const hiddenSeries = new Set(me.seriesHideFromContinueListening ?? []);
  const begun = me.mediaProgress.filter((p) => p.isFinished || p.progress > 0 || p.currentTime > 0);
  return {
    open: (libraryId) =>
      permissions.accessAllLibraries ||
      (libraryId !== null && librariesAccessible.includes(libraryId)),
    standing: (id) => standings.get(id) ?? { progress: null, finished: false, updatedAt: null },
    heard: begun
      .filter((p) => p.hideFromContinueListening !== true)
      .map((p) => ({ id: p.episodeId ?? p.libraryItemId, updatedAt: p.lastUpdate ?? null })),
    begun: [...new Set(begun.map((p) => p.libraryItemId))],
    hidden: (id) => hiddenIds.has(id),
    seriesHidden: (seriesId) => hiddenSeries.has(seriesId),
  };
}

/** The ids of the Jellyfin libraries the person sees, hidden from their home screen or not. */
export async function jellyfinViews(jellyfin: JellyfinClient): Promise<Set<string>> {
  return new Set((await jellyfin.getUserViews()).map((view) => view.Id));
}

const NOT_STARTED: Standing = { progress: null, finished: false, updatedAt: null };

/**
 * A person's standing as it shows everywhere: `own`, their Audiobookshelf's, with where Auralis
 * holds them on household plays, the newer winning for each book or episode. With `household`
 * they may open every library; without it, only what `own` opens. Null when there is neither.
 */
export function withHeld(
  db: Db,
  userId: string,
  own: AbsAccess | null,
  household: boolean,
): AbsAccess | null {
  if (own === null && !household) return null;
  const held = heldProgressOf(db, userId, 'abs');
  const standing = (id: string): Standing => {
    const mine = own?.standing(id) ?? NOT_STARTED;
    const kept = held.get(id);
    if (kept === undefined || (mine.updatedAt !== null && mine.updatedAt > kept.updatedAt)) {
      return mine;
    }
    const share = kept.finished ? 1 : kept.duration > 0 ? kept.position / kept.duration : 0;
    return {
      progress: share > 0 ? Math.min(1, share) : null,
      finished: kept.finished,
      updatedAt: kept.updatedAt,
    };
  };
  const heardHere = [...held]
    .filter(([, kept]) => kept.finished || kept.position > 0)
    .map(([id, kept]): Heard => ({ id, updatedAt: kept.updatedAt }));
  const ownHeard = new Map((own?.heard ?? []).map((one) => [one.id, one]));
  for (const one of heardHere) {
    const theirs = ownHeard.get(one.id);
    if (theirs === undefined || (theirs.updatedAt ?? 0) < (one.updatedAt ?? 0)) {
      ownHeard.set(one.id, one);
    }
  }
  const holders = heardHere.map(({ id }) => indexedRow(db, 'abs', id)?.parentId ?? id);
  return {
    open: (libraryId) => household || (own?.open(libraryId) ?? false),
    standing,
    heard: [...ownHeard.values()],
    begun: [...new Set([...(own?.begun ?? []), ...holders])],
    hidden: (id) => own?.hidden(id) ?? false,
    seriesHidden: (seriesId) => own?.seriesHidden(seriesId) ?? false,
  };
}

/** Whether a failed check of a person's own account means it reaches nothing: its token is refused. */
const refused = (error: unknown) =>
  error instanceof AdapterError && (error.status === 401 || error.status === 403);

/** Which account acts for a person: their own, or Auralis's. */
export interface ActingAs<C> {
  client: C;
  household: boolean;
}

/** The library a row sits in: its own, or for an episode or a track, its show's or album's. */
function libraryOf(db: Db, row: StoredRow): string | null {
  const top = row.parentId === null ? row : indexedRow(db, row.source, row.parentId);
  return (top ?? row).libraryId;
}

/** One route group's view of who reaches what; each keeps its own minute of checks. */
export class Reach {
  private readonly kept = accessCache();

  constructor(
    private readonly db: Db,
    private readonly upstreams: UpstreamAccess | null,
  ) {}

  /** The person's own clients. */
  own(user: User): Upstreams {
    const { db, upstreams } = this;
    return upstreams === null
      ? { abs: null, jellyfin: null }
      : upstreamFor({ db, ...upstreams }, user);
  }

  /** Auralis's own client for `source`, where its key is set. */
  household<S extends keyof Upstreams>(source: S): Upstreams[S] | null {
    return this.upstreams?.household?.[source] ?? null;
  }

  /** What their own Audiobookshelf says, or null with no link or a refused token. */
  async ownAbs(user: User, fresh = false): Promise<AbsAccess | null> {
    const abs = this.own(user).abs;
    if (abs === null) return null;
    const read = () => absAccess(abs);
    try {
      return await (fresh ? read() : this.kept(`${user.id}:abs`, read));
    } catch (error) {
      if (refused(error)) return null;
      throw error;
    }
  }

  /** The libraries their own Jellyfin shows, or null with no link or a refused token. */
  async ownViews(user: User, fresh = false): Promise<Set<string> | null> {
    const jellyfin = this.own(user).jellyfin;
    if (jellyfin === null) return null;
    const read = () => jellyfinViews(jellyfin);
    try {
      return await (fresh ? read() : this.kept(`${user.id}:jellyfin`, read));
    } catch (error) {
      if (refused(error)) return null;
      throw error;
    }
  }

  /** Whether the person's own account reaches an indexed row. A failed check throws. */
  async reaches(user: User, row: StoredRow, fresh = false): Promise<boolean> {
    const library = libraryOf(this.db, row);
    if (row.source === 'jellyfin') {
      const views = await this.ownViews(user, fresh);
      return views !== null && library !== null && views.has(library);
    }
    return (await this.ownAbs(user, fresh))?.open(library) ?? false;
  }

  /**
   * Who acts for the person on an indexed row: their own account where it reaches, else Auralis's;
   * null when neither can. A failed check of their own account throws.
   */
  async pick<S extends keyof Upstreams>(
    user: User,
    source: S,
    row: StoredRow,
    fresh = false,
  ): Promise<ActingAs<NonNullable<Upstreams[S]>> | null> {
    return this.acting(source, user, await this.reaches(user, row, fresh));
  }

  /**
   * Who acts on an Audiobookshelf row, as `pick` says, with what the person's own account said, so
   * a caller that wants both asks it once. Their own is null with no link or a refused token.
   */
  async pickAbs(
    user: User,
    row: StoredRow,
    fresh = false,
  ): Promise<{ acting: ActingAs<AbsClient> | null; own: AbsAccess | null }> {
    const own = await this.ownAbs(user, fresh);
    const reached = own?.open(libraryOf(this.db, row)) ?? false;
    return { acting: this.acting('abs', user, reached), own };
  }

  private acting<S extends keyof Upstreams>(
    source: S,
    user: User,
    reached: boolean,
  ): ActingAs<NonNullable<Upstreams[S]>> | null {
    const own = reached ? this.own(user)[source] : null;
    if (own !== null) return { client: own as NonNullable<Upstreams[S]>, household: false };
    const household = this.household(source);
    return household === null
      ? null
      : { client: household as NonNullable<Upstreams[S]>, household: true };
  }
}
