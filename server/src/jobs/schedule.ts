/**
 * The server's background jobs: each runs soon after start, then once per interval, in this
 * process. A run never overlaps the one before it, a failure is logged and waits for the next
 * turn, and no timer keeps the process alive. The index job is the first; later jobs (provider
 * pools, the extractor canary) use the same.
 */

export interface Job {
  name: string;
  everyMs: number;
  run: () => Promise<void>;
}

export interface JobLog {
  error: (details: Record<string, unknown>, message: string) => void;
}

/** Starts `job`; returns the function that stops it. A run already going finishes on its own. */
export function scheduleJob(job: Job, log: JobLog): () => void {
  let running = false;
  let stopped = false;
  const tick = () => {
    if (running || stopped) return;
    running = true;
    job
      .run()
      .catch((err: unknown) => log.error({ job: job.name, err }, 'job failed'))
      .finally(() => {
        running = false;
      });
  };
  const first = setTimeout(tick, 0);
  const timer = setInterval(tick, job.everyMs);
  first.unref();
  timer.unref();
  return () => {
    stopped = true;
    clearTimeout(first);
    clearInterval(timer);
  };
}
