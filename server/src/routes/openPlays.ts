/**
 * The playback sessions Auralis holds open: one per plan, direct play, transcode or Jellyfin. Each
 * is held for the person and device that planned it, under the ref it plays, and only they reach
 * it. A device holds at most one; planning again closes the one before. One nothing has asked for
 * or reported on within its idle time is closed, so an abandoned transcode never keeps ffmpeg
 * running on the server and an abandoned session never lingers upstream.
 * Held in memory: a restart forgets them, and a player then plans again.
 */
import { type ProgressReport } from '@auralis/schema';

/**
 * How far a report's listening time may run ahead of the server's own clock since the report
 * before, in seconds: the client measures it, and the two clocks and the request's trip differ.
 */
const LISTENED_SLACK_S = 2;

export interface OpenPlay {
  playId: string;
  userId: string;
  deviceId: string;
  /** The ref's key the plan was for, `abs:<id>` or `jellyfin:<id>`. */
  ref: string;
  /** The whole item's length in seconds; a reported position never goes past it. */
  duration: number;
  /** How long it is held with nothing asked of it, in milliseconds. */
  idleMs: number;
  /** Tells the upstream where the person is and how long they listened, as that person. */
  report: (report: ProgressReport) => Promise<void>;
  /** Closes the session upstream, as the person who opened it, with a last report when given. */
  close: (report?: ProgressReport) => Promise<void>;
}

interface Held extends OpenPlay {
  lastSeen: number;
  /** When the last report was taken, or the play opened; listening is counted from here. */
  lastReportAt: number;
  /** Where the last report left the person, if one came. */
  lastPosition?: number;
}

interface Owner {
  userId: string;
  deviceId: string;
}

export class OpenPlays {
  private readonly held = new Map<string, Held>();

  constructor(private readonly options: { now: () => number }) {}

  /** Holds `play` for its device, closing whatever that device held before. */
  async open(play: OpenPlay): Promise<void> {
    await this.closeDevice(play.userId, play.deviceId, play.playId);
    const now = this.options.now();
    this.held.set(play.playId, { ...play, lastSeen: now, lastReportAt: now });
  }

  /** Closes what a device holds, when it plans something new; `keep` is the new plan's own id. */
  async closeDevice(userId: string, deviceId: string, keep?: string): Promise<void> {
    for (const held of [...this.held.values()]) {
      if (held.userId === userId && held.deviceId === deviceId && held.playId !== keep) {
        await this.end(held);
      }
    }
  }

  /** The play, if this person's device opened it under this ref, marked as just asked for. */
  touch(playId: string, owner: Owner & { ref: string }): OpenPlay | null {
    const held = this.owned(playId, owner);
    if (held !== null) held.lastSeen = this.options.now();
    return held;
  }

  /**
   * Passes a report on, if this person's device holds the play: the position kept within the
   * item, and the listening time within the time since the last report taken, so a repeated or
   * bogus report never counts listening twice. False when the device holds no such play.
   */
  async report(playId: string, owner: Owner, report: ProgressReport): Promise<boolean> {
    const held = this.owned(playId, owner);
    if (held === null) return false;
    const now = this.options.now();
    const since = held.lastReportAt;
    const bounded = this.bounded(held, report, since);
    held.lastSeen = now;
    // Taken before the upstream answers, so a report sent alongside counts only what is left.
    held.lastReportAt = now;
    try {
      await held.report(bounded);
    } catch (error) {
      // Not counted upstream: the client reports the same listening again with its next report.
      if (held.lastReportAt === now) held.lastReportAt = since;
      throw error;
    }
    held.lastPosition = bounded.position;
    return true;
  }

  /** Stops holding the play, if this person's device opened it, and closes it with `report`. */
  async finish(playId: string, owner: Owner, report?: ProgressReport): Promise<boolean> {
    const held = this.owned(playId, owner);
    if (held === null) return false;
    this.held.delete(playId);
    await held.close(
      report === undefined ? undefined : this.bounded(held, report, held.lastReportAt),
    );
    return true;
  }

  /** Closes every play nothing has asked for within its idle time. */
  async sweep(): Promise<void> {
    const now = this.options.now();
    for (const held of [...this.held.values()]) {
      if (now - held.lastSeen > held.idleMs) await this.end(held);
    }
  }

  /** Closes everything held, when the server stops. */
  async closeAll(): Promise<void> {
    for (const held of [...this.held.values()]) await this.end(held);
  }

  private bounded(held: Held, report: ProgressReport, since: number): ProgressReport {
    const elapsed = Math.max(0, (this.options.now() - since) / 1000);
    return {
      position: Math.min(report.position, held.duration),
      listened: Math.min(report.listened, elapsed + LISTENED_SLACK_S),
      paused: report.paused,
    };
  }

  private owned(playId: string, owner: Owner & { ref?: string }): Held | null {
    const held = this.held.get(playId);
    if (held === undefined || held.userId !== owner.userId || held.deviceId !== owner.deviceId) {
      return null;
    }
    return owner.ref === undefined || held.ref === owner.ref ? held : null;
  }

  /**
   * Closes a play nobody closed: at the last reported position with no listening added, or with
   * no report when none came, so a plan never played writes no progress.
   */
  private async end(held: Held): Promise<void> {
    this.held.delete(held.playId);
    const last =
      held.lastPosition === undefined
        ? undefined
        : { position: held.lastPosition, listened: 0, paused: true };
    // A failed close loses nothing more than the upstream's own stale-session sweep cleans up.
    await held.close(last).catch(() => undefined);
  }
}
