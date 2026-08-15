/**
 * Adapts `@auralis/jellyfin-client` `Album`/`Track` domain objects into this feature's
 * `RecommendationCandidate`/`ProgressSignal` shapes, the same job `adapt.ts` does for
 * Audiobookshelf's `LibraryItem`. Lives here rather than in `packages/jellyfin-client`
 * for the same reason as `adapt.ts` — the scoring core is deliberately I/O- and
 * client-free (see `types.ts`'s header comment).
 *
 * **The recommendable unit is the album, not the track.** A shelf of individual tracks
 * reads as a playlist, not a "for you" carousel — `getLibraryHome`/`getLibraryRecommended`
 * on the books side recommend whole books, never chapters, and this mirrors that.
 */
import type { Album, Track } from '@auralis/jellyfin-client';
import type { ProgressSignal, RecommendationCandidate } from './types.js';

/**
 * Maps one album to a candidate. Genres come straight off the album (Jellyfin populates
 * `Genres` on `MusicAlbum` items directly, unlike Audiobookshelf's minified-item split —
 * see `docs/HANDOVER.md`'s "minified-item bug" section, which does not apply here: there
 * is no separate "expanded album" shape this data is missing from).
 *
 * The album's primary artist is folded into a one-element `authors` array — the same
 * fold `adapt.ts` uses for a podcast's flat `author` string, so genre/author affinity
 * works uniformly across every media kind the scoring core sees. A missing/blank artist
 * name yields `[]`, never a `[{ name: '' }]` that would let a blank string accumulate
 * affinity weight as if it were a real artist.
 *
 * `series`/`narrator` have no music equivalent and are always empty/`null` — same
 * reasoning as `adapt.ts`'s podcast fold.
 */
export function albumToCandidate(album: Album): RecommendationCandidate {
  const authors =
    album.artistName && album.artistName.trim().length > 0 ? [{ name: album.artistName }] : [];

  return {
    id: album.id,
    media: {
      kind: 'album',
      title: album.name,
      genres: album.genres,
      authors,
      series: [],
      narrator: null,
    },
  };
}

/**
 * Builds one `ProgressSignal` per album from a flat list of tracks, by summing each
 * track's `playCount` and taking the latest `lastPlayedAt` across every track that
 * belongs to it.
 *
 * **Why tracks, not the album's own `playCount`/`lastPlayedAt` fields.** A track is the
 * finest-grained unit Jellyfin reports `UserData` on (see `Track.playCount`'s doc comment
 * in `packages/jellyfin-client/src/domain.ts`, added in wave 13e-1 specifically for this
 * wave to read) — whether a music-folder *container* item's own `UserData.PlayCount`
 * aggregates its children server-side is unverified (`docs/HANDOVER.md`'s "only partly
 * verified against reality" section: nobody here has a real Jellyfin credential to check).
 * Aggregating from tracks avoids depending on that unverified aggregation while still
 * producing one signal keyed to the album id — which matters because `scoreCandidates`
 * excludes a candidate from being recommended by checking `profile.knownItemIds` against
 * the *candidate's own* id (the album id here), so a per-track signal that never rolled
 * up to its album id would silently fail to exclude an album the user already plays
 * heavily.
 *
 * **The `isFinished`/`progress` mapping.** Music has no equivalent of a book's finish
 * state or 0..1 position — Jellyfin's `UserData` only ever gives a play *count*, not a
 * fraction listened. Rather than inventing a fake progress fraction from that count (which
 * `score.ts`'s weight formula wouldn't even use — see below), any album with at least one
 * counted play maps to `isFinished: true`, the same "strongest engagement tier" a finished
 * book gets: a play is a completed, deliberate listen, not a partial attempt the way an
 * abandoned book chapter would be. `progress` is set to `1` for documentation honesty (it
 * reflects "fully engaged") but is never actually read by `profile.ts`'s `signalWeight` —
 * that function only consults `progress` when `isFinished` is `false`. Albums with zero
 * total plays across all their tracks get **no signal at all**, not a zero-weight one:
 * `buildTasteProfile` only adds an item to `knownItemIds` when a signal names it, and an
 * unplayed album has no progress to report, positive or otherwise.
 *
 * **What is lost by this simplification, stated plainly**: play count *magnitude* carries
 * no extra weight — an album played once and an album played fifty times contribute the
 * same base weight (`FINISHED_BASE_WEIGHT`, capped, same as every "finished" item in this
 * feature). Only recency (`lastPlayedAt`) differentiates them, via the same decay curve
 * `profile.ts` already applies to everything else. A future wave could scale weight by
 * play count if that turns out to matter against a real library — this wave does not,
 * to stay consistent with how the books side already treats "finished" as a ceiling
 * rather than a scale.
 */
export function buildMusicProgressSignals(tracks: Track[]): ProgressSignal[] {
  const byAlbum = new Map<string, { totalPlayCount: number; lastPlayedAt: number | null }>();

  for (const track of tracks) {
    if (!track.albumId) continue; // No album to attribute this play to — nothing to aggregate into.
    const acc = byAlbum.get(track.albumId) ?? { totalPlayCount: 0, lastPlayedAt: null };
    acc.totalPlayCount += track.playCount;
    if (
      track.lastPlayedAt !== null &&
      (acc.lastPlayedAt === null || track.lastPlayedAt > acc.lastPlayedAt)
    ) {
      acc.lastPlayedAt = track.lastPlayedAt;
    }
    byAlbum.set(track.albumId, acc);
  }

  const signals: ProgressSignal[] = [];
  for (const [albumId, acc] of byAlbum) {
    if (acc.totalPlayCount <= 0) continue; // Never played — no signal, not noise.
    signals.push({
      itemId: albumId,
      progress: 1,
      isFinished: true,
      lastActivityAt: acc.lastPlayedAt,
    });
  }
  return signals;
}
