/**
 * Hand-written synthetic fixtures shared by this feature's three test files.
 * Titles, authors, genres and narrators are all invented — never real titles from
 * the user's library (see `docs/HANDOVER.md`'s "never commit real credentials or
 * the user's data" convention, extended here to library contents on principle).
 */
import type { ProgressSignal, RecommendationCandidate } from './types.js';

export function book(
  id: string,
  opts: {
    title: string;
    genres?: string[];
    authors?: string[];
    series?: string[];
    narrator?: string | null;
  },
): RecommendationCandidate {
  return {
    id,
    media: {
      kind: 'book',
      title: opts.title,
      genres: opts.genres ?? [],
      authors: (opts.authors ?? []).map((name) => ({ name })),
      series: (opts.series ?? []).map((name) => ({ name })),
      narrator: opts.narrator ?? null,
    },
  };
}

export function signal(
  itemId: string,
  opts: { progress: number; isFinished: boolean; lastActivityAt: number | null },
): ProgressSignal {
  return {
    itemId,
    progress: opts.progress,
    isFinished: opts.isFinished,
    lastActivityAt: opts.lastActivityAt,
  };
}

/** A fixed "now" so decay-based tests are deterministic and readable in days. */
export const NOW = Date.UTC(2026, 0, 1); // 2026-01-01T00:00:00Z
export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A small synthetic library: two finished/near-finished "seed" books that share
 * facets (genre/author/narrator/series) with several unread candidates, plus a
 * couple of candidates that share nothing at all (used to prove non-matches score
 * zero and are excluded).
 */
export const library: RecommendationCandidate[] = [
  book('seed-finished', {
    title: 'Ashes of Aeon',
    genres: ['Fantasy', 'Epic'],
    authors: ['Rin Calder'],
    narrator: 'Jo Marsh',
    series: ['Aeonfall'],
  }),
  book('seed-abandoned', {
    title: 'The Long Static',
    genres: ['Sci-Fi'],
    authors: ['Priya Osei'],
    narrator: 'Dev Okafor',
  }),
  book('cand-genre-match', {
    title: 'Fire Above the Wall',
    genres: ['Fantasy'],
    authors: ['Someone Else'],
  }),
  book('cand-author-match', {
    title: 'Calder’s Second Storm',
    genres: ['Adventure'],
    authors: ['Rin Calder'],
  }),
  book('cand-narrator-match', {
    title: 'Voices in the Hollow',
    genres: ['Horror'],
    narrator: 'Jo Marsh',
  }),
  book('cand-series-match', {
    title: 'Aeonfall: Book Two',
    genres: ['Epic'],
    series: ['Aeonfall'],
  }),
  book('cand-multi-match', {
    title: 'Rin Calder’s Fantasy Primer',
    genres: ['Fantasy'],
    authors: ['Rin Calder'],
  }),
  book('cand-author-match-2', {
    title: 'Calder’s Quiet Years',
    genres: ['Mystery'],
    authors: ['Rin Calder'],
  }),
  book('cand-no-match', {
    title: 'Unrelated Cookbook',
    genres: ['Cooking'],
    authors: ['Nobody Known'],
  }),
  book('cand-no-match-2', {
    title: 'Totally Different Topic',
    genres: ['History'],
    authors: ['Also Unknown'],
  }),
];
