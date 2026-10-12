/**
 * The playback sessions Auralis holds open: one per plan, direct play, transcode or Jellyfin. Each
 * is held for the person and device that planned it, under the ref it plays, and only they reach
 * it. A device holds at most one; planning again closes the one before, and a device's plans are
 * taken one at a time, so two at once leave it holding the later. One nothing has asked for
 * or reported on within its idle time is closed, so an abandoned transcode never keeps ffmpeg
 * running on the server and an abandoned session never lingers upstream.
 * Held in memory: a restart forgets them, and a player then plans again.
 */
import { type ProgressAnswer, type ProgressReport } from '@auralis/schema';
import type { HeldPlan, PlanEntry } from '../queues/sessions.js';

/**
 * How far the listening time reported may run ahead of the server's own clock, in seconds, over
 * all of a play's reports together: the client measures it, and the two clocks and the requests'
 * trips differ. A report that uses some leaves that much less for the next.
 */
const LISTENED_SLACK_S = 2;

/** A report as an upstream is told it: in order, bounded, with no number of its own. */
export type UpstreamReport = Omit<ProgressReport, 'seq'>;

export interface OpenPlay {
  playId: string;
  userId: string;
  deviceId: string;
  /** The ref's key the plan was for, `abs:<id>` or `jellyfin:<id>`. */
  ref: string;
  /** What the plan plays as the listening session queues it, each where it starts in the plan. */
  entries: readonly PlanEntry[];
  /** The whole item's length in seconds; a reported position never goes past it. */
  duration: number;
  /** How long it is held with nothing asked of it, in milliseconds. */
  idleMs: number;
  /** Tells the upstream where the person is and how long they listened, as that person. */
  report: (report: UpstreamReport) => Promise<void>;
  /** Closes the session upstream, as the person who opened it, with a last report when given. */
  close: (report?: UpstreamReport) => Promise<void>;
}

interface Held extends OpenPlay {
  lastSeen: number;
  /** When the last report was taken, or the play opened; listening is counted from here. */
  lastReportAt: number;
  /** Where the last report left the person, if one came. */
  lastPosition?: number;
  /** The number of the newest report taken; one no newer is dropped. */
  lastSeq?: number;
  /** How far the listening counted so far runs ahead of the server's clock, in seconds. */
  ahead: number;
}

interface Owner {
  userId: string;
  deviceId: string;
}

export class OpenPlays {
  private readonly held = new Map<string, Held>();
  /** Each device's newest plan being taken, by `userId deviceId`; the next waits for it. */
  private readonly planning = new Map<string, Promise<unknown>>();

  constructor(private readonly options: { now: () => number }) {}

  /** Takes `plan` for a device once every plan that device asked for before it is taken. */
  async planOn<T>(owner: Owner, plan: () => Promise<T>): Promise<T> {
    const key = `${owner.userId} ${owner.deviceId}`;
    const before = this.planning.get(key) ?? Promise.resolve();
    const taken = before.catch(() => undefined).then(plan);
    this.planning.set(key, taken);
    try {
      return await taken;
    } finally {
      if (this.planning.get(key) === taken) this.planning.delete(key);
    }
  }

  /** Holds `play` for its device, closing whatever that device held before. */
  async open(play: OpenPlay): Promise<void> {
    await this.closeDevice(play.userId, play.deviceId, play.playId);
    const now = this.options.now();
    this.held.set(play.playId, { ...play, lastSeen: now, lastReportAt: now, ahead: 0 });
  }

  /** Closes what a device holds, when it plans something new; `keep` is the new plan's own id. */
  async closeDevice(userId: string, deviceId: string, keep?: string): Promise<void> {
    for (const held of [...this.held.values()]) {
      if (held.userId === userId && held.deviceId === deviceId && held.playId !== keep) {
        await this.end(held);
      }
    }
  }

