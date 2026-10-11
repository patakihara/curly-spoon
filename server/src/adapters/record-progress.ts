/**
 * Record mode's `progress` part: M1.progress's writes, made as the service identity `auralis`
 * only, with Auralis's own keys, and undone afterwards.
 *
 * Audiobookshelf, on one small book: a direct play, a sync after 15 s of real listening, a close
 * with 5 s more, the progress that left, then a bookmark made, listed, deleted, and deleted again.
 * Jellyfin, on one track, through a token minted for `auralis` by Quick Connect: a start, progress
 * at 15 s, a stop at 20 s, and the user data that left. The waits are real, so the listening time
 * reported is the time that passed.
 *
 * Before any write it reads the test user's progress, bookmarks, listening total and track state.
 * A `finally` undoes the run whatever failed: it closes a session left open, deletes a bookmark
 * left behind, deletes the progress made or puts back the progress there was, tries to delete the
 * listening session, stops a track left playing, posts the track's user data back, then reads
 * everything again. The run fails unless the read-back matches the before-read, and names what
 * no call puts back as known leftovers: the listening total, and the track's last-played date.
 */
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { AbsClient } from './audiobookshelf/client.js';
import { type MediaProgress, type SessionSync } from './audiobookshelf/schemas.js';
import { AdapterError, type FetchLike, requestJson } from './http/fetch.js';
import { createRecorder } from './http/record.js';
import { buildAuthorizationHeader } from './jellyfin/auth.js';
import { JellyfinClient, TICKS_PER_SECOND } from './jellyfin/client.js';
import { JellyfinProvisioner, personDevice } from './jellyfin/quickConnect.js';
import { type UserItemData, userItemDataSchema } from './jellyfin/schemas.js';
import { RECORD_USER_ID, TEST_IDENTITY } from './record-oidc.js';

/** The bookmark the run makes, at whole seconds, and its title. */
export const TEST_BOOKMARK = { time: 30, title: 'Auralis test' } as const;
/** The real seconds the run listens before its first report, and before its last. */
export const FIRST_LISTEN_S = 15;
export const LAST_LISTEN_S = 5;

export const ABS_PROGRESS_CALLS = [
  'progress-play',
  'progress-sync',
  'progress-close',
  'progress-read',
  'bookmark-create',
  'me',
  'bookmark-delete',
  'bookmark-delete-missing',
] as const;
export const JELLYFIN_PROGRESS_CALLS = [
  'jf-playing',
  'jf-progress',
  'jf-stopped',
  'jf-userdata',
] as const;

export interface ProgressRecordInput {
  fetch: FetchLike;
  out: (line: string) => void;
  sleep: (ms: number) => Promise<void>;
  root: string;
  absUrl: string;
  jellyfinUrl: string;
  absKey: string;
  jellyfinKey: string;
  bookId: string;
  trackId: string;
}

/** The test user's state the run must leave as it found it. */
interface Snapshot {
  progress: MediaProgress | null;
  bookmarks: { time: number; title: string }[];
  listened: number;
  track: UserItemData | null;
}

const listeningStatsSchema = z.object({ totalTime: z.number() }).passthrough();

/** The `id` of a play answer, from its raw text, whether or not the rest of it parses. */
function rawId(text: string): string | undefined {
  try {
    const value: unknown = JSON.parse(text);
    if (value !== null && typeof value === 'object' && 'id' in value) {
      const { id } = value;
      if (typeof id === 'string' && id.length > 0) return id;
    }
  } catch {
    // Not JSON: there is no session to close.
  }
  return undefined;
}

function url(base: string, path: string): string {
  return new URL(path, base.endsWith('/') ? base : `${base}/`).toString();
}

/**
 * What both sides compare: the progress, the book's bookmarks and the track's own state. The
 * listening total and the track's last-played date are not: no call puts them back when ABS keeps
 * the listening session or Jellyfin keeps the date it set, so `leftovers` names them instead.
 */
