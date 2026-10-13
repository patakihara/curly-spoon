import { type QueueType, type QueueView, type QueueViewItem } from '@auralis/schema';
import { type QueueData } from '../generated/pages/Queue';
import { clock, span } from './format';

/**
 * The queue page's data: the queue the controls drive (`GET /api/queues/{active}`), what played,
 * what plays now and what plays next, then autoplay's kept pick. When the session moves over to
 * the other queue after the current item (`switchAfterCurrent`), up next runs on into that queue,
 * its first entry marked where playback moves over, and this queue's rest follows, marked where it
 * waits. What played lists only that queue's own plays. Entries carry no art yet, so each row draws
 * its art's fallback.
 */

/** Each queue's name, as the page's switch names it. */
export const QUEUES: QueueData['queues'] = [
  { key: 'music', label: 'Music' },
  { key: 'spoken', label: 'Spoken' },
];

const NOUN: Record<QueueType, [string, string]> = {
  music: ['song', 'songs'],
  spoken: ['item', 'items'],
};

const labelOf = (type: QueueType) => QUEUES.find((q) => q.key === type)?.label ?? type;

/** What a queue holds after its current entry: your queue, then what is left of playing-from. */
const restOf = (view: QueueView) => [...view.user, ...(view.context?.items ?? [])];

/** A row of up next; the canvas's type holds only the mixes its samples show. */
type Row = QueueData['items'][number];

const rowOf = (entry: QueueViewItem): Row =>
  ({
    id: entry.itemId,
    title: entry.title,
    sub: entry.sub ?? '',
    time: entry.duration === null ? '' : clock(entry.duration),
    image: '',
  }) as Row;

/** The page's data with nothing queued: the controls' queue named, every list empty. */
export function emptyQueue(active: QueueType): QueueData {
  return {
    context: `${labelOf(active)} queue`,
    queues: QUEUES,
    queue: active,
    played: [],
    items: [],
    autoplay: { title: '', items: [] },
  };
}

/**
 * `active`, the queue the controls drive, as the page shows it; `then`, the other queue, when the
 * session moves over to it after the current item.
 */
export function queueData(active: QueueView, then: QueueView | null): QueueData {
  const own = restOf(active);
  const other = then === null ? [] : [...(then.current ? [then.current] : []), ...restOf(then)];
  const next: Row[] = [
    ...other.map((entry, i) =>
      i === 0 && then !== null
        ? ({
            ...rowOf(entry),
            handoff: `Then the ${labelOf(then.type).toLowerCase()} queue`,
          } as Row)
        : rowOf(entry),
    ),
    ...own.map((entry, i) =>
      i === 0 && other.length > 0
        ? ({
            ...rowOf(entry),
            waiting: `Waiting in the ${labelOf(active.type).toLowerCase()} queue`,
          } as Row)
        : rowOf(entry),
    ),
  ];
  const upNext = [...other, ...own];
  const [one, many] = NOUN[active.type];
  const total = upNext.reduce((sum, entry) => sum + (entry.duration ?? 0), 0);
  const context =
    upNext.length === 0
      ? `${labelOf(active.type)} queue`
      : `${labelOf(active.type)} queue · ${upNext.length} ${upNext.length === 1 ? one : many}` +
        (total > 0 ? `, ${span(total)}` : '');
  return {
    context,
    queues: QUEUES,
    queue: active.type,
    played: active.played
      .filter((entry) => entry.queue === active.type)
      .map((entry) => ({
        id: `played-${entry.seq}`,
        title: entry.title,
        sub: entry.sub ?? '',
        time: entry.duration === null ? '' : clock(entry.duration),
        image: '',
      })),
    items: [
      ...(active.current ? [{ ...rowOf(active.current), current: true } as Row] : []),
      ...next,
    ],
    autoplay: {
      title: '',
      items:
        active.autoplay === null
          ? []
          : [
              {
                id: 'autoplay',
                title: active.autoplay.title,
                sub: active.autoplay.sub ?? '',
                time: active.autoplay.duration === null ? '' : clock(active.autoplay.duration),
                image: '',
              },
            ],
    },
  };
}
