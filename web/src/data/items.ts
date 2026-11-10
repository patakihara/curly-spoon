import { type EpisodeOrder, type ItemDetail, mediaRefKey } from '@auralis/schema';
import { type ApiClient } from '../api/client';
import { type AlbumData } from '../generated/pages/Album';
import { type BookData } from '../generated/pages/Book';
import { type EpisodeData } from '../generated/pages/Episode';
import { type ShowData } from '../generated/pages/Show';
import { artAt, clock, day, emptied, span } from './format';
import { loadItem } from './loads';
import { makeRequest } from './requests';

/**
 * A book's, show's, episode's or album's page from `GET /api/items/{ref}`: its header, then a
 * book's chapters, a show's episodes, an episode's notes or an album's tracks. What the answer
 * does not hold (a book's series, narrations and rating, a show's related shows, an episode's
 * other episodes, an album's editions and more by the artist, every About) stays empty, so its
 * section draws with nothing in it. An author's or artist's ref stays empty too: there is no
 * such page to open yet, so the name draws as plain text. The page's own words (its kind, a
 * show's subscribe labels and its sorts) stay as the canvas has them; a show's sort bar names, in
 * those words, the order its episodes came in, and chooses by the show's ref. An album whose every
 * track is a song kept from YouTube Music offers its lossless copy in its menu, in the canvas's
 * words, which asks for it with the request the server gave its page.
 */

/** Where you are in the item, in seconds, from how far through it you are. */
const placeIn = (detail: ItemDetail) =>
  detail.progress === null || detail.duration === null ? null : detail.progress * detail.duration;

/** The header's line of facts: its length, and what is left of it once begun. */
const factsOf = (duration: number | null, progress: number | null) =>
  [
    duration === null ? null : span(duration),
    duration === null || progress === null || progress >= 1
      ? null
      : `${span(duration * (1 - progress))} left`,
  ]
    .filter((fact) => fact !== null)
    .join(' · ');

/** A chapter row; the canvas's type holds only the mixes its samples show. */
type ChapterRow = BookData['chapters'][number];

export function bookData(detail: ItemDetail, page: BookData): BookData {
  const at = placeIn(detail);
  return {
    ...emptied(page),
    ref: mediaRefKey(detail.ref),
    title: detail.title,
    kind: page.kind,
    author: detail.sub ?? '',
    meta: factsOf(detail.duration, detail.progress),
    progress: detail.progress ?? 0,
    image: artAt(detail.art, 'medium'),
    download: 'idle',
    chapters: detail.chapters.map((chapter, i): ChapterRow => {
      const here = at !== null && chapter.start <= at && at < chapter.end;
      return {
        number: i + 1,
        title: chapter.title,
        meta: `${clock(chapter.start)} · ${span(chapter.end - chapter.start)}`,
        status: here ? `${span(chapter.end - at)} left` : null,
        tone: here ? 'library' : null,
      } as ChapterRow;
    }),
  };
}

/** A show's sort, in the page's words, naming `order`'s, or none. */
function sortNamed(sort: ShowData['sort'], order: EpisodeOrder | undefined): string {
  return sort.options.find((o) => o.key === order)?.label ?? '';
}

/**
 * A show's page while its episodes load, or when they failed: drawn empty, its sort bar naming the
 * order its address asks (`?sort`), and none when it asks none, the show's own order not yet known.
 */
export function showAwaited(page: ShowData, order: EpisodeOrder | undefined): ShowData {
  const empty = emptied(page);
  return { ...empty, sort: { ...empty.sort, value: sortNamed(page.sort, order) } };
}

export function showData(detail: ItemDetail, page: ShowData): ShowData {
  const unplayed = detail.episodes.filter((e) => !e.finished && e.progress === null).length;
  const count = detail.episodes.length;
  return {
    ...emptied(page),
    ref: mediaRefKey(detail.ref),
    title: detail.title,
    kind: page.kind,
    host: detail.sub ?? '',
    meta: [`${count} ${count === 1 ? 'episode' : 'episodes'}`, `${unplayed} unplayed`].join(' · '),
    image: artAt(detail.art, 'medium'),
    following: true,
    subscribe: page.subscribe,
    sort: {
      ref: mediaRefKey(detail.ref),
      value: sortNamed(page.sort, detail.sort),
      options: page.sort.options,
    },
    episodes: detail.episodes.map((episode) => ({
      title: episode.title,
      ref: mediaRefKey(episode.ref),
      description: episode.description ?? '',
      meta: [
        episode.publishedAt === null ? null : day(episode.publishedAt),
        episode.duration === null ? null : span(episode.duration),
        episode.duration === null || episode.progress === null || episode.finished
          ? null
          : `${span(episode.duration * (1 - episode.progress))} left`,
      ].filter((fact) => fact !== null),
      image: artAt(detail.art, 'small'),
      progress: episode.finished ? null : episode.progress,
      finished: episode.finished,
      absent: false,
    })),
  };
}

/** An album's one verb: asking for its lossless copy. */
const ADD_TO_LIBRARY = 'addToLibrary';

export function albumData(detail: ItemDetail, page: AlbumData): AlbumData {
  const count = detail.tracks.length;
  return {
    ...emptied(page),
    menu: detail.request === null ? [] : page.menu.filter(({ key }) => key === ADD_TO_LIBRARY),
    ref: mediaRefKey(detail.ref),
    title: detail.title,
    kind: page.kind,
    artist: detail.sub ?? '',
    meta: [`${count} ${count === 1 ? 'track' : 'tracks'}`, factsOf(detail.duration, null)]
      .filter((fact) => fact !== '')
      .join(' · '),
    image: artAt(detail.art, 'medium'),
    tracks: detail.tracks.map((track, i) => ({
      number: track.number ?? i + 1,
      title: track.title,
      meta: [track.sub, track.duration === null ? null : clock(track.duration)]
        .filter((fact) => fact !== null)
        .join(' · '),
      status: null,
      menu: [],
    })),
  };
}

/**
 * An album page's menu verb, `key` done to the album `ref` names: Add to library asks for its
 * lossless copy with the request the server gives its page, and the page loads again to show it.
 * A refusal for want of a sign-in throws `SignedOut`; an album with no request to make, or any
 * other verb, throws too.
 */
export async function albumVerb(
  api: ApiClient,
  ref: string,
  key: string,
): Promise<{ reload: boolean }> {
  if (key !== ADD_TO_LIBRARY) throw new Error(`no verb ${key} on ${ref}`);
  const { request } = await loadItem(api, ref);
  if (request === null) throw new Error(`no request for ${ref}`);
  await makeRequest(api, request);
  return { reload: true };
}

export function episodeData(detail: ItemDetail, page: EpisodeData): EpisodeData {
  const about = detail.episode;
  return {
    ...emptied(page),
    ref: mediaRefKey(detail.ref),
    title: detail.title,
    kind: page.kind,
    show: detail.sub ?? '',
    showRef: about === undefined ? '' : mediaRefKey(about.show),
    meta: [
      about === undefined || about.publishedAt === null ? null : day(about.publishedAt),
      factsOf(detail.duration, about?.finished === true ? null : detail.progress),
    ]
      .filter((fact) => fact !== null && fact !== '')
      .join(' · '),
    progress: about?.finished === true ? 0 : (detail.progress ?? 0),
    image: artAt(detail.art, 'medium'),
    download: 'idle',
    notes: about?.description ?? '',
  };
}
