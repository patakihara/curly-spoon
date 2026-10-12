import { expect, type Page } from '@playwright/test';

/**
 * The steps the shell's browser tests share: signing in through the stand-in sign-on, reading
 * what the server lists, and watching the player's audio elements.
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
