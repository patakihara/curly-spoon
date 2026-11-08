/**
 * The Cover Art Archive client: a release's or a release group's front cover at 500 px
 * (`new CoverArtClient({ baseUrl, fetch })`). It takes no key. Its answer is a 307 to
 * `archive.org`, which answers a 302 to one of its own nodes, which answers the JPEG (checked live,
 * 8 Nov: 61 to 73 KB in 2.2 to 3.1 s). A redirect is followed only to the archive's own hosts, at
 * most three times; only an image is taken, and no more than 2 MB of it. A cover it has none of
 * (404) is null; anything else that fails throws, and the caller falls back to another cover.
 */
import { AdapterError, type FetchLike } from '../http/fetch.js';
import { readCapped } from '../http/publicFetch.js';

export const COVERART_URL = 'https://coverartarchive.org';

/** The largest cover taken. */
export const COVER_MAX_BYTES = 2 * 1024 * 1024;
const MOST_REDIRECTS = 3;
const COVER_LIMIT_MS = 15_000;

/** The hosts a cover may come from: the archive's API and archive.org with its nodes. */
export function isCoverHost(host: string): boolean {
  const name = host.toLowerCase().replace(/\.$/, '');
  return (
    name === 'coverartarchive.org' ||
    name.endsWith('.coverartarchive.org') ||
    name === 'archive.org' ||
    name.endsWith('.archive.org')
  );
}

export interface Cover {
  mime: string;
  bytes: Buffer;
}

export interface CoverArtClientOptions {
  baseUrl: string;
  fetch: FetchLike;
  timeoutMs?: number;
}

export class CoverArtClient {
  constructor(private readonly opts: CoverArtClientOptions) {}

  /** The release's own front cover, or null when it has none. */
  releaseFront(releaseId: string): Promise<Cover | null> {
    return this.front(`release/${encodeURIComponent(releaseId)}/front-500`);
  }

  /** The front cover the archive picks for the release group, or null when it has none. */
  groupFront(releaseGroupId: string): Promise<Cover | null> {
    return this.front(`release-group/${encodeURIComponent(releaseGroupId)}/front-500`);
  }

  private async front(path: string): Promise<Cover | null> {
    const base = this.opts.baseUrl.endsWith('/') ? this.opts.baseUrl : `${this.opts.baseUrl}/`;
    let url = new URL(path, base);
    const call = `GET /${path.split('/')[0]}/front-500`;
    const signal = AbortSignal.timeout(this.opts.timeoutMs ?? COVER_LIMIT_MS);
    for (let hops = 0; ; hops += 1) {
      let response: Response;
      try {
        response = await this.opts.fetch(url.toString(), { redirect: 'manual', signal });
      } catch (cause) {
        const kind = signal.aborted ? 'timeout' : 'network';
        throw new AdapterError(kind, call, 'the request failed', undefined, { cause });
      }
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        const location = response.headers.get('location');
        if (location === null) throw new AdapterError('parse', call, 'a redirect with no place');
        const next = new URL(location, url);
        if (next.protocol !== 'https:' || !isCoverHost(next.hostname)) {
          throw new AdapterError('parse', call, 'redirected off the archive');
        }
        if (hops >= MOST_REDIRECTS) throw new AdapterError('parse', call, 'too many redirects');
        url = next;
        continue;
      }
      if (response.status === 404) {
        await response.body?.cancel();
        return null;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new AdapterError('status', call, `answered ${response.status}`, response.status);
      }
      const mime = (response.headers.get('content-type') ?? '').split(';')[0]!.trim();
      if (!mime.startsWith('image/')) {
        await response.body?.cancel();
        throw new AdapterError('parse', call, 'the answer is not an image');
      }
      if (Number(response.headers.get('content-length')) > COVER_MAX_BYTES) {
        await response.body?.cancel();
        throw new AdapterError('parse', call, 'the cover is too big');
      }
      const bytes = await readCapped(response, COVER_MAX_BYTES);
      if (bytes === null) throw new AdapterError('parse', call, 'the cover is too big');
      return { mime, bytes: Buffer.from(bytes) };
    }
  }
}
