/**
 * Marking one episode finished for the test user while a recording is made, and undoing it. Record
 * mode's `sessions` and `lists` parts both mark an episode, through `mark`, then put the test
 * user's progress back as it was and read it back: the run is only good when that read matches.
 */
import { z } from 'zod';
import { type AbsClient } from './audiobookshelf/client.js';
import { type MediaProgress } from './audiobookshelf/schemas.js';
import { type FetchLike, requestJson } from './http/fetch.js';

export interface FinishedEpisode {
  fetch: FetchLike;
  out: (line: string) => void;
  /** An unrecorded client, as the test user: it reads the progress before and after. */
  abs: AbsClient;
  absUrl: string;
  absKey: string;
  showId: string;
  episodeId: string;
  /** Marks the episode finished, recorded or not. */
  mark: () => Promise<unknown>;
  /** What is recorded while the mark stands. */
  during?: () => Promise<unknown>;
}

function url(base: string, path: string): string {
  return new URL(path, base.endsWith('/') ? base : `${base}/`).toString();
}

const comparable = (p: MediaProgress | null) =>
  JSON.stringify(p && [p.id, p.currentTime, p.duration, p.progress, p.isFinished]);

const describe = (p: MediaProgress | null) =>
  p ? `progress ${p.currentTime} s, finished ${p.isFinished}` : 'no progress';

/**
 * Marks the episode finished, runs `during`, then undoes the mark whatever failed: it deletes the
 * progress the mark made, or writes the old values back. Resolves to whether the progress read
 * back matches the progress read before.
 */
export async function withEpisodeFinished(input: FinishedEpisode): Promise<boolean> {
  const { abs, absUrl, absKey, showId, episodeId, out } = input;
  const progressPath = `api/me/progress/${encodeURIComponent(showId)}/${encodeURIComponent(episodeId)}`;
  const bearer = { authorization: `Bearer ${absKey}` };
  const read = () => abs.findMyEpisodeProgress(showId, episodeId);
  const before = await read();
  out(`before the run: ${describe(before)} on the episode`);
  let matches = false;
  try {
    await input.mark();
    await input.during?.();
  } finally {
    const now = await read();
    if (before === null && now !== null) {
      await requestJson(
        input.fetch,
        url(absUrl, `api/me/progress/${encodeURIComponent(now.id)}`),
        { method: 'DELETE', headers: bearer },
        z.unknown(),
      );
    } else if (before !== null) {
      const { currentTime, duration, progress, isFinished } = before;
      await requestJson(
        input.fetch,
        url(absUrl, progressPath),
        { method: 'PATCH', headers: bearer, json: { currentTime, duration, progress, isFinished } },
        z.unknown(),
      );
    }
    const after = await read();
    out(`after the revert: ${describe(after)} on the episode`);
    matches = comparable(after) === comparable(before);
  }
  if (matches) out("reverted: the episode's progress reads back as before");
  return matches;
}
