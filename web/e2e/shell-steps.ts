import { expect, type Page } from '@playwright/test';
import { type Recorded } from './recorded';

/**
 * The steps the shell's browser tests share: signing in through the stand-in sign-on, reading
 * what the server lists and says of an item, moving within the app, and watching the player's
 * audio elements and the system's media controls.
 */

export const keyOf = (ref: { source: string; id: string }) => `${ref.source}:${ref.id}`;

/** Spies on the system's media controls: each action given a handler, by name. */
const spyOnMediaSession = () => {
  const handled = new Set<string>();
  (window as unknown as { handled: Set<string> }).handled = handled;
  const set = MediaSession.prototype.setActionHandler;
  MediaSession.prototype.setActionHandler = function (action, handler) {
    if (handler === null) handled.delete(action);
    else handled.add(action);
    return set.call(this, action, handler);
  };
};

/** Signs in through the household sign-on, from the page `path`, landing back on it. */
export async function signIn(page: Page, origin: string, path: string) {
  await page.addInitScript(spyOnMediaSession);
  await page.goto(`${origin}${path}`);
  await expect(page).toHaveURL(/\/sign-in\?/);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(`${origin}${path}`);
}

/** The title the server gives `ref` in `medium`'s list. */
export async function titleIn(
  page: Page,
  origin: string,
  medium: string,
  ref: { source: string; id: string },
) {
  const listed = await page.request.get(`${origin}/api/library/${medium}`);
  const { items } = (await listed.json()) as {
    items: { ref: { source: string; id: string }; title: string }[];
  };
  return items.find((i) => keyOf(i.ref) === keyOf(ref))!.title;
}

export /** Every audio element the player made: its file, where it is, whether it plays, its rate. */
const audios = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('audio')].map((a) => ({
      src: a.src === '' ? '' : new URL(a.src).pathname,
      time: a.currentTime,
      paused: a.paused,
      rate: a.playbackRate,
    })),
  );

export /** How far the audio playing has played; 0 while none plays. */
const playedTo = async (page: Page) =>
  Math.max(0, ...(await audios(page)).filter((a) => !a.paused).map((a) => a.time));

export /** The audio plays, and goes on playing. */
async function advances(page: Page) {
  await expect.poll(() => playedTo(page), { timeout: 15_000 }).toBeGreaterThan(0.3);
  const from = await playedTo(page);
  await expect.poll(() => playedTo(page), { timeout: 10_000 }).toBeGreaterThan(from + 0.5);
}

/** The address of `ref`'s page under `path`, its ref's colon written as it is or escaped. */
export const pageOf = (path: string, ref: { source: string; id: string }) =>
  new RegExp(`${path}${ref.source}(?::|%3A)${ref.id}$`);

/** The recorded album's songs, in order, by the titles the server gives them. */
export async function songsIn(page: Page, recorded: Recorded) {
  const album = await page.request.get(`${recorded.origin}/api/items/${keyOf(recorded.album)}`);
  const { tracks } = (await album.json()) as { tracks: { title: string }[] };
  return tracks.map((t) => t.title);
}

/** The title the server gives the recorded show's playing episode. */
export async function episodeTitleIn(page: Page, recorded: Recorded) {
  const show = await page.request.get(`${recorded.origin}/api/items/${keyOf(recorded.show)}`);
  const { episodes } = (await show.json()) as {
    episodes: { ref: { source: string; id: string }; title: string }[];
  };
  return episodes.find((e) => keyOf(e.ref) === keyOf(recorded.episode))!.title;
}

/** How far through `ref` the server says you are, 0-1, or null when not begun. */
export async function progressOf(page: Page, origin: string, ref: { source: string; id: string }) {
  const item = await page.request.get(`${origin}/api/items/${keyOf(ref)}`);
  return ((await item.json()) as { progress: number | null }).progress;
}

/** The seek bar showing: Home seeks to the start, End to the end. */
export const seekBar = (page: Page) => page.getByRole('slider').locator('visible=true').first();

/** Opens `path` from inside the app, as a link does, keeping what plays. */
export const goWithin = (page: Page, path: string) =>
  page.evaluate((to) => {
    history.pushState({}, '', to);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);

/** What the system's media controls say plays. */
export const titlePlaying = (page: Page) =>
  page.evaluate(() => navigator.mediaSession.metadata?.title ?? null);
