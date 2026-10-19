import { describe, expect, it } from 'vitest';
import { generateKotlin } from '../codegen/kotlin.js';
import { buildOpenApiDocument } from '../codegen/openapi.js';
import { ErrorResponse, getLyrics, LyricLine, Lyrics, routes } from '../src/index.js';

const track = { source: 'jellyfin', id: 'e8f41d8c866537d45dcb8bdd002516ca' } as const;

describe("a track's lyrics", () => {
  it('carry synced lines timed in seconds from a source', () => {
    const synced = {
      ref: track,
      status: 'synced',
      source: 'jellyfin',
      lines: [
        { start: 5.89, text: 'a line' },
        { start: 9.1, text: '' },
      ],
    };
    expect(Lyrics.parse(synced)).toEqual(synced);
  });

  it('carry plain lines untimed, and none with no source and no lines', () => {
    const plain = {
      ref: track,
      status: 'plain',
      source: 'lrclib',
      lines: [{ start: null, text: 'x' }],
    };
    expect(Lyrics.parse(plain)).toEqual(plain);
    const none = { ref: track, status: 'none', source: null, lines: [] };
    expect(Lyrics.parse(none)).toEqual(none);
  });

  it('refuse a status or source they do not know, and a negative or unreadable start', () => {
    const base = { ref: track, status: 'synced', source: 'jellyfin', lines: [] };
    expect(Lyrics.safeParse({ ...base, status: 'karaoke' }).success).toBe(false);
    expect(Lyrics.safeParse({ ...base, source: 'genius' }).success).toBe(false);
    expect(LyricLine.safeParse({ start: -1, text: 'x' }).success).toBe(false);
    expect(LyricLine.safeParse({ start: Infinity, text: 'x' }).success).toBe(false);
  });

  it('are read by a signed-in member at /api/lyrics/{ref}', () => {
    expect(getLyrics).toMatchObject({
      method: 'GET',
      path: '/api/lyrics/{ref}',
      access: 'member',
    });
    expect(routes).toContain(getLyrics);
  });

  it('generate Kotlin models: status and source as enums, the source and a start nullable', () => {
    const doc = buildOpenApiDocument([getLyrics], ErrorResponse);
    const kotlin = generateKotlin(JSON.parse(JSON.stringify(doc)) as object, 'test');
    expect(kotlin).toContain('data class Lyrics(');
    expect(kotlin).toContain('data class LyricLine(');
    expect(kotlin).toContain('enum class LyricsStatus');
    expect(kotlin).toContain('enum class LyricsSource');
    expect(kotlin).toContain('    val source: LyricsSource?,');
    expect(kotlin).toContain('    val start: Double?,');
  });
});
