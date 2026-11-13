/**
 * An album's editions: its MusicBrainz release group's official releases, grouped by the
 * recordings they hold. The same 36 recordings of Ghosts I–IV come as one digital medium, two CDs
 * and four vinyl sides (live), so an edition is a list of recordings, not a disc layout. Media
 * that carry video (a DVD, a Blu-ray) are left out first, so a CD with a bonus DVD is the album.
 *
 * The **target** edition is the one a request brings: the edition the most releases share (the
 * standard album, ties to the earliest), if it holds every recording kept from this group; else
 * the smallest edition that does. Which edition to bring is Sofia's call (outbox); this is
 * the default the work goes ahead on.
 *
 * An album and its editions are kept for a week (`album_editions`), read through by the search, the
 * gate and the import; an album with no editions only for a day, as its releases may be added yet
 * and every request for it fails meanwhile. Reads of one group at once ask MusicBrainz once.
 */
import { z } from 'zod';
import type { MusicBrainzClient } from '../../adapters/musicbrainz/client.js';
import type { GroupRelease, ReleaseGroup } from '../../adapters/musicbrainz/schemas.js';
import type { Db } from '../../store/connection.js';

export const ALBUM_EDITIONS_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
export const ALBUM_EDITIONS_EMPTY_CACHE_MS = 24 * 60 * 60 * 1000;

/** A medium format that carries video. A DVD-Audio is dropped too: no torrent of one is taken. */
const VIDEO_FORMAT = /dvd|blu-ray|vhs|vcd|laserdisc|umd|betamax/i;
/** A medium format that is a CD of some kind: CD, Enhanced CD, HDCD, SHM-CD, Blu-spec CD… */
const CD_FORMAT = /\bcd\b|-cd\b|hdcd/i;

const trackSchema = z.object({
  recordingId: z.string(),
  title: z.string(),
  /** In milliseconds, as the earliest release of the edition gives it; null when unknown. */
  length: z.number().nullable(),
});
export type EditionTrack = z.infer<typeof trackSchema>;

const releaseSchema = z.object({
  id: z.string(),
  date: z.string().nullable(),
  country: z.string().nullable(),
  /** Each medium's format, video media left out; null where MusicBrainz names none. */
  formats: z.array(z.string().nullable()),
  /** Each medium's number of tracks, in medium order: the release's disc layout. */
  trackCounts: z.array(z.number().int()),
});
export type EditionRelease = z.infer<typeof releaseSchema>;

const editionSchema = z.object({
  /** Every track in play order, across media. */
  tracks: z.array(trackSchema),
  /** Earliest first. */
  releases: z.array(releaseSchema),
});
export type Edition = z.infer<typeof editionSchema>;

const editionsSchema = z.array(editionSchema);

const artistCreditSchema = z.array(
  z.object({
    name: z.string(),
    joinPhrase: z.string(),
    artistId: z.string(),
    artistName: z.string(),
  }),
);
const groupSchema = z.object({
  id: z.string(),
  title: z.string(),
  primaryType: z.string().nullable(),
  secondaryTypes: z.array(z.string()),
  firstReleaseDate: z.string().nullable(),
  artistCredit: artistCreditSchema,
}) satisfies z.ZodType<ReleaseGroup>;

export interface Album {
  group: ReleaseGroup;
  /** The most shared first, then the earliest. */
  editions: Edition[];
}

/** A date for ordering: a missing one last. "2008" sorts before "2008-03-02", as it should. */
const dateKey = (date: string | null) => date ?? '￿';

const byEarliest = (a: EditionRelease, b: EditionRelease) =>
  dateKey(a.date).localeCompare(dateKey(b.date)) || a.id.localeCompare(b.id);

type Medium = GroupRelease['media'][number];

const isVideo = (medium: Medium) =>
  (medium.format !== null && VIDEO_FORMAT.test(medium.format)) ||
  (medium.tracks.length > 0 && medium.tracks.every((track) => track.recording.video));

/** The group's official releases grouped into editions, most shared first, then earliest. */
export function foldEditions(releases: readonly GroupRelease[]): Edition[] {
  const editions = new Map<string, Edition>();
  const ordered = releases
    .filter((release) => release.status === 'Official')
    .map((release) => {
      const media = release.media
        .filter((medium) => !isVideo(medium))
        .sort((a, b) => a.position - b.position);
      return { release, media };
    })
    .filter(({ media }) => media.length > 0 && media.every((m) => m.tracks.length > 0))
    .map(({ release, media }) => ({
      tracks: media.flatMap((medium) =>
        [...medium.tracks]
          .sort((a, b) => a.position - b.position)
          .map((track) => ({
            recordingId: track.recording.id,
            title: track.title,
            length: track.length ?? track.recording.length,
          })),
      ),
      release: {
        id: release.id,
        date: release.date,
        country: release.country,
        formats: media.map((medium) => medium.format),
        trackCounts: media.map((medium) => medium.tracks.length),
      },
    }))
    .sort((a, b) => byEarliest(a.release, b.release));
  for (const { tracks, release } of ordered) {
    const key = tracks.map((track) => track.recordingId).join(' ');
    const edition = editions.get(key);
    if (edition === undefined) editions.set(key, { tracks, releases: [release] });
    else edition.releases.push(release);
  }
  return [...editions.values()].sort(
    (a, b) => b.releases.length - a.releases.length || byEarliest(a.releases[0]!, b.releases[0]!),
  );
}

