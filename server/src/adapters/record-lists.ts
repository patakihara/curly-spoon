/**
 * Record mode's `lists` part: the upstream answer M2.lists' played mark rests on, made as the
 * service identity `auralis` with Auralis's own key.
 *
 * - Each given episode of one show is marked finished for the test user (`episode-mark-finished`,
 *   then `-2`, ..), the call a digest makes when an episode leaves its queue. Each mark is undone
 *   and read back before the next.
 *
 * The show is read by id only. No library is listed or scanned, and no file is opened, so no
 * podcast stub is hydrated.
 */
import { join } from 'node:path';
import { AbsClient } from './audiobookshelf/client.js';
import { type FetchLike } from './http/fetch.js';
import { createRecorder } from './http/record.js';
import { withEpisodeFinished } from './record-finished.js';
import { TEST_IDENTITY } from './record-oidc.js';

export interface ListsRecordInput {
  fetch: FetchLike;
  out: (line: string) => void;
  root: string;
  absUrl: string;
  absKey: string;
  showId: string;
  /** Episodes of the show, each recorded as `episode-mark-finished`, then `-2`, `-3`, .. */
  episodeIds: string[];
}

/** The recording of the `n`th episode marked, from 0. */
export const markCall = (n: number) =>
  n === 0 ? 'episode-mark-finished' : `episode-mark-finished-${n + 1}`;

export async function recordLists(
  input: ListsRecordInput,
): Promise<{ written: string[]; matches: boolean }> {
  const { absUrl, absKey, showId, episodeIds, out } = input;
  const plain = new AbsClient({ baseUrl: absUrl, token: absKey, fetch: input.fetch });
  const version = await plain.getServerVersion();
  const me = await plain.getMe();
  if (me.username !== TEST_IDENTITY) {
    throw new Error(`the Audiobookshelf key belongs to ${me.username}, not ${TEST_IDENTITY}`);
  }
  const show = await plain.getItemSummary(showId);
  if (show.mediaType !== 'podcast') throw new Error(`${showId} is not a show`);
  for (const id of episodeIds) {
    if (!show.media.episodes.some((e) => e.id === id))
      throw new Error(`the show has no episode ${id}`);
  }

  const dir = join(input.root, 'audiobookshelf', 'recordings');
  const rec = createRecorder({
    fetch: input.fetch,
    dir,
    upstream: 'audiobookshelf',
    upstreamVersion: version,
    secrets: [absKey],
    baseUrl: absUrl,
  });
  const abs = new AbsClient({ baseUrl: absUrl, token: absKey, fetch: rec.fetch });
  const written: string[] = [];
  let matches = true;
  for (const [n, episodeId] of episodeIds.entries()) {
    const call = markCall(n);
    const put = await withEpisodeFinished({
      fetch: input.fetch,
      out,
      abs: plain,
      absUrl,
      absKey,
      showId,
      episodeId,
      mark: () => rec.capture(call, () => abs.markEpisodeFinished(showId, episodeId)),
      during: async () => {
        const mark = await plain.findMyEpisodeProgress(showId, episodeId);
        if (!mark?.isFinished) throw new Error('the episode does not read back as finished');
      },
    });
    written.push(join(dir, `${call}.json`));
    matches &&= put;
  }
  return { written, matches };
}
