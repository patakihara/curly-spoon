import { describe, expect, it } from 'vitest';
import { generateKotlin } from '../codegen/kotlin.js';
import { buildOpenApiDocument } from '../codegen/openapi.js';
import {
  ErrorResponse,
  PlaybackMeta,
  PlaybackPlan,
  ProgressAnswer,
  type Route,
} from '../src/index.js';

describe("a plan's meta", () => {
  it('names what plays, its artist, author or show, its art and whether it is music or spoken', () => {
    for (const meta of [
      {
        title: 'Powers',
        sub: 'Ursula K. Le Guin',
        art: '/api/media/abs:7b3fa64c/art',
        variant: 'spoken',
      },
      { title: 'A track', sub: null, art: null, variant: 'music' },
    ]) {
      expect(PlaybackMeta.parse(meta)).toEqual(meta);
    }
  });

  it('is on every plan: a plan that does not name what it plays is refused', () => {
    const plan = {
      meta: { title: 'A track', sub: null, art: null, variant: 'music' },
      tracks: [
        { url: '/api/media/jellyfin:a/tracks/0', mime: 'audio/flac', duration: 1, offset: 0 },
      ],
      chapters: [],
      startAt: 0,
      progressTarget: { playId: 'p' },
    };
    expect(PlaybackPlan.parse(plan)).toEqual(plan);
    const { meta: _meta, ...unnamed } = plan;
    expect(PlaybackPlan.safeParse(unnamed).success).toBe(false);
  });

  it('refuses a variant other than music or spoken, and art this server does not serve', () => {
    const meta = { title: 'A track', sub: null, art: null, variant: 'music' };
    expect(PlaybackMeta.safeParse({ ...meta, variant: 'video' }).success).toBe(false);
    expect(PlaybackMeta.safeParse({ ...meta, art: 'https://elsewhere/a.jpg' }).success).toBe(false);
  });

  it('generates a Kotlin model with the variant as its own enum', () => {
    const route = {
      method: 'GET',
      path: '/api/meta',
      operationId: 'meta',
      summary: 'meta',
      responseDescription: 'meta',
      response: PlaybackMeta,
      access: 'member',
    } as const satisfies Route;
    const doc = JSON.parse(JSON.stringify(buildOpenApiDocument([route], ErrorResponse))) as object;
    const kotlin = generateKotlin(doc, 'test');
    expect(kotlin).toContain('    val variant: PlaybackVariant,\n');
    expect(kotlin).toContain('enum class PlaybackVariant {');
  });
});

describe('a progress answer', () => {
  it('may say where in the plan the play must stop', () => {
    expect(ProgressAnswer.parse({ taken: true, lastSeq: 3, endAt: 1200.5 })).toEqual({
      taken: true,
      lastSeq: 3,
      endAt: 1200.5,
    });
    expect(ProgressAnswer.parse({ taken: true, lastSeq: 3 })).toEqual({ taken: true, lastSeq: 3 });
  });

  it('refuses a stop before the start of the item', () => {
    expect(ProgressAnswer.safeParse({ taken: true, lastSeq: 3, endAt: -1 }).success).toBe(false);
  });
});