/**
 * The edition a request brings: the most shared, if it holds every kept recording; else the
 * smallest edition that does; else, when none does, the most shared. `editions` is in
 * `foldEditions`' order, which breaks ties. Null when the group has no edition.
 *
 * The most shared comes first even when a smaller edition holds the kept songs: Ghosts I–IV's
 * 9-track "Ghosts I" holds its first nine recordings, and a song kept from those still brings the
 * album.
 */
export function targetEdition(
  editions: readonly Edition[],
  keptRecordingIds: readonly string[] = [],
): Edition | null {
  const holds = (edition: Edition) => {
    const held = new Set(edition.tracks.map((track) => track.recordingId));
    return keptRecordingIds.every((id) => held.has(id));
  };
  const [shared] = editions;
  if (shared === undefined || holds(shared)) return shared ?? null;
  let best: Edition | null = null;
  for (const edition of editions) {
    if (holds(edition) && (best === null || edition.tracks.length < best.tracks.length)) {
      best = edition;
    }
  }
  return best ?? shared;
}

const isCd = (release: EditionRelease) =>
  release.formats.length > 0 &&
  release.formats.every((format) => format !== null && CD_FORMAT.test(format));

/**
 * The release of `edition` that files laid out as `layout` (tracks per disc folder) are tagged
 * from: one whose disc layout is the same, a CD among those first, the earliest first; else the
 * earliest CD; else the earliest release.
 */
export function releaseFor(edition: Edition, layout: readonly number[]): EditionRelease {
  const same = edition.releases.filter(
    (release) =>
      release.trackCounts.length === layout.length &&
      release.trackCounts.every((count, i) => count === layout[i]),
  );
  const pool = same.length > 0 ? same : edition.releases;
  return pool.find(isCd) ?? pool[0]!;
}

export interface AlbumEditionsDeps {
  db: Db;
  musicBrainz: Pick<MusicBrainzClient, 'releaseGroup' | 'releasesOfGroup'>;
  now?: () => number;
}

export class AlbumEditions {
  private readonly now: () => number;
  /** Reads asking MusicBrainz now, so a second read of the group waits for the first. */
  private readonly asking = new Map<string, Promise<Album | null>>();

  constructor(private readonly deps: AlbumEditionsDeps) {
    this.now = deps.now ?? Date.now;
  }

  /** The album named by its release group id, kept or asked now; null when the group is gone. */
  read(groupId: string): Promise<Album | null> {
    const kept = this.kept(groupId);
    if (kept !== null) return Promise.resolve(kept);
    const already = this.asking.get(groupId);
    if (already !== undefined) return already;
    const asked = this.ask(groupId).finally(() => this.asking.delete(groupId));
    this.asking.set(groupId, asked);
    return asked;
  }

  private async ask(groupId: string): Promise<Album | null> {
    const group = await this.deps.musicBrainz.releaseGroup(groupId);
    if (group === null) return null;
    const editions = foldEditions(await this.deps.musicBrainz.releasesOfGroup(groupId));
    this.keep(groupId, { group, editions });
    return { group, editions };
  }

  private kept(groupId: string): Album | null {
    const row = this.deps.db
      .prepare<[string, number], { at: number; release_group: string; editions: string }>(
        `SELECT at, release_group, editions FROM album_editions
         WHERE release_group_id = ? AND at > ?`,
      )
      .get(groupId, this.now() - ALBUM_EDITIONS_CACHE_MS);
    if (row === undefined) return null;
    const group = groupSchema.safeParse(JSON.parse(row.release_group));
    const editions = editionsSchema.safeParse(JSON.parse(row.editions));
    if (!group.success || !editions.success) return null;
    const empty = editions.data.length === 0;
    if (empty && row.at <= this.now() - ALBUM_EDITIONS_EMPTY_CACHE_MS) return null;
    return { group: group.data, editions: editions.data };
  }

  private keep(groupId: string, album: Album): void {
    const now = this.now();
    const { db } = this.deps;
    db.transaction(() => {
      db.prepare('DELETE FROM album_editions WHERE at <= ?').run(now - ALBUM_EDITIONS_CACHE_MS);
      db.prepare(
        `INSERT INTO album_editions (release_group_id, at, release_group, editions)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (release_group_id) DO UPDATE SET
           at = excluded.at, release_group = excluded.release_group, editions = excluded.editions`,
      ).run(groupId, now, JSON.stringify(album.group), JSON.stringify(album.editions));
    })();
  }
}
