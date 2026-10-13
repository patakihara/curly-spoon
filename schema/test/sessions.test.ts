import { describe, expect, it } from 'vitest';
import { generateKotlin } from '../codegen/kotlin.js';
import { buildOpenApiDocument } from '../codegen/openapi.js';
import { ErrorResponse, PLAYED_SHOWN, QueueView, type Route } from '../src/index.js';

const album = { source: 'jellyfin', id: '65de8562c54b89ceef199f91bacd8709' } as const;
const track = { source: 'jellyfin', id: '7c8b8e35000000000000000000000000' } as const;
const next = { source: 'jellyfin', id: 'aa0cc2edfb53c73036b2da94640ea11d' } as const;

const label = { title: 'A track', sub: 'An artist', duration: 242 };
const entry = (n: number) => ({
  itemId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  ref: track,
  ...label,
});
const played = (seq: number) => ({
  seq,
  queue: 'music',
  ref: track,
  playedAt: 1_760_000_000_000 + seq,
  ...label,
});

const view = {
  type: 'music',
  current: entry(1),
  position: { ms: 12_000, takenAt: 1_760_000_000_000 },
  user: [entry(2)],
  context: { from: { kind: 'album', ref: album }, items: [entry(3)] },
  rev: 4,
  autoplay: { ref: next, title: 'Next up', sub: null, duration: null },
  played: [played(0), played(1)],
};

describe('the queue view', () => {
  it('labels every entry, current, queued and from the context, with its title, sub and duration', () => {
    expect(QueueView.parse(view)).toEqual(view);
  });

  it("names autoplay's kept pick, or nothing when it has none", () => {
    expect(QueueView.parse({ ...view, autoplay: null }).autoplay).toBeNull();
    const chapter = { ...view.autoplay, chapter: 2 };
    expect(QueueView.parse({ ...view, autoplay: chapter }).autoplay).toEqual(chapter);
  });

  it(`lists at most the newest ${PLAYED_SHOWN} plays`, () => {
    const many = Array.from({ length: PLAYED_SHOWN + 1 }, (_, seq) => played(seq));
    expect(QueueView.safeParse({ ...view, played: many.slice(1) }).success).toBe(true);
    expect(QueueView.safeParse({ ...view, played: many }).success).toBe(false);
  });

  it('refuses an entry without its label', () => {
    const { title: _title, ...unlabelled } = entry(2);
    expect(QueueView.safeParse({ ...view, user: [unlabelled] }).success).toBe(false);
  });

  it('generates Kotlin models', () => {
    const route = {
      method: 'GET',
      path: '/api/view',
      operationId: 'view',
      summary: 'view',
      responseDescription: 'view',
      response: QueueView,
      access: 'member',
    } as const satisfies Route;
    const doc = JSON.parse(JSON.stringify(buildOpenApiDocument([route], ErrorResponse))) as object;
    const kotlin = generateKotlin(doc, 'test');
    expect(kotlin).toContain('    val current: QueueViewItem?,\n');
    expect(kotlin).toContain('    val autoplay: QueueViewAutoplay?,\n');
    expect(kotlin).toContain('    val played: List<QueueViewPlayed>,\n');
  });
});
