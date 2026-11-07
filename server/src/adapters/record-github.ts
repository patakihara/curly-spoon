/**
 * Record mode's `github` part: yt-dlp's latest stable and nightly releases and the checksum file
 * beside them, for the extractor's update. Public reads, with no token. Each release is cut to the
 * assets the update reads.
 */
import { join } from 'node:path';
import { type FetchLike } from './http/fetch.js';
import { createRecorder } from './http/record.js';
import { PLACEHOLDER_ORIGIN, type RawExchange } from './http/scrub.js';

export const GITHUB_VERSION = 'REST 2022-11-28';

const KEPT_ASSET = /^(?:yt-dlp_musllinux(?:_aarch64)?\.zip|SHA2-256SUMS)$/;
const RELEASES = [
  ['latest-release', 'repos/yt-dlp/yt-dlp/releases/latest'],
  ['latest-nightly', 'repos/yt-dlp/yt-dlp-nightly-builds/releases/latest'],
] as const;

/**
 * A release answer with only the fields and assets the update reads, each download's address on the
 * recordings' placeholder origin; a checksum file with only those assets' lines.
 */
export function trimGithubExchange(raw: RawExchange): RawExchange {
  const body = raw.response.body;
  if (body === null || typeof body !== 'object') return raw;
  if ('text' in body) {
    const lines = body.text
      .split('\n')
      .filter((line) => KEPT_ASSET.test(line.split(/ +/)[1] ?? ''));
    return { ...raw, response: { ...raw.response, body: { text: `${lines.join('\n')}\n` } } };
  }
  if (!('json' in body)) return raw;
  const release = body.json as {
    tag_name: string;
    assets: { name: string; browser_download_url: string; size: number }[];
  };
  const assets = release.assets
    .filter((asset) => KEPT_ASSET.test(asset.name))
    .map(({ name, browser_download_url, size }) => ({
      name,
      browser_download_url: `${PLACEHOLDER_ORIGIN}${new URL(browser_download_url).pathname}`,
      size,
    }));
  return {
    ...raw,
    response: { ...raw.response, body: { json: { tag_name: release.tag_name, assets } } },
  };
}

export async function recordGithub(input: {
  fetch: FetchLike;
  out: (line: string) => void;
  root: string;
}): Promise<{ written: string[] }> {
  const dir = join(input.root, 'github', 'recordings');
  const baseUrl = 'https://api.github.com';
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'auralis-recorder' };
  const rec = createRecorder({
    fetch: input.fetch,
    dir,
    upstream: 'github',
    upstreamVersion: GITHUB_VERSION,
    secrets: [],
    baseUrl,
    prepare: trimGithubExchange,
  });
  const written: string[] = [];
  let sumsUrl = '';
  for (const [call, path] of RELEASES) {
    const release = await rec.capture(call, async () => {
      const answer = await rec.fetch(`${baseUrl}/${path}`, { headers });
      return (await answer.clone().json()) as { tag_name: string };
    });
    written.push(join(dir, `${call}.json`));
    if (call === 'latest-release') {
      sumsUrl = `https://github.com/yt-dlp/yt-dlp/releases/download/${release.tag_name}/SHA2-256SUMS`;
    }
    input.out(`recorded ${call}`);
  }
  await rec.capture('sums', async () => {
    const answer = await rec.fetch(sumsUrl, { headers });
    return answer.clone().text();
  });
  written.push(join(dir, 'sums.json'));
  input.out('recorded sums');
  return { written };
}
