/**
 * The qBittorrent client (`new QbittorrentClient({ baseUrl, apiKey, fetch })`). Its Web API key goes
 * in a Bearer header on every call, so there is no login and no cookie.
 *
 * An upstream that cannot be reached or broke throws `StepUnavailable`, through `stepFailure`; a
 * refusal stays an `AdapterError`. No call lists torrents without naming hashes or a tag, so that
 * nothing here reads the household's own downloads.
 */
import { AdapterError, type FetchLike, requestJson, type RequestInitJson } from '../http/fetch.js';
import { stepFailure } from '../http/unavailable.js';
import type { ResolvedRelease } from '../prowlarr/client.js';
import { z, type ZodType } from 'zod';
import {
  type QbitFile,
  qbitAddSchema,
  qbitFilesSchema,
  type QbitTorrent,
  qbitTorrentsSchema,
} from './schemas.js';

const CONFLICT = 409;
const ignored = z.unknown();

export interface QbittorrentClientOptions {
  baseUrl: string;
  apiKey: string;
  fetch: FetchLike;
}

export interface AddTorrent {
  torrent: ResolvedRelease;
  category: string;
  tag: string;
}

/** Whether a torrent's row carries exactly this tag; a tag that merely holds it is another tag. */
export const carriesTag = (row: Pick<QbitTorrent, 'tags'>, tag: string): boolean =>
  row.tags.split(/,\s*/).includes(tag);

export class QbittorrentClient {
  constructor(private readonly opts: QbittorrentClientOptions) {}

  private async ask<T>(
    path: string,
    init: RequestInitJson,
    schema: ZodType<T>,
    query: Record<string, string> = {},
  ): Promise<T> {
    const { baseUrl, apiKey, fetch } = this.opts;
    const url = new URL(`api/v2/${path}`, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
    for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
    const headers = { authorization: `Bearer ${apiKey}` };
    try {
      return await requestJson(fetch, url.toString(), { ...init, headers }, schema);
    } catch (error) {
      throw stepFailure('qbittorrent', error);
    }
  }

  async version(): Promise<string> {
    return this.ask('app/version', {}, z.string());
  }

  /**
   * Makes a category, which saves where every download saves. One that exists is no failure.
   * Answers whether this call made it.
   */
  async createCategory(category: string): Promise<boolean> {
    try {
      await this.ask(
        'torrents/createCategory',
        { method: 'POST', form: { category, savePath: '' } },
        ignored,
      );
      return true;
    } catch (error) {
      if (!(error instanceof AdapterError) || error.status !== CONFLICT) throw error;
      return false;
    }
  }

  /**
   * Adds a torrent whole, with no choice of its files: a piece can span a neighbouring file. One it
   * already has answers 409 and stays as it was, which is no failure. Answers whether this call
   * added it.
   */
  async add({ torrent, category, tag }: AddTorrent): Promise<boolean> {
    const fields = { category, tags: tag };
    const init: RequestInitJson =
      torrent.kind === 'magnet'
        ? { method: 'POST', form: { urls: torrent.magnet, ...fields } }
        : { method: 'POST', formData: withTorrentFile(torrent.bytes, fields) };
    try {
      const { failure_count: failed } = await this.ask('torrents/add', init, qbitAddSchema);
      if (failed > 0) throw new AdapterError('parse', 'POST /api/v2/torrents/add', 'not added');
      return true;
    } catch (error) {
      if (!(error instanceof AdapterError) || error.status !== CONFLICT) throw error;
      return false;
    }
  }

  /** The torrents with these hashes. */
  async withHashes(hashes: readonly string[]): Promise<QbitTorrent[]> {
    return this.ask('torrents/info', {}, qbitTorrentsSchema, { hashes: hashes.join('|') });
  }

  /** The torrents of a category carrying a tag, as a torrent's own row says. */
  async withTag(tag: string, category: string): Promise<QbitTorrent[]> {
    const rows = await this.ask('torrents/info', {}, qbitTorrentsSchema, { tag, category });
    return rows.filter((row) => row.category === category && carriesTag(row, tag));
  }

  async files(hash: string): Promise<QbitFile[]> {
    return this.ask('torrents/files', {}, qbitFilesSchema, { hash });
  }

  /** Deletes torrents and their files. A hash it does not have is no failure. */
  async deleteWithFiles(hashes: readonly string[]): Promise<void> {
    await this.ask(
      'torrents/delete',
      { method: 'POST', form: { hashes: hashes.join('|'), deleteFiles: 'true' } },
      ignored,
    );
  }
}

function withTorrentFile(bytes: Uint8Array, fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  form.set(
    'torrents',
    new Blob([Buffer.from(bytes)], { type: 'application/x-bittorrent' }),
    'release.torrent',
  );
  return form;
}
