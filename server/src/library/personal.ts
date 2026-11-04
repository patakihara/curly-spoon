/**
 * A person's own library, the one view every route takes it from: what they requested, added,
 * subscribed to or played (their claims), or with `showEveryonesLibrary`, everything indexed.
 */
import { type LibraryEntryKind, type MediaRef, mediaRefKey } from '@auralis/schema';
import { indexedRow, type StoredRow, topLevelOfKind } from '../libraryIndex/store.js';
import { claimsOf } from '../store/claims.js';
import type { Db } from '../store/connection.js';
import { readSettings } from '../store/settings.js';

export interface PersonalView {
  /** Whether the person sees everything indexed. */
  everyone: boolean;
  /** Whether a top-level book, show or album is theirs. */
  holds(ref: MediaRef): boolean;
  /** The refs of everyone and everything their claimed items name: people and series. */
  names(): Set<string>;
}

/** A person's library as it stands now. */
export function personalView(db: Db, userId: string): PersonalView {
  const { showEveryonesLibrary: everyone } = readSettings(db, userId);
  const claims = claimsOf(db, userId).map(({ ref }) => ref);
  const mine = new Set(claims.map(mediaRefKey));
  return {
    everyone,
    holds: (ref) => everyone || mine.has(mediaRefKey(ref)),
    names: () => {
      const named = new Set<string>();
      for (const { source, id } of claims) {
        const row = indexedRow(db, source, id);
        for (const creator of row?.creators ?? []) {
          if (creator.id !== undefined) named.add(mediaRefKey({ source, id: creator.id }));
        }
        for (const one of row?.series ?? []) named.add(mediaRefKey({ source, id: one.id }));
      }
      return named;
    },
  };
}

/** The indexed books, shows or albums in a person's own library. */
export function personalRows(db: Db, userId: string, kind: LibraryEntryKind): StoredRow[] {
  const view = personalView(db, userId);
  return topLevelOfKind(db, kind).filter((row) => view.holds({ source: row.source, id: row.id }));
}