function comparable(s: Snapshot) {
  const p = s.progress;
  const t = s.track;
  return JSON.stringify({
    progress: p && [p.id, p.currentTime, p.duration, p.progress, p.isFinished],
    bookmarks: s.bookmarks,
    track: t && [t.PlaybackPositionTicks, t.PlayCount, t.Played, t.IsFavorite],
  });
}

/** What the run left that the revert cannot undo, each as one line naming before and now. */
function leftovers(before: Snapshot, after: Snapshot): string[] {
  const lines: string[] = [];
  if (after.listened !== before.listened) {
    lines.push(`audiobookshelf listening total ${before.listened} s, now ${after.listened} s`);
  }
  const last = (s: Snapshot) => s.track?.LastPlayedDate ?? 'never';
  if (last(after) !== last(before)) {
    lines.push(`jellyfin last played ${last(before)}, now ${last(after)}`);
  }
  return lines;
}

function describeSnapshot(s: Snapshot): string {
  const p = s.progress;
  const t = s.track;
  const progress = p
    ? `audiobookshelf progress ${p.currentTime} s${p.isFinished ? ' finished' : ''}`
    : 'audiobookshelf progress none';
  const track = t
    ? `jellyfin resume ${t.PlaybackPositionTicks / TICKS_PER_SECOND} s, ${t.PlayCount} plays, ` +
      `${t.Played ? 'played' : 'not played'}, last played ${t.LastPlayedDate ?? 'never'}`
    : 'jellyfin unread';
  return (
    `${progress}, ${s.bookmarks.length} bookmarks on the book, ` +
    `${s.listened} s listened in all; ${track}`
  );
}

