/**
 * Record mode's `household` part: how Auralis's own Jellyfin API key, which has no user behind it,
 * reads a track and an album for a household play, and answers Instant Mix for autoplay's radio. It
 * reads one album by id, its first track by id and Instant Mix for its last track, and opens no file.
 */
import { join } from 'node:path';
import { type FetchLike } from './http/fetch.js';
import { createRecorder } from './http/record.js';
import { INSTANT_MIX_LIMIT, JellyfinClient } from './jellyfin/client.js';

export async function recordHousehold(input: {
  fetch: FetchLike;
  out: (line: string) => void;
  root: string;
  jellyfinUrl: string;
  jellyfinKey: string;
  albumId: string;
}): Promise<{ written: string[] }> {
  const { fetch, jellyfinUrl: baseUrl, jellyfinKey: token, albumId } = input;
  const plain = new JellyfinClient({ baseUrl, token, fetch });
  const dir = join(input.root, 'jellyfin', 'recordings');
  const rec = createRecorder({
    fetch,
    dir,
    upstream: 'jellyfin',
    upstreamVersion: await plain.getServerVersion(),
    secrets: [token],
    baseUrl,
  });
  const jf = new JellyfinClient({ baseUrl, token, fetch: rec.fetch, serverKey: true });
  await rec.capture('jf-household-album', () => jf.getPlayable(albumId));
  const tracks = await plain.getAlbumPlayables(albumId);
  const [first, last] = [tracks[0], tracks.at(-1)];
  if (first === undefined || last === undefined) throw new Error('that album has no tracks');
  await rec.capture('jf-household-track', () => jf.getPlayable(first.Id));
  const mix = await rec.capture('jf-household-instant-mix', () =>
    jf.getInstantMix(last.Id, INSTANT_MIX_LIMIT),
  );
  input.out(
    `recorded the album, its first track and Instant Mix for its last (${mix.length} tracks) as the API key reads them`,
  );
  const calls = ['jf-household-album', 'jf-household-track', 'jf-household-instant-mix'];
  return { written: calls.map((c) => join(dir, `${c}.json`)) };
}
