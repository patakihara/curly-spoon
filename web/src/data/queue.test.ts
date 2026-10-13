import { type QueueType, QueueView, type QueueViewItem } from '@auralis/schema';
import { describe, expect, it } from 'vitest';
import { emptyQueue, QUEUES, queueData } from './queue';

let n = 0;
const entry = (title: string, duration: number | null = 240): QueueViewItem => ({
  itemId: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  ref: { source: 'abs', id: title.toLowerCase().replaceAll(' ', '-') },
  title,
  sub: 'Rosa Elin',
  duration,
});

const view = (type: QueueType, over: Partial<QueueView>): QueueView =>
  QueueView.parse({
    type,
    current: null,
    position: null,
    user: [],
    context: null,
    rev: 3,
    autoplay: null,
    played: [],
    ...over,
  });

const titles = (rows: { title: string }[]) => rows.map((r) => r.title);

describe('[M1.shell] the queue page from GET /api/queues/{active}', () => {
  it('shows what plays now, then your queue and what is left of playing-from as up next', () => {
    const now = entry('Femininomenon', 219);
    const data = queueData(
      view('music', {
        current: now,
        user: [entry('Red Wine Supernova', 193)],
        context: {
          from: { kind: 'album', ref: { source: 'abs', id: 'album' } },
          items: [entry('After Midnight', 254)],
        },
      }),
      null,
    );
    expect(data.queue).toBe('music');
    expect(data.queues).toEqual(QUEUES);
    expect(data.items[0]).toEqual({
      id: now.itemId,
      title: 'Femininomenon',
      sub: 'Rosa Elin',
      time: '3:39',
      image: '',
      current: true,
    });
    expect(titles(data.items.slice(1))).toEqual(['Red Wine Supernova', 'After Midnight']);
    expect(data.context).toBe('Music queue · 2 songs, 7 min');
  });

  it('runs up next on into the other queue when the session moves over after the current item', () => {
    const data = queueData(
      view('music', { current: entry('Femininomenon'), user: [entry('Casual')] }),
      view('spoken', { current: entry('Part Two', 2790), user: [entry('Part Three', 2791)] }),
    );
    const next = data.items.slice(1);
    expect(titles(next)).toEqual(['Part Two', 'Part Three', 'Casual']);
    expect(next[0]).toMatchObject({ handoff: 'Then the spoken queue' });
    expect(next[2]).toMatchObject({ waiting: 'Waiting in the music queue' });
    expect(next[1]).not.toHaveProperty('handoff');
  });

  it('lists what played, newest last, and autoplay’s kept pick', () => {
    const data = queueData(
      view('spoken', {
        current: entry('Part Two'),
        played: [
          {
            seq: 4,
            queue: 'spoken',
            ref: { source: 'abs', id: 'one' },
            playedAt: 1,
            title: 'Part One',
            sub: null,
            duration: null,
          },
        ],
        autoplay: {
          ref: { source: 'abs', id: 'three' },
          title: 'Part Three',
          sub: null,
          duration: 60,
        },
      }),
      null,
    );
    expect(data.played).toEqual([
      { id: 'played-4', title: 'Part One', sub: '', time: '', image: '' },
    ]);
    expect(data.autoplay.items).toEqual([
      { id: 'autoplay', title: 'Part Three', sub: '', time: '1:00', image: '' },
    ]);
    expect(data.context).toBe('Spoken queue');
  });

  it('lists only what played on the queue it shows, never the other queue’s plays', () => {
    const played = (seq: number, queue: QueueType, title: string) => ({
      seq,
      queue,
      ref: { source: 'abs' as const, id: `item-${seq}` },
      playedAt: seq,
      title,
      sub: null,
      duration: null,
    });
    const data = queueData(
      view('music', {
        played: [
          played(1, 'music', 'A Song'),
          played(2, 'spoken', 'A Chapter'),
          played(3, 'music', 'B Song'),
        ],
      }),
      null,
    );
    expect(titles(data.played)).toEqual(['A Song', 'B Song']);
  });

  it('shows an empty queue named for the queue the controls drive', () => {
    expect(emptyQueue('spoken')).toEqual({
      context: 'Spoken queue',
      queues: QUEUES,
      queue: 'spoken',
      played: [],
      items: [],
      autoplay: { title: '', items: [] },
    });
  });
});
