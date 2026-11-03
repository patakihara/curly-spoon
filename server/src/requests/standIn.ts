/**
 * Test support: stand-in steps for any medium, with no upstream. Each step answers from a script
 * the test gives and counts its calls, so a test can drive a request through its route and see
 * what each step was asked. Never registered outside tests.
 */
import type { MediaRef, RequestMedium } from '@auralis/schema';
import { ROUTES } from './machine.js';
import type { MediumSteps, PollOutcome, Release, SearchOutcome } from './steps.js';

/** What the stand-in answers: its search, its polls in turn (the last repeats), its import. */
export interface StandInScript {
  search?: SearchOutcome;
  polls?: PollOutcome[];
  imports?: MediaRef;
}

/** A stand-in release, by id. */
export const standInRelease = (id: string): Release => ({
  id,
  title: `Release ${id}`,
  source: 'stand-in',
  size: 1_000_000,
  details: { url: `stand-in:${id}` },
});

/** The stand-in's steps, with how many times each was called. */
export type StandInSteps = MediumSteps & { calls: Record<string, number> };

/** Stand-in steps for a medium, downloading only if its route does. */
export function standInSteps(medium: RequestMedium, script: StandInScript = {}): StandInSteps {
  const calls: Record<string, number> = { search: 0, start: 0, poll: 0, cancel: 0, import: 0 };
  const polls = script.polls ?? [{ kind: 'done' }];
  const count = (step: string): number => {
    calls[step] = (calls[step] ?? 0) + 1;
    return calls[step];
  };
  const steps: StandInSteps = {
    medium,
    calls,
    search: () => {
      count('search');
      return Promise.resolve(script.search ?? { kind: 'picked', release: standInRelease('one') });
    },
    import: () => {
      count('import');
      return Promise.resolve({ ref: script.imports ?? { source: 'abs', id: 'stand-in' } });
    },
  };
  if (!ROUTES[medium].includes('downloading')) return steps;
  return {
    ...steps,
    download: {
      start: (_request, release) => {
        count('start');
        return Promise.resolve({ release: release.id });
      },
      poll: () => {
        const n = count('poll');
        return Promise.resolve(polls[Math.min(n, polls.length) - 1] ?? { kind: 'done' });
      },
      cancel: () => {
        count('cancel');
        return Promise.resolve();
      },
    },
  };
}
