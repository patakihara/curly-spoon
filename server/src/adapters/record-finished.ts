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

/** What a run whose undo did not read back as before says, and why it is not committed. */
export const UNDO_UNCONFIRMED =
  "the test user's episode progress is not as it was before the run: do not commit";

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
 * back matches the progress read before. When the mark or the undo fails, it throws every error
 * it met, and `UNDO_UNCONFIRMED` too unless the read-back matched.
 */
export async function withEpisodeFinished(input: FinishedEpisode): Promise<boolean> {
  const { abs, absUrl, absKey, showId, episodeId, out } = input;
  const progressPath = `api/me/progress/${encodeURIComponent(showId)}/${encodeURIComponent(episodeId)}`;
  const bearer = { authorization: `Bearer ${absKey}` };
  const read = () => abs.findMyEpisodeProgress(showId, episodeId);
  const before = await read();
  out(`before the run: ${describe(before)} on the episode`);
  const errors: unknown[] = [];
  try {
    await input.mark();
    await input.during?.();
  } catch (error) {
    errors.push(error);
  }
  let matches = false;
  try {
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
  } catch (error) {
    errors.push(error);
  }
  if (errors.length === 1 && matches) throw errors[0];
  if (errors.length > 0) {
    const lines = errors.map((e) => (e instanceof Error ? e.message : String(e)));
    if (!matches) lines.push(UNDO_UNCONFIRMED);
    throw new Error(lines.join('\n'), { cause: errors[0] });
  }
  if (matches) out("reverted: the episode's progress reads back as before");
  return matches;
}
