/**
 * Whether songs from outside the library can play now. Three plays failing in five minutes, for a
 * reason that isn't the track's own, or a canary failing on every version, makes streaming
 * unavailable, with the reason kept for admin; any success clears it. What is held on disk plays
 * regardless, and nothing owned ever comes here.
 */
const FAILURES_TO_FLIP = 3;
const WITHIN_MS = 5 * 60_000;

export class StreamingState {
  private failures: number[] = [];
  private why: string | null = null;

  constructor(private readonly now: () => number) {}

  get available(): boolean {
    return this.why === null;
  }

  get reason(): string | null {
    return this.why;
  }

  /** A play failed for a reason that says something of streaming as a whole. */
  playFailed(reason: string): void {
    const now = this.now();
    this.failures = [...this.failures.filter((at) => now - at < WITHIN_MS), now];
    if (this.failures.length >= FAILURES_TO_FLIP) this.why = reason;
  }

  /** The canary failed on every version. */
  canaryFailed(reason: string): void {
    this.why = reason;
  }

  succeeded(): void {
    this.failures = [];
    this.why = null;
  }
}
