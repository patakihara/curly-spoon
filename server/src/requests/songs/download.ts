/**
 * A kept song's download: its whole stream, read through the stream cache into this server's
 * staging folder (`Music/.auralis-keep/<instance>/<id>.webm`, which Jellyfin ignores as a dot
 * folder). Chunks the cache holds come from its disk, so a song played through makes no upstream
 * call; missing ones the cache fetches as it always does, in closed ranges. `start` opens the stream and answers the handle
 * `{id, size}` at once, the bytes following in the background; `poll` counts the staged bytes, and
 * is done once they are the stream's size. The read wakes the job when it ends, so the import does
 * not wait for the next turn.
 *
 * The staged file is the progress: a read lost to a restart, or to an outage, is started again by
 * the next poll from the bytes already staged. A staged file past the stream's size is wrong
 * whatever it holds: it is deleted and the download fails, so a retry stages the song afresh. A song YouTube refuses fails the download; streaming
 * being unavailable holds it. A repeat of a start answers the read already going, or opens from
 * what is staged, so a start never stages twice.
 */
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { JobLog } from '../../jobs/schedule.js';
import { StreamingUnavailable, TrackRefused } from '../../music/index.js';
import { RangeRefused, type StreamAnswer, StreamFailure } from '../../music/streamCache.js';
import {
  type DownloadHandle,
  type DownloadSteps,
  type DownloadTarget,
  type PollOutcome,
  type Release,
  StepUnavailable,
} from '../steps.js';
import { SongDetails } from './search.js';

/** The stream as the music side serves a client, every byte through the cache. */
export interface SongStream {
  open(id: string, range: string | undefined, signal: AbortSignal): Promise<StreamAnswer>;
}

export interface SongDownloadDeps {
  stream: SongStream;
  /** The staging folder, inside the Music folder so a staged file links into place. */
  stagingDir: string;
  /** Asks the job for a turn: the read ended. */
  wake: () => void;
  log: JobLog;
}

/**
 * A song's download: which song, and how many bytes its stream has; then the folders under Music its
 * import made, noted as it makes them.
 */
export const SongHandle = z
  .object({
    id: z.string().regex(/^[\w-]{1,64}$/),
    size: z.number().int().positive(),
    made: z.array(z.string()).optional(),
  })
  .strict();
export type SongHandle = z.infer<typeof SongHandle>;

/** Where a song's stream is staged. */
export const stagedPath = (stagingDir: string, id: string) => join(stagingDir, `${id}.webm`);

/** One background read into a staged file. */
interface Read {
  size: number;
  stop: AbortController;
  /** Settles once the read is over, and its file closed. */
  over: Promise<void>;
  ended: boolean;
  failure: unknown;
}

/** The size a `bytes=N-` answer names. */
function sizeOf(answer: StreamAnswer): number {
  const total = /\/(\d+)$/.exec(answer.headers['content-range'] ?? '')?.[1];
  if (total === undefined) throw new Error('a stream answered with no size');
  return Number(total);
}

/** Streaming down, or a stream that broke partway, holds the request; the rest fails it. */
function held(error: unknown): unknown {
  return error instanceof StreamingUnavailable || error instanceof StreamFailure
    ? new StepUnavailable(`the song's stream could not be read: ${error.name}`)
    : error;
}

/** A read's failure as a poll answers it: a song refused fails the download. */
function failedRead(error: unknown): PollOutcome {
  if (error instanceof TrackRefused) return { kind: 'failed', reason: 'downloadFailed' };
  throw held(error);
}

export function songDownload(deps: SongDownloadDeps): DownloadSteps {
  const { stream, stagingDir, wake, log } = deps;
  const reads = new Map<string, Read>();

  const staged = (id: string) => statSync(stagedPath(stagingDir, id), { throwIfNoEntry: false });

  /**
   * Opens the stream from the bytes staged on and reads the rest into the file in the background.
   * Answers the stream's size, or the staged size once nothing is left to read.
   */
  async function readFrom(id: string): Promise<number> {
    mkdirSync(stagingDir, { recursive: true });
    const from = staged(id)?.size ?? 0;
    const stop = new AbortController();
    let answer: StreamAnswer;
    try {
      answer = await stream.open(id, `bytes=${from}-`, stop.signal);
    } catch (error) {
      if (error instanceof RangeRefused && error.size !== undefined && error.size === from) {
        return from;
      }
      throw held(error);
    }
    const read: Read = {
      size: sizeOf(answer),
      stop,
      over: Promise.resolve(),
      ended: false,
      failure: null,
    };
    reads.set(id, read);
    read.over = (async () => {
      const file = await open(stagedPath(stagingDir, id), 'a');
      try {
        for await (const chunk of answer.body) {
          if (stop.signal.aborted) break;
          await file.write(chunk);
        }
      } catch (error) {
        read.failure = error;
      } finally {
        await file.close();
        read.ended = true;
      }
    })()
      .catch((error: unknown) => {
        read.failure = error;
        read.ended = true;
      })
      .finally(() => {
        if (stop.signal.aborted) return;
        if (read.failure !== null) {
          log.error({ reason: (read.failure as Error).name }, 'a kept song stopped staging');
        }
        wake();
      });
    return read.size;
  }

  const idOf = (target: DownloadTarget): string =>
    'handle' in target
      ? SongHandle.parse(target.handle).id
      : SongDetails.parse(target.release.details).youtubeMusicId;

  return {
    async start(_request, release: Release): Promise<DownloadHandle> {
      const { youtubeMusicId: id } = SongDetails.parse(release.details);
      const going = reads.get(id);
      if (going !== undefined && !going.ended) return { id, size: going.size };
      reads.delete(id);
      return { id, size: await readFrom(id) } satisfies SongHandle;
    },

    async poll(handle): Promise<PollOutcome> {
      const { id, size } = SongHandle.parse(handle);
      const have = staged(id)?.size ?? 0;
      const read = reads.get(id);
      if (have === size) {
        if (read?.ended !== false) reads.delete(id);
        return { kind: 'done' };
      }
      if (have > size) {
        reads.delete(id);
        read?.stop.abort();
        await read?.over;
        rmSync(stagedPath(stagingDir, id), { force: true });
        return { kind: 'failed', reason: 'downloadFailed' };
      }
      if (read !== undefined && !read.ended) return { kind: 'downloading', progress: have / size };
      reads.delete(id);
      if (read !== undefined && read.failure !== null) return failedRead(read.failure);
      await readFrom(id);
      return { kind: 'downloading', progress: have / size };
    },

    async cancel(target): Promise<void> {
      const id = idOf(target);
      const read = reads.get(id);
      reads.delete(id);
      read?.stop.abort();
      await read?.over;
      rmSync(stagedPath(stagingDir, id), { force: true });
    },
  };
}
