/**
 * Keeping a song by playing it. A play of a streamed song keeps it for the person once its
 * position reaches 90% of the song and its listening adds up to at least 60% of it, so a few
 * seconds never keep a song, nor does a skip to the end, while a song played through at 1.5x does.
 * The listening is the wall-clock time the server took from the play's reports, already bounded by
 * its own clock, so a seek adds none.
 *
 * Each person has a song kept this way once, ever (`auto_keeps`): what is noted first is asked,
 * so someone who cancels an auto-kept song is not asked again by the next play, though they may
 * still keep it by hand. Another person's play joins the keep under way, as any keep does. Asking
 * runs beside the report and never fails it: a refusal, such as too many requests, is logged.
 */
import type { Db } from '../store/connection.js';

/** How far into the song a play must reach, as a share of its length. */
export const AUTO_KEEP_POSITION = 0.9;
/** How much of the song the play must have listened to, as a share of its length. */
export const AUTO_KEEP_LISTENED = 0.6;

export interface AutoKeepDeps {
  db: Db;
  /** Keeps a song for a person, as `POST /keep` does. */
  keep: (userId: string, youtubeMusicId: string) => Promise<unknown>;
  now: () => number;
  log: { warn: (details: Record<string, unknown>, message: string) => void };
}

/** One report of a play: where the person is, and how long they listened since the last. */
export interface Heard {
  position: number;
  listened: number;
}

export class AutoKeep {
  constructor(private readonly deps: AutoKeepDeps) {}

  /** A new play of a song by a person: each of its reports is told to what this answers. */
  play(userId: string, youtubeMusicId: string, duration: number): (heard: Heard) => void {
    let listened = 0;
    let done = false;
    return ({ position, listened: more }) => {
      listened += more;
      if (done || duration <= 0) return;
      if (position < duration * AUTO_KEEP_POSITION) return;
      if (listened < duration * AUTO_KEEP_LISTENED) return;
      done = true;
      this.keepOnce(userId, youtubeMusicId);
    };
  }

  private keepOnce(userId: string, youtubeMusicId: string): void {
    const { db, keep, now, log } = this.deps;
    try {
      const noted = db
        .prepare(
          'INSERT OR IGNORE INTO auto_keeps (user_id, youtube_music_id, at) VALUES (?, ?, ?)',
        )
        .run(userId, youtubeMusicId, now());
      if (noted.changes === 0) return;
    } catch (err) {
      log.warn({ err }, 'a song played through could not be noted, so it is not kept');
      return;
    }
    keep(userId, youtubeMusicId).catch((err: unknown) => {
      log.warn({ err }, 'a song played through was not kept');
    });
  }
}
