/**
 * Which extractor binary is in use, and what the canary has said of each. The image brings one under
 * `/opt`, fixed for that image; the daily update keeps others in the data folder, which outlives a
 * release. At start the newest `promoted` still on disk is taken, then the last `kept`, then the
 * image's, and the image's wins whenever it is newer and has not failed: a release brings a newer one.
 */
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { VERSION } from '../adapters/github/schemas.js';
import type { Db } from '../store/connection.js';
import type { CanaryResult } from './canary.js';

export type VersionSource = 'image' | 'release' | 'nightly';
export type VersionState = 'promoted' | 'kept' | 'failed';

export interface VersionRow {
  version: string;
  source: VersionSource;
  state: VersionState;
  promoted_at: number | null;
  canary_at: number | null;
  canary_ms: number | null;
  tier: string | null;
  reason: string | null;
}

export interface CurrentExtractor {
  version: string;
  path: string;
  source: VersionSource;
}

/** The binary's name in every version's folder. */
export const BINARY = 'yt-dlp';

const INCOMING = '.incoming';

export class ExtractorVersions {
  private current: CurrentExtractor;

  constructor(
    private readonly opts: { db: Db; dir: string; imagePath: string; imageVersion: string },
  ) {
    this.current = this.pick();
  }

  /** The binary in use now. The extractor reads this at each run. */
  path = (): string => this.current.path;

  now(): CurrentExtractor {
    return this.current;
  }

  /** Where a downloaded version unpacks before it has passed, and where it goes once checked. */
  incoming(version: string): string {
    return join(this.opts.dir, INCOMING, version);
  }

  folder(version: string): string {
    return join(this.opts.dir, version);
  }

  /** At start: anything half-downloaded goes, and any version's folder no row counts. */
  prepare(): void {
    mkdirSync(this.opts.dir, { recursive: true });
    rmSync(join(this.opts.dir, INCOMING), { recursive: true, force: true });
    const known = new Set(this.rows().map((row) => row.version));
    for (const name of readdirSync(this.opts.dir)) {
      if (VERSION.test(name) && !known.has(name)) {
        rmSync(join(this.opts.dir, name), { recursive: true, force: true });
      }
    }
  }

  rows(): VersionRow[] {
    return this.opts.db
      .prepare('SELECT * FROM extractor_versions ORDER BY version DESC')
      .all() as VersionRow[];
  }

  row(version: string): VersionRow | undefined {
    return this.opts.db
      .prepare('SELECT * FROM extractor_versions WHERE version = ?')
      .get(version) as VersionRow | undefined;
  }

  /** When a canary last gave a result on any version; null before the first. */
  lastCanaryAt(): number | null {
    const { at } = this.opts.db
      .prepare('SELECT MAX(canary_at) AS at FROM extractor_versions')
      .get() as { at: number | null };
    return at;
  }

  /** What the canary said of the version in use. Its state does not move. */
  recordCurrent(result: CanaryResult, at: number): void {
    const { version, source } = this.current;
    this.write(version, source, 'promoted', result, at, at);
  }

  /** A candidate failed: its folder goes, the reason stays, and what is in use does not change. */
  fail(version: string, source: VersionSource, result: CanaryResult, at: number): void {
    this.write(version, source, 'failed', result, at, null);
  }

  /** A candidate passed: it is in use from now, the old one is kept, and anything older goes. */
  promote(version: string, source: VersionSource, result: CanaryResult, at: number): void {
    const { db } = this.opts;
    const before = this.current;
    db.transaction(() => {
      const older = db
        .prepare("SELECT version, source FROM extractor_versions WHERE state <> 'failed'")
        .all() as Pick<VersionRow, 'version' | 'source'>[];
      for (const row of older) {
        if (row.version === before.version) continue;
        db.prepare('DELETE FROM extractor_versions WHERE version = ?').run(row.version);
        if (row.source !== 'image') {
          rmSync(this.folder(row.version), { recursive: true, force: true });
        }
      }
      db.prepare(
        `INSERT INTO extractor_versions (version, source, state, promoted_at)
         VALUES (?, ?, 'kept', ?)
         ON CONFLICT (version) DO UPDATE SET state = 'kept'`,
      ).run(before.version, before.source, at);
      this.write(version, source, 'promoted', result, at, at);
    })();
    this.current = { version, source, path: join(this.folder(version), BINARY) };
  }

  /** What else on disk last passed, best first: the versions to fall back on. */
  fallbacks(): VersionRow[] {
    const rank = (row: VersionRow) => (row.state === 'promoted' ? 0 : 1);
    return this.rows()
      .filter((row) => row.state !== 'failed' && row.version !== this.current.version)
      .filter((row) => this.onDisk(row))
      .sort((a, b) => rank(a) - rank(b));
  }

  /**
   * The version in use failed its canary and `row` passed: `row` is in use from now. The failed one
   * is marked so, and its folder goes, so a start cannot pick it again.
   */
  fallBack(row: VersionRow, result: CanaryResult, at: number): void {
    const before = this.current;
    this.opts.db
      .prepare("UPDATE extractor_versions SET state = 'failed' WHERE version = ?")
      .run(before.version);
    if (before.source !== 'image') {
      rmSync(this.folder(before.version), { recursive: true, force: true });
    }
    this.write(row.version, row.source, 'promoted', result, at, at);
    this.current = this.currentOf(row);
  }

  pathOf(row: Pick<VersionRow, 'version' | 'source'>): string {
    return this.currentOf(row).path;
  }

  private onDisk(row: VersionRow): boolean {
    return row.source === 'image'
      ? row.version === this.opts.imageVersion
      : existsSync(join(this.folder(row.version), BINARY));
  }

  private currentOf(row: Pick<VersionRow, 'version' | 'source'>): CurrentExtractor {
    return {
      version: row.version,
      source: row.source,
      path: row.source === 'image' ? this.opts.imagePath : join(this.folder(row.version), BINARY),
    };
  }

  private write(
    version: string,
    source: VersionSource,
    state: VersionState,
    result: CanaryResult,
    at: number,
    promotedAt: number | null,
  ): void {
    this.opts.db
      .prepare(
        `INSERT INTO extractor_versions
           (version, source, state, promoted_at, canary_at, canary_ms, tier, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (version) DO UPDATE SET
           state = excluded.state,
           promoted_at = COALESCE(extractor_versions.promoted_at, excluded.promoted_at),
           canary_at = excluded.canary_at,
           canary_ms = excluded.canary_ms,
           tier = excluded.tier,
           reason = excluded.reason`,
      )
      .run(
        version,
        source,
        state,
        promotedAt,
        at,
        result.ms,
        result.passed ? result.tier : null,
        result.passed ? null : result.reason,
      );
  }

  private pick(): CurrentExtractor {
    const { imagePath, imageVersion } = this.opts;
    const image: CurrentExtractor = {
      version: imageVersion,
      path: imagePath,
      source: 'image',
    };
    const rows = this.rows().filter((row) => this.onDisk(row));
    const best =
      rows.find((row) => row.state === 'promoted') ?? rows.find((r) => r.state === 'kept');
    if (best === undefined) return image;
    const imageFailed = this.row(imageVersion)?.state === 'failed';
    if (imageVersion > best.version && !imageFailed) return image;
    return this.currentOf(best);
  }
}
