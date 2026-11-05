/**
 * Test support: stand-in steps for any medium, with no upstream. Each step answers from a script
 * the test gives and counts its calls, so a test can drive a request through its route and see
 * what each step was asked. It keeps the steps' contract: a repeat of a key answers the first
 * call's result and counts as no new call. Never registered outside tests.
 */
import type { MediaRef, RequestMedium } from '@auralis/schema';
import { ROUTES } from '../../requests/machine.js';
import type {
  DownloadHandle,
  ImportOutcome,
  MediumSteps,
  PollOutcome,
  Release,
  SearchOutcome,
} from '../../requests/steps.js';

/**
 * What the stand-in answers: its search, its polls in turn (the last repeats), its import, and how
 * many times the import answers that it is still waiting first.
 */
export interface StandInScript {
  search?: SearchOutcome;
  polls?: PollOutcome[];
  imports?: MediaRef;
  importWaits?: number;
}

/** A stand-in release, by id. */
export const standInRelease = (id: string): Release => ({
  id,
  title: `Release ${id}`,
  source: 'stand-in',
  size: 1_000_000,
  details: { url: `stand-in:${id}` },
});

/** The stand-in's steps, with how many times each was called and the handles it was asked about. */
export type StandInSteps = MediumSteps & {
  calls: Record<string, number>;
  polled: DownloadHandle[];
  cancelled: DownloadHandle[];
};

/** Stand-in steps for a medium, downloading only if its route does. */
export function standInSteps(medium: RequestMedium, script: StandInScript = {}): StandInSteps {
  const calls: Record<string, number> = { search: 0, start: 0, poll: 0, cancel: 0, import: 0 };
  const polled: DownloadHandle[] = [];
  const cancelled: DownloadHandle[] = [];
  const polls = script.polls ?? [{ kind: 'done' }];
  const imported = new Map<string, ImportOutcome>();
  let waits = script.importWaits ?? 0;
  const started = new Map<string, DownloadHandle>();
  const count = (step: string): number => {
    calls[step] = (calls[step] ?? 0) + 1;
    return calls[step];
  };
  const steps: StandInSteps = {
    medium,
    calls,
    polled,
    cancelled,
    search: () => {
      count('search');
      return Promise.resolve(
        script.search ?? { kind: 'picked', release: standInRelease('one'), others: [] },
      );
    },
    import: (_request, key) => {
      if (waits > 0) {
        waits -= 1;
        return Promise.resolve({ kind: 'waiting' });
      }
      const named = imported.get(key) ?? {
        kind: 'arrived' as const,
        ref: script.imports ?? { source: 'abs', id: 'stand-in' },
      };
      if (!imported.has(key)) count('import');
      imported.set(key, named);
      return Promise.resolve(named);
    },
  };
  if (!ROUTES[medium].includes('downloading')) return steps;
  return {
    ...steps,
    download: {
      start: (_request, release, key) => {
        const handle = started.get(key) ?? { release: release.id, start: count('start') };
        started.set(key, handle);
        return Promise.resolve(handle);
      },
      poll: (handle) => {
        polled.push(handle);
        const n = count('poll');
        return Promise.resolve(polls[Math.min(n, polls.length) - 1] ?? { kind: 'done' });
      },
      cancel: (target) => {
        const handle = 'handle' in target ? target.handle : started.get(target.key);
        if (handle !== undefined) cancelled.push(handle);
        count('cancel');
        return Promise.resolve();
      },
    },
  };
}
