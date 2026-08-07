/**
 * Builds the context-menu items for a song row (`docs/ROADMAP.md` §12e) — long-press/
 * right-click on a track offering "Play next", "Play last", "Go to album" and "Go to artist".
 * The floor set the user asked for is four items; this module adds a fifth ("Go to lyrics")
 * only when a track's page can show one — see `hasLyrics` below.
 *
 * Kept pure and separate from `TrackContextMenu.tsx` so the "which items appear for which
 * track" logic — the part with real branching — is unit-testable without React or Playwright.
 * `albumId`/`artistId` are each independently nullable: a track can genuinely lack either (a
 * Jellyfin single with no album, or — today, always — no `artistId` at all; see this module's
 * own `TrackMenuContext` doc comment) and the corresponding item must not render rather than
 * navigate to a dead route.
 *
 * No fifth item: "Go to lyrics" was the obvious candidate (`features/music/lyrics.ts` already
 * has synced-lyrics data), but there is no `/music/lyrics/:trackId` route to navigate to —
 * lyrics only render inline inside `NowPlaying.tsx` for whatever is *currently playing*, not
 * as a page any other track could open. Adding the route is a bigger change than this wave's
 * scope; the floor set (four items) stands as the ceiling too.
 */
import type { MenuItemDescriptor } from '@auralis/ui';

export interface TrackMenuContext {
  /** `null` when this track has no album (a single) — omits "Go to album". */
  albumId: string | null;
  /**
   * `null` when this track's artist id is unknown — omits "Go to artist". Always `null`
   * today for a track read directly off `JellyfinTrack` (`apps/web/src/api/types.ts`), which
   * carries `artistNames: string[]` but no `artistId` at all; a caller with a known artist id
   * from elsewhere (e.g. an album's own `JellyfinAlbum.artistId`, shared by every track on
   * that album) passes it through here instead of leaving this permanently `null`. See
   * `TrackContextMenu.tsx`'s own doc comment for which call sites can and can't supply one.
   */
  artistId: string | null;
}

export interface TrackMenuHandlers {
  playNext: () => void;
  playLast: () => void;
  goToAlbum: (albumId: string) => void;
  goToArtist: (artistId: string) => void;
}

export function buildTrackMenuItems(
  ctx: TrackMenuContext,
  handlers: TrackMenuHandlers,
): MenuItemDescriptor[] {
  const items: MenuItemDescriptor[] = [
    { key: 'play-next', label: 'Play next', onSelect: handlers.playNext },
    { key: 'play-last', label: 'Play last', onSelect: handlers.playLast },
  ];
  if (ctx.albumId !== null) {
    const albumId = ctx.albumId;
    items.push({
      key: 'go-to-album',
      label: 'Go to album',
      onSelect: () => handlers.goToAlbum(albumId),
    });
  }
  if (ctx.artistId !== null) {
    const artistId = ctx.artistId;
    items.push({
      key: 'go-to-artist',
      label: 'Go to artist',
      onSelect: () => handlers.goToArtist(artistId),
    });
  }
  return items;
}