  /** The plan this person's device holds under `playId`: its ref key and entries; or null. */
  planOf(playId: string, owner: Owner): HeldPlan | null {
    const held = this.owned(playId, owner);
    return held === null ? null : { ref: held.ref, entries: held.entries };
  }

  /** The ref key of the play a device holds now, or null when it holds none. */
  heldBy(owner: Owner): string | null {
    for (const held of this.held.values()) {
      if (held.userId === owner.userId && held.deviceId === owner.deviceId) return held.ref;
    }
    return null;
  }

  /** The play, if this person's device opened it under this ref, marked as just asked for. */
  touch(playId: string, owner: Owner & { ref: string }): OpenPlay | null {
    const held = this.owned(playId, owner);
    if (held !== null) held.lastSeen = this.options.now();
    return held;
  }

  /**
   * Passes a report on, if this person's device holds the play: the position kept within the
   * item, and the listening time within the time since the last report taken, so a bogus report
   * never counts more listening than there was time for. A report no newer than one already
   * taken, late or repeated, is dropped. Says whether the report was taken, and the number of the
   * last one taken; null when the device holds no such play.
   */
  async report(
    playId: string,
    owner: Owner,
    report: ProgressReport,
  ): Promise<ProgressAnswer | null> {
    const held = this.owned(playId, owner);
    if (held === null) return null;
    const now = this.options.now();
    held.lastSeen = now;
    if (held.lastSeq !== undefined && report.seq <= held.lastSeq) {
      return { taken: false, lastSeq: held.lastSeq };
    }
    const before = { lastSeq: held.lastSeq, lastReportAt: held.lastReportAt, ahead: held.ahead };
    const bounded = this.bounded(held, report);
    // Taken before the upstream answers, so a report sent alongside counts only what is left.
    held.lastSeq = report.seq;
    held.lastReportAt = now;
    held.ahead = bounded.ahead;
    try {
      await held.report(bounded.report);
    } catch (error) {
      // Not taken upstream: the client reports the same listening again, under the same number
      // or a newer one.
      if (held.lastSeq === report.seq) Object.assign(held, before);
      throw error;
    }
    // A newer report taken meanwhile keeps its own position.
    if (held.lastSeq === report.seq) held.lastPosition = bounded.report.position;
    return { taken: true, lastSeq: report.seq };
  }

  /**
   * Stops holding the play, if this person's device opened it, and closes it with `report`; with
   * a report no newer than one already taken, at the last position taken with no listening added.
   */
  async finish(playId: string, owner: Owner, report?: ProgressReport): Promise<boolean> {
    const held = this.owned(playId, owner);
    if (held === null) return false;
    this.held.delete(playId);
    if (report === undefined) await held.close();
    else if (this.stale(held, report)) await held.close(this.lastTaken(held));
    else await held.close(this.bounded(held, report).report);
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

  private stale(held: Held, report: ProgressReport): boolean {
    return held.lastSeq !== undefined && report.seq <= held.lastSeq;
  }

  /**
   * The report as it may reach the upstream, and how far the listening counted then runs ahead of
   * the server's clock: listening may use what is left of the slack, never the whole slack again.
   */
  private bounded(held: Held, report: ProgressReport): { report: UpstreamReport; ahead: number } {
    const elapsed = Math.max(0, (this.options.now() - held.lastReportAt) / 1000);
    const listened = Math.min(
      report.listened,
      Math.max(0, elapsed + LISTENED_SLACK_S - held.ahead),
    );
    return {
      report: {
        position: Math.min(report.position, held.duration),
        listened,
        paused: report.paused,
      },
      ahead: Math.max(0, held.ahead + listened - elapsed),
    };
  }

  /** Where the last report taken left the person, adding no listening; none when none came. */
  private lastTaken(held: Held): UpstreamReport | undefined {
    return held.lastPosition === undefined
      ? undefined
      : { position: held.lastPosition, listened: 0, paused: true };
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
    // A failed close loses nothing more than the upstream's own stale-session sweep cleans up.
    await held.close(this.lastTaken(held)).catch(() => undefined);
  }
}
