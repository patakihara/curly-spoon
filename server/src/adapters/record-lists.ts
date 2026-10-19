/**
 * Record mode's `lists` part: the upstream answer M2.lists' played mark rests on, made as the
 * service identity `auralis` with Auralis's own key.
 *
 * - One episode of one show is marked finished for the test user (`episode-mark-finished`), the
 *   call a digest makes when an episode leaves its queue. The mark is undone and read back.
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
  episodeId: string;
}

export async function recordLists(
  input: ListsRecordInput,
): Promise<{ written: string[]; matches: boolean }> {
  const { absUrl, absKey, showId, episodeId, out } = input;
  const plain = new AbsClient({ baseUrl: absUrl, token: absKey, fetch: input.fetch });
  const version = await plain.getServerVersion();
  const me = await plain.getMe();
  if (me.username !== TEST_IDENTITY) {
    throw new Error(`the Audiobookshelf key belongs to ${me.username}, not ${TEST_IDENTITY}`);
  }
  const show = await plain.getItemSummary(showId);
  if (show.mediaType !== 'podcast') throw new Error(`${showId} is not a show`);
  if (!show.media.episodes.some((e) => e.id === episodeId)) {
    throw new Error(`the show has no episode ${episodeId}`);
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
  const matches = await withEpisodeFinished({
    fetch: input.fetch,
    out,
    abs: plain,
    absUrl,
    absKey,
    showId,
    episodeId,
    mark: () =>
      rec.capture('episode-mark-finished', () => abs.markEpisodeFinished(showId, episodeId)),
    during: async () => {
      const mark = await plain.findMyEpisodeProgress(showId, episodeId);
      if (!mark?.isFinished) throw new Error('the episode does not read back as finished');
    },
  });
  return { written: [join(dir, 'episode-mark-finished.json')], matches };
}
