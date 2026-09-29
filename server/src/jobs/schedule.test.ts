import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleJob } from './schedule.js';

const MINUTE = 60_000;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function logger() {
  const errors: unknown[][] = [];
  return { log: { error: (...args: unknown[]) => errors.push(args) }, errors };
}

describe('the job scheduler', () => {
  it('runs a job soon after start, then once every interval, until stopped', async () => {
    const run = vi.fn(async () => undefined);
    const stop = scheduleJob({ name: 'probe', everyMs: 60 * MINUTE, run }, logger().log);

    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60 * MINUTE);
    expect(run).toHaveBeenCalledTimes(2);

    stop();
    await vi.advanceTimersByTimeAsync(180 * MINUTE);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('never starts a run while the last one is still going', async () => {
    let finish: () => void = () => undefined;
    const run = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const stop = scheduleJob({ name: 'slow', everyMs: MINUTE, run }, logger().log);

    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    expect(run).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(run).toHaveBeenCalledTimes(2);
    stop();
  });

  it('logs a failed run by name and keeps the schedule', async () => {
    const run = vi.fn(async () => {
      throw new Error('upstream down');
    });
    const { log, errors } = logger();
    const stop = scheduleJob({ name: 'index', everyMs: MINUTE, run }, log);

    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(run).toHaveBeenCalledTimes(2);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toEqual([expect.objectContaining({ job: 'index' }), 'job failed']);
    stop();
  });
});
