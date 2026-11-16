/**
 * Spotify playlist import on the recorded server, for the browser's tests: Spotify answers from its
 * recordings of All Out 80s (its embed page, its order's two pages and each track's metadata), with
 * the deep-inertia stand-in as every cover, and each track's YouTube Music search from the
 * recordings made for it. The searches are paced by a clock that waits a fiftieth of what it is
 * asked, so a 150-place import takes seconds, not minutes, and is still seen running. Never in the
 * image: only `e2e/` builds this.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Recording, recordingSchema } from '../src/adapters/http/recording.js';
import { replayedSpotify, replayedYtMusic } from '../src/adapters/record-spotify.js';
import { type Clock } from '../src/adapters/musicbrainz/client.js';

/** How much faster than the import's own pace the stand-in runs. */
const FASTER = 50;

const read = (dir: string): Recording[] =>
  readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => recordingSchema.parse(JSON.parse(readFileSync(join(dir, name), 'utf8'))));

export function standInSpotify(options: { adapters: string; art: string }) {
  const dir = join(options.adapters, 'spotify', 'recordings');
  const spotify = replayedSpotify(read(dir));
  const cover = readFileSync(options.art);
  spotify.cover = () => Promise.resolve({ mime: 'image/jpeg', bytes: cover });
  const clock: Clock = {
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms / FASTER)),
  };
  return { spotify, search: replayedYtMusic(read(join(dir, 'ytmusic'))).search, clock };
}
