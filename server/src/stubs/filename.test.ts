/**
 * An episode's file name, against names Audiobookshelf itself gave the same feed items
 * (fixtures/filename-vectors.json says how they were taken).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { episodeFilename, episodeFilenames } from './filename.js';

const Vectors = z.object({
  source: z.string(),
  vectors: z.array(
    z.object({
      title: z.string(),
      enclosureUrl: z.string(),
      filename: z.string(),
      oldStubgen: z.string().optional(),
    }),
  ),
});
const { vectors } = Vectors.parse(
  JSON.parse(readFileSync(new URL('./fixtures/filename-vectors.json', import.meta.url), 'utf8')),
);

describe('[M3.stubs/b] an episode’s file name is the one Audiobookshelf gives its own download', () => {
  it.each(vectors.map((v) => [v.filename || '(empty)', v] as const))(
    '[M3.stubs/b] %s',
    (_, vector) => {
      expect(episodeFilename(vector.title, vector.enclosureUrl)).toBe(vector.filename);
    },
  );

  it('[M3.stubs/b] a long title cut just after a space loses the space, as ABS does and the old stubgen did not', () => {
    const cut = vectors.find((v) => v.oldStubgen !== undefined);
    expect(cut?.oldStubgen).toMatch(/ \.mp3$/);
    expect(episodeFilename(cut?.title, cut?.enclosureUrl ?? '')).toBe(cut?.filename);
    expect(cut?.filename).toMatch(/A\.mp3$/);
  });

  it('[M3.stubs/a] the names looked for on disk are ABS’s, then the old stubgen’s cut with its space', () => {
    const cut = vectors.find((v) => v.oldStubgen !== undefined);
    expect(episodeFilenames(cut?.title, cut?.enclosureUrl ?? '')).toEqual([
      cut?.filename,
      cut?.oldStubgen,
    ]);
    expect(episodeFilenames('Bullshit Jobs', 'https://example.org/a.mp3')).toEqual([
      'Bullshit Jobs.mp3',
    ]);
  });

  it('[M3.stubs/a] a title that sanitizes to nothing has no name', () => {
    expect(episodeFilenames('con', 'https://example.org/a.mp3')).toEqual([]);
  });
});
