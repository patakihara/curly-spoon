/**
 * What the index keeps of each upstream item, and how each upstream's answer maps onto it. One
 * row per book, show, episode, album or track, keyed like a `MediaRef`: its source and its id
 * there. `ids` holds the external ids matching needs later (ASIN, feed URL, MusicBrainz ids).
 */
import type { BookSummary, ItemSummary, ShowSummary } from '../adapters/audiobookshelf/schemas.js';
import type { IndexItem } from '../adapters/jellyfin/schemas.js';

export type IndexSource = 'abs' | 'jellyfin';
export type IndexKind = 'book' | 'show' | 'episode' | 'album' | 'track';

export interface Creator {
  /** The upstream's own id for the person, where it has one. */
  id?: string;
  name: string;
  role: 'author' | 'narrator' | 'host' | 'artist' | 'album-artist';
}

export interface SeriesEntry {
  id: string;
  name: string;
  sequence: string | null;
}

export interface IndexRow {
  source: IndexSource;
  id: string;
  kind: IndexKind;
  /** The show or album this belongs to, from the same source; null for a top-level item. */
  parentId: string | null;
  /** The upstream library it sits in, where the upstream has libraries the index pages. */
  libraryId: string | null;
  title: string;
  creators: Creator[];
  series: SeriesEntry[];
  genres: string[];
  /** Track or episode number, and disc or season, when the upstream gives them as numbers. */
  position: number | null;
  disc: number | null;
  /** Seconds. */
  duration: number | null;
  year: number | null;
  /** Milliseconds since the epoch. */
  publishedAt: number | null;
  /** The upstream's own change marker: ABS `updatedAt`, Jellyfin `Etag`. */
  upstreamVersion: string | null;
  /** External ids by scheme: `asin`, `feed_url`, `musicbrainz_album`, ... */
  ids: Record<string, string>;
}

/** A top-level item and everything under it, as one upstream answer gives them. */
export interface IndexTree {
  top: IndexRow;
  children: IndexRow[];
}

function present(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function whole(value: string | null | undefined): number | null {
  return present(value) && /^\d+$/.test(value.trim()) ? Number(value.trim()) : null;
}

function idsOf(entries: [string, string | null | undefined][]): Record<string, string> {
  const ids: Record<string, string> = {};
  for (const [scheme, value] of entries) if (present(value)) ids[scheme] = value.trim();
  return ids;
}

const base = {
  parentId: null,
  libraryId: null,
  creators: [],
  series: [],
  genres: [],
  position: null,
  disc: null,
  duration: null,
  year: null,
  publishedAt: null,
  upstreamVersion: null,
  ids: {},
} satisfies Partial<IndexRow>;

function bookTree(item: BookSummary): IndexTree {
  const meta = item.media.metadata;
  const played = item.media.audioFiles.filter((f) => f.exclude !== true);
  const duration = played.reduce((sum, f) => sum + (f.duration ?? 0), 0);
  return {
    top: {
      ...base,
      source: 'abs',
      id: item.id,
      kind: 'book',
      libraryId: item.libraryId,
      title: meta.title,
      creators: [
        ...meta.authors.map((a): Creator => ({ id: a.id, name: a.name, role: 'author' })),
        ...meta.narrators.map((name): Creator => ({ name, role: 'narrator' })),
      ],
      series: meta.series.map((s) => ({ id: s.id, name: s.name, sequence: s.sequence ?? null })),
      genres: meta.genres,
      duration: played.length > 0 ? duration : null,
      year: whole(meta.publishedYear),
      upstreamVersion: String(item.updatedAt),
      ids: idsOf([
        ['asin', meta.asin],
        ['isbn', meta.isbn],
      ]),
    },
    children: [],
  };
}

function showTree(item: ShowSummary): IndexTree {
  const meta = item.media.metadata;
  const hosts: Creator[] = present(meta.author) ? [{ name: meta.author, role: 'host' }] : [];
  return {
    top: {
      ...base,
      source: 'abs',
      id: item.id,
      kind: 'show',
      libraryId: item.libraryId,
      title: meta.title,
      creators: hosts,
      genres: meta.genres,
      upstreamVersion: String(item.updatedAt),
      ids: idsOf([
        ['feed_url', meta.feedUrl],
        ['itunes_id', meta.itunesId],
      ]),
    },
    children: item.media.episodes.map((e) => ({
      ...base,
      source: 'abs',
      id: e.id,
      kind: 'episode',
      parentId: item.id,
      libraryId: item.libraryId,
      title: e.title,
      creators: hosts,
      genres: meta.genres,
      position: whole(e.episode),
      disc: whole(e.season),
      duration: e.audioFile?.duration ?? null,
      publishedAt: e.publishedAt ?? null,
      upstreamVersion: String(e.updatedAt),
      ids: idsOf([
        ['guid', e.guid],
        ['enclosure_url', e.enclosure?.url],
      ]),
    })),
  };
}

/** A book with no children, or a show with its episodes. */
export function absTree(item: ItemSummary): IndexTree {
  return item.mediaType === 'book' ? bookTree(item) : showTree(item);
}

/** `MusicBrainzReleaseGroup` becomes `musicbrainz_release_group`, `AudioDbAlbum` `audiodb_album`. */
function providerScheme(key: string): string {
  return key
    .replace(/^MusicBrainz/, 'Musicbrainz')
    .replace(/^AudioDb/, 'Audiodb')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

const TICKS_PER_SECOND = 10_000_000;

function jellyfinRow(item: IndexItem, kind: 'album' | 'track', parentId: string | null): IndexRow {
  const people =
    kind === 'album'
      ? (item.AlbumArtists ?? []).map((a): Creator => ({
          id: a.Id,
          name: a.Name ?? '',
          role: 'album-artist',
        }))
      : (item.ArtistItems ?? []).map((a): Creator => ({
          id: a.Id,
          name: a.Name ?? '',
          role: 'artist',
        }));
  const premiere = item.PremiereDate ? Date.parse(item.PremiereDate) : NaN;
  return {
    ...base,
    source: 'jellyfin',
    id: item.Id,
    kind,
    parentId,
    title: item.Name ?? '',
    creators: people,
    genres: item.Genres ?? [],
    position: kind === 'track' ? (item.IndexNumber ?? null) : null,
    disc: kind === 'track' ? (item.ParentIndexNumber ?? null) : null,
    duration: item.RunTimeTicks == null ? null : item.RunTimeTicks / TICKS_PER_SECOND,
    year: item.ProductionYear ?? null,
    publishedAt: Number.isNaN(premiere) ? null : premiere,
    upstreamVersion: item.Etag ?? null,
    ids: idsOf(Object.entries(item.ProviderIds ?? {}).map(([k, v]) => [providerScheme(k), v])),
  };
}

export function albumRow(album: IndexItem): IndexRow {
  return jellyfinRow(album, 'album', null);
}

export function trackRows(albumId: string, tracks: IndexItem[]): IndexRow[] {
  return tracks.map((t) => jellyfinRow(t, 'track', albumId));
}
