/**
 * The playback sessions Auralis keeps open upstream: today, each transcode. Each is held for the
 * person and device that planned it, under the ref it plays, and only they reach it. A device
 * holds at most one; planning again closes the one before. One nothing has asked for within the
 * idle time is closed, so an abandoned transcode never keeps ffmpeg running on the server.
 * Held in memory: a restart forgets them, and a player then plans again.
 */
export interface OpenPlay {
  playId: string;
  userId: string;
  deviceId: string;
  /** The ref's key the plan was for, `abs:<id>`. */
  ref: string;
  /** Closes the session upstream, as the person who opened it. */
  close: () => Promise<void>;
}

interface Held extends OpenPlay {
  lastSeen: number;
}

export class OpenPlays {
  private readonly held = new Map<string, Held>();

  constructor(private readonly options: { idleMs: number; now: () => number }) {}

  /** Holds `play` for its device, closing whatever that device held before. */
  async open(play: OpenPlay): Promise<void> {
    await this.closeDevice(play.userId, play.deviceId, play.playId);
    this.held.set(play.playId, { ...play, lastSeen: this.options.now() });
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
  touch(playId: string, owner: { userId: string; deviceId: string; ref: string }): OpenPlay | null {
    const held = this.owned(playId, owner);
    if (held !== null) held.lastSeen = this.options.now();
    return held;
  }

  /** Stops holding the play, if this person's device opened it, and hands it back to close. */
  take(playId: string, owner: { userId: string; deviceId: string }): OpenPlay | null {
    const held = this.owned(playId, owner);
    if (held !== null) this.held.delete(playId);
    return held;
  }

  /** Closes every play nothing has asked for within the idle time. */
  async sweep(): Promise<void> {
    const now = this.options.now();
    for (const held of [...this.held.values()]) {
      if (now - held.lastSeen > this.options.idleMs) await this.end(held);
    }
  }

  /** Closes everything held, when the server stops. */
  async closeAll(): Promise<void> {
    for (const held of [...this.held.values()]) await this.end(held);
  }

  private owned(
    playId: string,
    owner: { userId: string; deviceId: string; ref?: string },
  ): Held | null {
    const held = this.held.get(playId);
    if (held === undefined || held.userId !== owner.userId || held.deviceId !== owner.deviceId) {
      return null;
    }
    return owner.ref === undefined || held.ref === owner.ref ? held : null;
  }

  private async end(held: Held): Promise<void> {
    this.held.delete(held.playId);
    // A failed close loses nothing more than ABS's own stale-session sweep will clean up.
    await held.close().catch(() => undefined);
  }
}
