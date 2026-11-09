/**
 * Stand-in books and albums for the browser tests of the Requests page: what a real medium's search
 * and download would answer, with nothing fetched. A real download is never recorded, so these are
 * test doubles, and the image holds none (`recorded.ts` says why).
 *
 * A request's title says how it goes:
 *
 * - a book titled `Alone…` picks one release, whose first download fails, with no other to pick;
 * - a book titled `Spare…` the same, with another release left;
 * - a book titled `The Strange Case…`, as the recorded catalogue lists one, downloads at 38% for a
 *   few turns, waits one turn at its import, and arrives as the recorded item `arrives` names;
 * - any other book picks one release and downloads, at 38% for as long as the test wants;
 * - any album asks for a choice of two releases, then stays queued;
 * - any song kept picks its one stream and stages it at 38% for as long as the test wants.
 */
import type { MediaRef } from '@auralis/schema';
import type {
  DownloadHandle,
  DownloadSteps,
  MediumSteps,
  PollOutcome,
  Release,
} from '../src/requests/steps.js';

const release = (id: string, title: string, size: number): Release => ({
  id,
  title,
  source: 'Stand-in',
  size,
  details: {},
});

/** How many turns a book that arrives stays downloading: long enough for a page to look. */
const TURNS_DOWNLOADING = 12;

const arriving = (title: unknown) => String(title).startsWith('The Strange Case');

const NOT_IMPORTED = () => Promise.reject(new Error('a stand-in medium imports nothing'));

function downloads(poll: (handle: DownloadHandle) => PollOutcome): DownloadSteps {
  return {
    start: async (request) => ({ request: request.id, title: request.target.title }),
    poll: async (handle) => poll(handle),
    cancel: async () => undefined,
  };
}

/** The stand-in mediums. Each failing book fails its first download alone. */
export function standInMedia(arrives: MediaRef): MediumSteps[] {
  const failed = new Set<unknown>();
  const turns = new Map<unknown, number>();
  const waited = new Set<string>();
  const book: MediumSteps = {
    medium: 'book',
    search: async ({ target }) => ({
      kind: 'picked',
      release: release('first', `${target.title} [M4B]`, 286_000_000),
      others: target.title.startsWith('Spare')
        ? [release('second', `${target.title} [MP3]`, 412_000_000)]
        : [],
    }),
    download: downloads(({ request, title }) => {
      const fails = String(title).startsWith('Alone') || String(title).startsWith('Spare');
      if (fails && !failed.has(request)) {
        failed.add(request);
        return { kind: 'failed', reason: 'downloadFailed' };
      }
      if (arriving(title)) {
        const turn = (turns.get(request) ?? 0) + 1;
        turns.set(request, turn);
        if (turn > TURNS_DOWNLOADING) return { kind: 'done' };
      }
      return { kind: 'downloading', progress: 0.38 };
    }),
    import: async (request) => {
      if (!arriving(request.target.title)) return NOT_IMPORTED();
      if (!waited.has(request.id)) {
        waited.add(request.id);
        return { kind: 'waiting' };
      }
      return { kind: 'arrived', ref: arrives };
    },
  };
  const album: MediumSteps = {
    medium: 'album',
    search: async ({ target }) => ({
      kind: 'choose',
      candidates: [
        release('flac', `${target.title} [FLAC]`, 1_100_000_000),
        release('mp3', `${target.title} [MP3 320]`, 136_000_000),
      ],
    }),
    download: downloads(() => ({ kind: 'queued' })),
    import: NOT_IMPORTED,
  };
  const song: MediumSteps = {
    medium: 'song',
    search: async ({ target }) => ({
      kind: 'picked',
      release: release('stream', target.title, 3_445_462),
      others: [],
    }),
    download: downloads(() => ({ kind: 'downloading', progress: 0.38 })),
    import: NOT_IMPORTED,
  };
  return [book, album, song];
}
