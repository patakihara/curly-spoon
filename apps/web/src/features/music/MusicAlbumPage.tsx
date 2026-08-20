/**
 * An album's tracks (`/music/album/$albumId`). Same "no single-item BFF route"
 * situation as `MusicArtistPage` — the header (album name, artist, cover) is
 * derived from the track list itself (`JellyfinTrack.albumName`/`artistNames`),
 * not a dedicated album fetch. An empty album (zero tracks, reachable if the
 * upstream library changed between browsing to it and this page loading)
 * degrades to "Album" rather than throwing.
 *
 * Restyled against Sonora's `MediaHeader` (`docs/design/screens/ALBUM_DETAIL.md`, the third
 * adoption of `../../components/MediaHeader.tsx` after `ItemPage.tsx`/`PodcastDetailPage.tsx`)
 * plus three new behaviours the spec introduces: a composed meta line (`albumMeta.ts`), a
 * Play/Shuffle actions pair, and a currently-playing track indicator. Favourite/add-to-playlist
 * keep their existing wiring — only *where* they render moved, into the header's `actions` slot
 * alongside Play/Shuffle (§9's option 1; §7 says their own behaviour is unchanged).
 *
 * Clicking a row starts a `features/music/musicQueue.ts` queue at that row, through
 * `jellyfinSource` (`features/player/playbackSource.ts`) — `musicQueueController.ts`'s
 * `beginMusicQueue` lays this page's already-loaded tracks out end to end on one cumulative
 * timeline (exactly how a multi-file audiobook already plays through its own file
 * boundaries, and exactly what `queue.ts`'s older `albumQueue` used to do directly here), so
 * playing track 3 continues into track 4 with no separate "queue" concept in the player
 * itself. Unlike `ItemPage.tsx`, there is no `POST /items/:id/play` round-trip to open
 * first — Jellyfin's proxied stream route is stateless, so `playerStore.load()` is called
 * with a `LibraryItem`/`PlaybackSession` pair synthesized here, client-side, rather than one
 * fetched from the BFF. `MediaSummary.kind: 'track'` (widened for exactly this) is what
 * tells `playerDisplayMeta`/`playerArtworkUrl` (`features/player/playerUi.ts`) to bill and
 * illustrate this differently from a real Audiobookshelf item — see those functions' own
 * doc comments.
 *
 * Play/Shuffle (§6) are sugar over that same per-track action, nothing more: Play starts the
 * queue from `tracks[0]`; Shuffle does the identical queue-start and then immediately calls
 * `useMusicQueueStore.getState().toggleShuffle()` once — safe unconditionally, since a
 * freshly-started queue always begins unshuffled, so one call reliably turns shuffle *on*.
 * Both omitted entirely when the album has no tracks (§5) — nothing to play.
 *
 * The "currently playing" row (§6) is computed the same way `playerDisplayMeta` already does
 * for billing: `trackAt(tracks, currentTime)` finds the `AudioTrack` the player's clock is
 * inside, and for a Jellyfin music queue `AudioTrack.contentUrl` holds that track's own
 * Jellyfin item id directly (see `AudioTrack`'s own doc comment in `api/types.ts`). Reused
 * here as the visual/accessible "active" idiom `ListItem` already has —
 * `selected`/`aria-current` — the same mechanism `QueueView.tsx` uses to mark the queue's
 * current entry.
 *
 * Unlike the old `albumQueue`-only design, the queue is **not** scoped to this page's own
 * 40-track window: `beginMusicQueue` is given the album's real `total` and a `fetchMore`
 * closure over `api.getJellyfinTracks`, so `musicQueueController.ts`'s `handleTrackEnded`
 * fetches the rest of the album lazily, only once playback actually advances past what's
 * already loaded here — see that file's own header for why lazily rather than eagerly (a
 * library-artist "play all" must not stall on a giant upfront fetch before sound starts).
 * Shuffle and repeat live on `useMusicQueueStore`, driven from `NowPlaying.tsx`'s transport
 * controls; this page never reads or writes them directly except for the one-shot
 * `toggleShuffle()` call the Shuffle button makes right after starting a fresh queue.
 */
import { useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { Button, ListItem, Skeleton, Snackbar, useSnackbar } from '@auralis/ui';
import type { JellyfinTrack, LibraryItem, PlaybackSession } from '../../api/types.js';
import { useApi } from '../../api/ApiContext.js';
import {
  JELLYFIN_PAGE_SIZE,
  TRACK_ORDER_SORT_BY,
  useJellyfinAlbumQuery,
  useJellyfinTracksQuery,
} from '../../api/queries.js';
import {
  MediaHeader,
  MEDIA_HEADER_SUBTITLE_CLASS,
  MEDIA_HEADER_SUBTITLE_LINK_CLASS,
} from '../../components/MediaHeader.js';
import { jellyfinSource } from '../player/playbackSource.js';
import { formatDuration, trackAt } from '../player/playback.js';
import { usePlayerStore } from '../../state/playerStore.js';
import { useMusicQueueStore } from '../../state/musicQueueStore.js';
import { AddToPlaylistButton } from './AddToPlaylistButton.js';
import { FavoriteToggle } from './FavoriteToggle.js';
import { TrackContextMenu } from './TrackContextMenu.js';
import { summarizePage } from './pagination.js';
import { attachMusicQueueEndedHandler, beginMusicQueue } from './musicQueueController.js';
import { toQueueTrack, type QueueTrack } from './musicQueue.js';
import { composeAlbumMeta } from './albumMeta.js';

function trackPosition(discNumber: number | null, trackNumber: number | null): string {
  if (trackNumber === null) return '';
  return discNumber !== null && discNumber > 1
    ? `${discNumber}.${trackNumber}`
    : String(trackNumber);
}

/** The row's accessible name — §9/§11's fix for a real, pre-existing web-side gap: the old
 * `aria-label={`Play ${track.name}`}` dropped duration entirely from what a screen reader
 * announces. Shape matches `PodcastDetailPage.tsx`'s episode row exactly (no "Play" verb
 * prefix): `"{name}, {duration}"`, plus `", Playing"` appended when `isActive` — literal
 * examples against the real fixture: `"Tidal Lines, 3:34"`, `"Tidal Lines, 3:34, Playing"`. */
function trackRowLabel(name: string, durationSeconds: number | null, isActive: boolean): string {
  const parts = [name];
  if (durationSeconds !== null) parts.push(formatDuration(durationSeconds));
  return isActive ? `${parts.join(', ')}, Playing` : parts.join(', ');
}

export function MusicAlbumPage() {
  const { albumId } = useParams({ from: '/music/album/$albumId' });
  const api = useApi();
  const [startIndex, setStartIndex] = useState(0);
  const snackbar = useSnackbar();

  const tracksQuery = useJellyfinTracksQuery(albumId, startIndex);
  const albumQuery = useJellyfinAlbumQuery(albumId);
  const tracks = tracksQuery.data?.items ?? [];
  // Captured once rather than re-indexed at each Play/Shuffle call site — `tracks[0]` alone
  // types as `JellyfinTrack | undefined` at every read, so this is the one place that's
  // narrowed, and every other read (§5's "omit Play/Shuffle" gate included) reuses it.
  const firstTrack = tracks[0];
  const albumName = firstTrack?.albumName ?? 'Album';
  const artistNames = firstTrack?.artistNames.join(', ') ?? '';
  const albumFavorite = albumQuery.data?.items[0]?.favorite ?? false;
  // Every track on this page belongs to this one album, so its artist id (unlike
  // `JellyfinTrack`, which carries none — see `trackContextMenu.ts`'s own doc comment) is
  // available here from the album fetch and the same for every row's context menu.
  const albumArtistId = albumQuery.data?.items[0]?.artistId ?? null;
  const page = tracksQuery.data
    ? summarizePage({ startIndex, limit: 40 }, tracksQuery.data.total, tracks.length)
    : null;

  // §5's meta-line contract: track count is `null` (meta renders as `null`, the whole line
  // omitted) until the first page has loaded; once known it is *always* included, even `0`
  // for a genuinely empty album. Duration is only computable when the whole album fits in
  // one page (`total <= JELLYFIN_PAGE_SIZE`) — summing every loaded track's own duration,
  // skipping a `null` one rather than making the whole segment `null` for a partially-tagged
  // album. Guarded on `total > 0` too: a literal "0 m" for a track-less album would be a
  // spurious segment the "0 tracks" count already communicates on its own.
  const total = tracksQuery.data?.total ?? null;
  const durationSeconds =
    total !== null && total > 0 && total <= JELLYFIN_PAGE_SIZE
      ? tracks.reduce((sum, track) => sum + (track.durationSeconds ?? 0), 0)
      : null;
  const albumMetaLine = composeAlbumMeta({
    productionYear: albumQuery.data?.items[0]?.productionYear ?? null,
    genre: albumQuery.data?.items[0]?.genres[0] ?? null,
    trackCount: total,
    durationSeconds,
  });

  // The currently-playing track, by the same Jellyfin-item-id-in-`contentUrl` mechanism
  // `playerDisplayMeta` already uses for billing (`AudioTrack`'s own doc comment,
  // `api/types.ts`) — reactive, so the active row moves as playback crosses track boundaries.
  const activeTrackId = usePlayerStore(
    (state) => trackAt(state.tracks, state.currentTime)?.track.contentUrl ?? null,
  );

  const onFavoriteError = () =>
    snackbar.enqueue({ message: "Couldn't update favourite — try again." });
  const onPlaylistError = () =>
    snackbar.enqueue({ message: "Couldn't update that playlist — try again." });
  const onAdded = () => snackbar.enqueue({ message: 'Added to playlist.' });
  const onQueueMessage = (message: string) => snackbar.enqueue({ message });

  const playTrack = (clicked: JellyfinTrack) => {
    const queueTracks: QueueTrack[] = tracks.map(toQueueTrack);
    const clickedIndex = tracks.findIndex((track) => track.id === clicked.id);
    // `clickedIndex` always matches a real `queueTracks` entry — built from this same
    // `tracks` array, in the same order, one-to-one — so this only falls back to the queue's
    // own start if a row is somehow clicked after its track left `tracks` (e.g. a slow click
    // racing a page change), rather than throwing on a stale reference.
    const startIndex = clickedIndex === -1 ? 0 : clickedIndex;
    const total = tracksQuery.data?.total ?? tracks.length;
    const { audioTracks, duration, startTrack } = beginMusicQueue(
      queueTracks,
      total,
      startIndex,
      (fetchStartIndex, limit) =>
        api
          .getJellyfinTracks(
            { albumId, startIndex: fetchStartIndex, limit, sortBy: TRACK_ORDER_SORT_BY },
            undefined,
          )
          .then((page) => page.items.map(toQueueTrack)),
    );
    const item: LibraryItem = {
      id: albumId,
      // Jellyfin has no "library id" surfaced to this page; inert, `load()` never reads it.
      libraryId: '',
      coverPath: null,
      media: { kind: 'track', title: albumName, author: artistNames || null },
      progress: null,
    };
    const session: PlaybackSession = {
      id: `jellyfin-album-${albumId}`,
      libraryItemId: albumId,
      episodeId: null,
      // Inert — `playerStore.load()` never reads `mediaType`; present only to satisfy the type.
      mediaType: 'book',
      displayTitle: startTrack?.title ?? albumName,
      duration,
      currentTime: startTrack?.startOffset ?? 0,
      audioTracks,
      chapters: [],
    };
    // A getter, not `audioTracks` itself: `musicQueueStore.ts`'s `applyQueue` replaces
    // `playerStore.tracks` after shuffle/cross-page/repeat-wrap without ever reconstructing
    // this source, so the reporter must read the live array on every tick — see
    // `jellyfinSource`'s own doc comment in `playbackSource.ts`.
    usePlayerStore.getState().load(
      item,
      session,
      jellyfinSource(api, () => usePlayerStore.getState().tracks),
    );
    attachMusicQueueEndedHandler();
    usePlayerStore.getState().play();
  };

  const handleShuffle = () => {
    if (!firstTrack) return;
    playTrack(firstTrack);
    // Safe unconditionally: `playTrack` above always starts a *fresh* queue, and a
    // freshly-started queue always begins unshuffled, so one call reliably turns shuffle on
    // (never back off) — see this file's own doc comment and `musicQueueStore.ts:64-68`.
    useMusicQueueStore.getState().toggleShuffle();
  };

  return (
    <div className="auralis-page" data-testid="music-album-page">
      <MediaHeader
        coverSrc={api.jellyfinArtworkUrl(albumId)}
        fallbackIcon="music_note"
        kindLabel="Album"
        title={albumName}
        titleTestId="music-album-name"
        subtitle={
          artistNames ? (
            albumArtistId ? (
              <Link
                to="/music/artist/$artistId"
                params={{ artistId: albumArtistId }}
                className={`${MEDIA_HEADER_SUBTITLE_CLASS} ${MEDIA_HEADER_SUBTITLE_LINK_CLASS}`}
                data-testid="music-album-artist-link"
              >
                {artistNames}
              </Link>
            ) : (
              <p className={MEDIA_HEADER_SUBTITLE_CLASS}>{artistNames}</p>
            )
          ) : null
        }
        meta={albumMetaLine}
        actions={
          <>
            {firstTrack ? (
              <>
                <Button data-testid="music-album-play" onClick={() => playTrack(firstTrack)}>
                  Play
                </Button>
                <Button
                  variant="outlined"
                  data-testid="music-album-shuffle"
                  onClick={handleShuffle}
                >
                  Shuffle
                </Button>
              </>
            ) : null}
            <FavoriteToggle
              itemId={albumId}
              itemName={albumName}
              favorite={albumFavorite}
              stopPropagation={false}
              onError={onFavoriteError}
              data-testid="music-album-favorite"
            />
            <AddToPlaylistButton
              tracks={tracks}
              label={albumName}
              stopPropagation={false}
              onError={onPlaylistError}
              onAdded={onAdded}
              data-testid="music-album-add-to-playlist"
            />
          </>
        }
      />

      {tracksQuery.isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} shape="rectangular" width="100%" height={56} />
          ))}
        </div>
      ) : tracksQuery.isError ? (
        <p role="alert">Couldn't load this album's tracks: {tracksQuery.error.message}</p>
      ) : tracks.length === 0 ? (
        <p>No tracks found for this album.</p>
      ) : (
        <>
          <div data-testid="music-track-list" style={{ display: 'flex', flexDirection: 'column' }}>
            {tracks.map((track) => {
              const isActive = track.id === activeTrackId;
              return (
                <TrackContextMenu
                  key={track.id}
                  track={{
                    id: track.id,
                    name: track.name,
                    albumId: track.albumId,
                    artistId: albumArtistId,
                  }}
                  queueTrack={toQueueTrack(track)}
                  onMessage={onQueueMessage}
                  renderRow={(moreActionsButton) => (
                    <ListItem
                      data-testid={`music-track-${track.id}`}
                      aria-label={trackRowLabel(track.name, track.durationSeconds, isActive)}
                      selected={isActive}
                      onClick={() => playTrack(track)}
                      leading={<span>{trackPosition(track.discNumber, track.trackNumber)}</span>}
                      headline={track.name}
                      supportingText={
                        track.durationSeconds !== null
                          ? formatDuration(track.durationSeconds)
                          : undefined
                      }
                      trailing={
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <AddToPlaylistButton
                            tracks={[track]}
                            label={track.name}
                            onError={onPlaylistError}
                            onAdded={onAdded}
                            data-testid={`music-track-add-to-playlist-${track.id}`}
                          />
                          <FavoriteToggle
                            itemId={track.id}
                            itemName={track.name}
                            favorite={track.favorite}
                            onError={onFavoriteError}
                            data-testid={`music-track-favorite-${track.id}`}
                          />
                          {moreActionsButton}
                        </div>
                      }
                    />
                  )}
                />
              );
            })}
          </div>

          {page ? (
            <div
              data-testid="music-tracks-pagination"
              style={{ display: 'flex', gap: 8, alignItems: 'center' }}
            >
              <Button
                variant="outlined"
                size="sm"
                disabled={!page.hasPrevious}
                onClick={() => setStartIndex(page.previousStartIndex ?? 0)}
                data-testid="music-tracks-prev"
              >
                Previous
              </Button>
              <span>{page.rangeLabel}</span>
              <Button
                variant="outlined"
                size="sm"
                disabled={!page.hasNext}
                onClick={() => setStartIndex(page.nextStartIndex ?? 0)}
                data-testid="music-tracks-next"
              >
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}
      <Snackbar snackbar={snackbar.current} onDismiss={snackbar.dismiss} />
    </div>
  );
}