export async function recordProgress(
  input: ProgressRecordInput,
): Promise<{ written: string[]; matches: boolean }> {
  const { absUrl, jellyfinUrl, absKey, jellyfinKey, bookId, trackId, out } = input;
  const absPlain = new AbsClient({ baseUrl: absUrl, token: absKey, fetch: input.fetch });
  const absVersion = await absPlain.getServerVersion();
  const me = await absPlain.getMe();
  if (me.username !== TEST_IDENTITY) {
    throw new Error(`the Audiobookshelf key belongs to ${me.username}, not ${TEST_IDENTITY}`);
  }
  const absBearer = { authorization: `Bearer ${absKey}` };
  const readAbs = async (): Promise<Omit<Snapshot, 'track'>> => {
    const now = await absPlain.getMe();
    const stats = await requestJson(
      input.fetch,
      url(absUrl, 'api/me/listening-stats'),
      { headers: absBearer },
      listeningStatsSchema,
    );
    return {
      progress: await absPlain.findMyProgress(bookId),
      bookmarks: now.bookmarks
        .filter((b) => b.libraryItemId === bookId)
        .map((b) => ({ time: b.time, title: b.title })),
      listened: Math.round(stats.totalTime),
    };
  };
  const beforeAbs = await readAbs();

  const jellyfinVersion = await new JellyfinClient({
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
  const absDir = join(input.root, 'audiobookshelf', 'recordings');
  const jellyfinDir = join(input.root, 'jellyfin', 'recordings');
  const written: string[] = [];
  let token: string | undefined;
  let sessionId: string | undefined;
  let sessionOpen = false;
  let trackPlaying = false;
  let trackPosition = 0;
  let before: Snapshot | undefined;
  let matches = false;
  const playSessionId = randomUUID().replace(/-/g, '');

  try {
    token = (await provisioner.mint(identity.id, RECORD_USER_ID)).token;
    const jfPlain = new JellyfinClient({ baseUrl: jellyfinUrl, token, device, fetch: input.fetch });
    before = { ...beforeAbs, track: await jfPlain.getUserData(trackId) };
    out(`before the run: ${describeSnapshot(before)}`);

    const absRec = createRecorder({
      fetch: input.fetch,
      dir: absDir,
      upstream: 'audiobookshelf',
      upstreamVersion: absVersion,
      secrets: [absKey],
      baseUrl: absUrl,
    });
    // The session id is read from the raw play answer, before zod parses it, so a session is
    // closed even when the answer fails its schema.
    const peek: FetchLike = async (target, init) => {
      const response = await absRec.fetch(target, init);
      if (init?.method === 'POST' && new URL(target).pathname.endsWith('/play')) {
        sessionId = rawId(await response.clone().text()) ?? sessionId;
      }
      return response;
    };
    const abs = new AbsClient({ baseUrl: absUrl, token: absKey, fetch: peek });
    const capture = async <T>(call: string, fn: () => Promise<T>) => {
      const result = await absRec.capture(call, fn);
      written.push(join(absDir, `${call}.json`));
      return result;
    };

    sessionOpen = true;
    const session = await capture('progress-play', () =>
      abs.play(bookId, { deviceId: 'auralis-recorder', clientVersion: '0.0.0' }),
    );
    const duration = session.duration;
    if (duration === undefined) throw new Error('the play answer has no duration');
    const report = (currentTime: number, timeListened: number): SessionSync => ({
      currentTime,
      timeListened,
      duration,
    });
    await input.sleep(FIRST_LISTEN_S * 1000);
    await capture('progress-sync', () =>
      abs.syncSession(session.id, report(FIRST_LISTEN_S, FIRST_LISTEN_S)),
    );
    await input.sleep(LAST_LISTEN_S * 1000);
    const end = FIRST_LISTEN_S + LAST_LISTEN_S;
    await capture('progress-close', () => abs.closeSession(session.id, report(end, LAST_LISTEN_S)));
    sessionOpen = false;
    const landed = await capture('progress-read', () => abs.findMyProgress(bookId));
    out(`the close left progress at ${landed?.currentTime ?? 'none'} s`);

    await capture('bookmark-create', () => abs.createBookmark(bookId, TEST_BOOKMARK));
    const listed = await capture('me', () => abs.getMe());
    if (
      !listed.bookmarks.some((b) => b.libraryItemId === bookId && b.time === TEST_BOOKMARK.time)
    ) {
      throw new Error('GET /api/me does not list the bookmark just made');
    }
    await capture('bookmark-delete', () => abs.deleteBookmark(bookId, TEST_BOOKMARK.time));
    const missing = await capture('bookmark-delete-missing', () =>
      abs.deleteBookmark(bookId, TEST_BOOKMARK.time).then(
        () => {
          throw new Error('the bookmark was deleted twice; record again');
        },
        (error: unknown) => error,
      ),
    );
    if (!(missing instanceof AdapterError && missing.kind === 'status')) throw missing;

    const jfRec = createRecorder({
      fetch: input.fetch,
      dir: jellyfinDir,
      upstream: 'jellyfin',
      upstreamVersion: jellyfinVersion,
      secrets: [jellyfinKey, token],
      baseUrl: jellyfinUrl,
    });
    const jf = new JellyfinClient({ baseUrl: jellyfinUrl, token, device, fetch: jfRec.fetch });
    const jfCapture = async <T>(call: string, fn: () => Promise<T>) => {
      const result = await jfRec.capture(call, fn);
      written.push(join(jellyfinDir, `${call}.json`));
      return result;
    };
    const at = (position: number) => ({ itemId: trackId, position, paused: false, playSessionId });
    trackPlaying = true;
    await jfCapture('jf-playing', () => jf.reportStart(at(0)));
    await input.sleep(FIRST_LISTEN_S * 1000);
    await jfCapture('jf-progress', () => jf.reportProgress(at(FIRST_LISTEN_S)));
    trackPosition = FIRST_LISTEN_S;
    await input.sleep(LAST_LISTEN_S * 1000);
    await jfCapture('jf-stopped', () => jf.reportStopped(at(end)));
    trackPlaying = false;
    const left = await jfCapture('jf-userdata', () => jf.getUserData(trackId));
    out(
      `the stop left the track at ${left.PlaybackPositionTicks / TICKS_PER_SECOND} s, ` +
        `${left.PlayCount} plays, ${left.Played ? 'played' : 'not played'}`,
    );
  } finally {
    const problems: string[] = [];
    const step = async (what: string, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (error) {
        problems.push(`${what}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    if (sessionOpen && sessionId !== undefined) {
      const open = sessionId;
      await step('closing the session', () => absPlain.closeSession(open));
    }
    await step('deleting bookmarks left behind', async () => {
      const now = await absPlain.getMe();
      const made = now.bookmarks.filter(
        (b) => b.libraryItemId === bookId && !beforeAbs.bookmarks.some((p) => p.time === b.time),
      );
      for (const b of made) await absPlain.deleteBookmark(bookId, b.time);
    });
    await step('restoring progress', async () => {
      const now = await absPlain.findMyProgress(bookId);
      const prior = beforeAbs.progress;
      if (prior === null && now !== null) {
        await requestJson(
          input.fetch,
          url(absUrl, `api/me/progress/${encodeURIComponent(now.id)}`),
          { method: 'DELETE', headers: absBearer },
          z.unknown(),
        );
      } else if (prior !== null) {
        const { currentTime, duration, progress, isFinished } = prior;
        await requestJson(
          input.fetch,
          url(absUrl, `api/me/progress/${encodeURIComponent(bookId)}`),
          {
            method: 'PATCH',
            headers: absBearer,
            json: { currentTime, duration, progress, isFinished },
          },
          z.unknown(),
        );
      }
    });
    if (sessionId !== undefined) {
      const played = sessionId;
      await step('deleting the listening session', async () => {
        try {
          await requestJson(
            input.fetch,
            url(absUrl, `api/sessions/${encodeURIComponent(played)}`),
            { method: 'DELETE', headers: absBearer },
            z.unknown(),
          );
          out('listening session deleted');
        } catch (error) {
          if (!(error instanceof AdapterError && error.kind === 'status')) throw error;
          out(`listening session kept: ${error.status} for the test user deleting its own`);
        }
      });
    }
    let afterTrack: UserItemData | null = null;
    if (token !== undefined) {
      const minted = token;
      const authorization = buildAuthorizationHeader(device, minted);
      const jfPlain = new JellyfinClient({
        baseUrl: jellyfinUrl,
        token: minted,
        device,
        fetch: input.fetch,
      });
      if (trackPlaying) {
        await step('stopping the track', () =>
          jfPlain.reportStopped({ itemId: trackId, position: trackPosition, playSessionId }),
        );
      }
      const prior = before?.track;
      if (prior) {
        await step('posting the track user data back', async () => {
          const json = {
            PlaybackPositionTicks: prior.PlaybackPositionTicks,
            PlayCount: prior.PlayCount,
            Played: prior.Played,
            IsFavorite: prior.IsFavorite,
            ...(prior.LastPlayedDate ? { LastPlayedDate: prior.LastPlayedDate } : {}),
          };
          await requestJson(
            input.fetch,
            url(jellyfinUrl, `UserItems/${encodeURIComponent(trackId)}/UserData`),
            { method: 'POST', headers: { authorization }, json },
            userItemDataSchema,
          );
        });
      }
      await step('reading the track back', async () => {
        afterTrack = await jfPlain.getUserData(trackId);
      });
    }
    let afterAbs: Omit<Snapshot, 'track'> | undefined;
    await step('reading Audiobookshelf back', async () => {
      afterAbs = await readAbs();
    });
    if (before !== undefined && afterAbs !== undefined) {
      const after: Snapshot = { ...afterAbs, track: afterTrack };
      out(`after the revert: ${describeSnapshot(after)}`);
      matches = comparable(after) === comparable(before);
      for (const line of leftovers(before, after)) out(`known leftover: ${line}`);
    }
    if (token !== undefined) {
      const res = await input.fetch(url(jellyfinUrl, 'Sessions/Logout'), {
        method: 'POST',
        headers: { authorization: buildAuthorizationHeader(device, token) },
      });
      out(`logged out the minted Jellyfin token: ${res.status}`);
    }
    for (const p of problems) out(`revert problem: ${p}`);
    if (matches) out('reverted: the read-back matches the before-read');
  }
  return { written, matches };
}
