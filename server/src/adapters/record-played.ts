/**
 * Record mode's `played` part: the Jellyfin answer M3.requests' personal library rests on, as the
 * service identity `auralis` through a token minted by Quick Connect and logged out at the end.
 *
 * - One small page of what `auralis` has played (`jf-played-tracks`), so a read can never be large.
 * - If `auralis` has played nothing, the given track is first marked played for `auralis` only, and
 *   the mark is undone once the page is recorded. Without a track given, the run stops and writes
 *   nothing.
 *
 * No library is scanned, and no audio file is opened.
 */
import { join } from 'node:path';
import { type FetchLike } from './http/fetch.js';
import { createRecorder, withCleanup } from './http/record.js';
import { buildAuthorizationHeader } from './jellyfin/auth.js';
import { JellyfinClient } from './jellyfin/client.js';
import { JellyfinProvisioner, personDevice } from './jellyfin/quickConnect.js';
import { RECORD_USER_ID, TEST_IDENTITY } from './record-oidc.js';

/** How many played tracks the recording holds. */
export const PLAYED_PAGE = 3;

export interface PlayedRecordInput {
  fetch: FetchLike;
  out: (line: string) => void;
  root: string;
  jellyfinUrl: string;
  jellyfinKey: string;
  /** The already recorded track to mark played, if `auralis` has played nothing. */
  trackId: string | undefined;
}

function url(base: string, path: string): string {
  return new URL(path, base.endsWith('/') ? base : `${base}/`).toString();
}

export async function recordPlayed(input: PlayedRecordInput): Promise<{ written: string[] }> {
  const { jellyfinUrl, jellyfinKey, trackId, out } = input;
  const version = await new JellyfinClient({
    baseUrl: jellyfinUrl,
    token: jellyfinKey,
    fetch: input.fetch,
  }).getServerVersion();
  const provisioner = new JellyfinProvisioner({
    baseUrl: jellyfinUrl,
    apiKey: jellyfinKey,
    fetch: input.fetch,
  });
  const identity = (await provisioner.accounts()).find((a) => a.username === TEST_IDENTITY);
  if (!identity) throw new Error(`Jellyfin has no user ${TEST_IDENTITY}`);
  const device = personDevice(RECORD_USER_ID);
  const { token } = await provisioner.mint(identity.id, RECORD_USER_ID);
  const authorized = (method: string, path: string) =>
    input.fetch(url(jellyfinUrl, path), {
      method,
      headers: { authorization: buildAuthorizationHeader(device, token) },
    });
  const dir = join(input.root, 'jellyfin', 'recordings');
  const page = { limit: PLAYED_PAGE, startIndex: 0 };

  const capture = async () => {
    const rec = createRecorder({
      fetch: input.fetch,
      dir,
      upstream: 'jellyfin',
      upstreamVersion: version,
      secrets: [jellyfinKey, token],
      baseUrl: jellyfinUrl,
    });
    const jf = new JellyfinClient({ baseUrl: jellyfinUrl, token, device, fetch: rec.fetch });
    const { tracks, total } = await rec.capture('jf-played-tracks', () => jf.getPlayedTracks(page));
    if (tracks.length === 0) throw new Error(`${TEST_IDENTITY} still has no played track`);
    out(`recorded ${tracks.length} of ${total} played tracks`);
  };

  const unmark = async (track: string) => {
    const res = await authorized('DELETE', `UserPlayedItems/${encodeURIComponent(track)}`);
    if (!res.ok) throw new Error(`undoing the played mark answered ${res.status}`);
    out(`undid the played mark: ${res.status}`);
  };

  const record = async () => {
    const plain = new JellyfinClient({ baseUrl: jellyfinUrl, token, device, fetch: input.fetch });
    const { total } = await plain.getPlayedTracks({ limit: 1, startIndex: 0 });
    if (total > 0) {
      out(`${TEST_IDENTITY} has played ${total} tracks: nothing marked`);
      await capture();
      return;
    }
    if (trackId === undefined) {
      throw new Error(`${TEST_IDENTITY} has no played track: give --jellyfin-item <track> to mark`);
    }
    const marked = await authorized('POST', `UserPlayedItems/${encodeURIComponent(trackId)}`);
    if (!marked.ok) throw new Error(`marking the track played answered ${marked.status}`);
    out(`${TEST_IDENTITY} had no played track: marked one for ${TEST_IDENTITY} only`);
    await withCleanup(
      capture,
      () => unmark(trackId),
      (error) => {
        out(`undoing the played mark failed: ${String(error)}`);
      },
    );
  };

  await withCleanup(
    record,
    async () => {
      const res = await authorized('POST', 'Sessions/Logout');
      out(`logged out the minted Jellyfin token: ${res.status}`);
    },
    (error) => out(`logging out the minted Jellyfin token failed: ${String(error)}`),
  );
  return { written: [join(dir, 'jf-played-tracks.json')] };
}
