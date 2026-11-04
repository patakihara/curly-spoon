/**
 * Stand-in books and albums for the browser tests of the Requests page: what a real medium's search
 * and download would answer, with nothing fetched. A real download is never recorded, so these are
 * test doubles, and the image holds none (`recorded.ts` says why).
 *
 * A request's title says how it goes:
 *
 * - a book titled `Alone…` picks one release, whose first download fails, with no other to pick;
 * - a book titled `Spare…` the same, with another release left;
 * - any other book picks one release and downloads, at 38% for as long as the test wants;
 * - any album asks for a choice of two releases, then stays queued.
 *
 * Nothing reaches the import: this page's tests stop short of it.
 */
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

const NOT_IMPORTED = () => Promise.reject(new Error('a stand-in medium imports nothing'));

function downloads(poll: (handle: DownloadHandle) => PollOutcome): DownloadSteps {
  return {
    start: async (request) => ({ request: request.id, title: request.target.title }),
    poll: async (handle) => poll(handle),
    cancel: async () => undefined,
  };
}

/** The stand-in mediums. Each failing book fails its first download alone. */
export function standInMedia(): MediumSteps[] {
  const failed = new Set<unknown>();
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
      return { kind: 'downloading', progress: 0.38 };
    }),
    import: NOT_IMPORTED,
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
  return [book, album];
}
