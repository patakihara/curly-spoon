/**
 * What a `.torrent` holds, read before anything is downloaded: its files with their sizes, and the
 * web seeds its `url-list` names (an archive serving the same files over HTTP, so the torrent lives
 * with no peer). The bytes are a third party's, so the reader is capped: a file past 8 MiB, nesting
 * past `torrentId.ts`'s 64 levels, more than 10,000 files, or a path that could leave the torrent's
 * folder (`..`, `.`, an empty part, a slash or a NUL inside a part) gives `null`, never a throw.
 */
import { infoHashFromTorrentFile } from './torrentId.js';

/** The torrent client's own cap on a torrent's bytes, and this reader's. */
export const TORRENT_MAX_BYTES = 8 * 1024 * 1024;
const MAX_DEPTH = 64;
const MAX_FILES = 10_000;

export interface TorrentFile {
  /** Its path as the torrent client lays it out: the torrent's name, then the file's own parts. */
  path: string;
  size: number;
}

export interface TorrentContents {
  /** The info hash, lowercase hex. */
  hash: string;
  name: string;
  files: TorrentFile[];
  /** The `url-list`'s web addresses, in its order. */
  webSeeds: string[];
}

type Value = number | Uint8Array | Value[] | Map<string, Value>;

/** The value at `at` and where it ends; null for anything malformed, too deep or past the end. */
function decode(
  bytes: Uint8Array,
  at: number,
  depth: number,
): { value: Value; end: number } | null {
  if (depth > MAX_DEPTH || at >= bytes.length) return null;
  const marker = bytes[at]!;
  if (marker === 0x69 /* i */) {
    const end = bytes.indexOf(0x65 /* e */, at + 1);
    if (end === -1) return null;
    const text = Buffer.from(bytes.subarray(at + 1, end)).toString('latin1');
    if (!/^-?\d{1,15}$/.test(text)) return null;
    return { value: Number(text), end: end + 1 };
  }
  if (marker >= 0x30 && marker <= 0x39) {
    const colon = bytes.indexOf(0x3a /* : */, at);
    if (colon === -1 || colon - at > 10) return null;
    const text = Buffer.from(bytes.subarray(at, colon)).toString('latin1');
    if (!/^\d+$/.test(text)) return null;
    const end = colon + 1 + Number(text);
    if (end > bytes.length) return null;
    return { value: bytes.subarray(colon + 1, end), end };
  }
  if (marker === 0x6c /* l */ || marker === 0x64 /* d */) {
    const list: Value[] = [];
    let i = at + 1;
    while (i < bytes.length && bytes[i] !== 0x65) {
      const item = decode(bytes, i, depth + 1);
      if (item === null) return null;
      list.push(item.value);
      i = item.end;
    }
    if (i >= bytes.length) return null;
    if (marker === 0x6c) return { value: list, end: i + 1 };
    if (list.length % 2 !== 0) return null;
    const dict = new Map<string, Value>();
    for (let k = 0; k < list.length; k += 2) {
      const key = list[k];
      if (!(key instanceof Uint8Array)) return null;
      dict.set(Buffer.from(key).toString('utf8'), list[k + 1]!);
    }
    return { value: dict, end: i + 1 };
  }
  return null;
}

const text = (value: Value | undefined): string | null =>
  value instanceof Uint8Array ? Buffer.from(value).toString('utf8') : null;

const size = (value: Value | undefined): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

/** A path part that stays inside its folder. */
const safePart = (part: string | null): part is string =>
  part !== null && part !== '' && part !== '.' && part !== '..' && !/[/\\\0]/.test(part);

function filesOf(info: Map<string, Value>, name: string): TorrentFile[] | null {
  const listed = info.get('files');
  if (listed === undefined) {
    const length = size(info.get('length'));
    return length === null ? null : [{ path: name, size: length }];
  }
  if (!Array.isArray(listed) || listed.length > MAX_FILES) return null;
  const files: TorrentFile[] = [];
  for (const entry of listed) {
    if (!(entry instanceof Map)) return null;
    const length = size(entry.get('length'));
    const parts = entry.get('path.utf-8') ?? entry.get('path');
    if (length === null || !Array.isArray(parts) || parts.length === 0) return null;
    const names = parts.map(text);
    if (!names.every(safePart)) return null;
    files.push({ path: [name, ...names].join('/'), size: length });
  }
  return files;
}

function webSeedsOf(value: Value | undefined): string[] {
  const listed = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return listed.map(text).filter((url): url is string => url !== null && /^https?:\/\//i.test(url));
}

/** A torrent's files and web seeds, or null for anything that is not a sound, small torrent. */
export function torrentContents(bytes: Uint8Array): TorrentContents | null {
  if (bytes.length > TORRENT_MAX_BYTES) return null;
  const top = decode(bytes, 0, 0);
  if (top === null || top.end !== bytes.length || !(top.value instanceof Map)) return null;
  const info = top.value.get('info');
  if (!(info instanceof Map)) return null;
  const name = text(info.get('name.utf-8')) ?? text(info.get('name'));
  if (!safePart(name)) return null;
  const files = filesOf(info, name);
  const hash = infoHashFromTorrentFile(bytes);
  if (files === null || hash === null) return null;
  return { hash, name, files, webSeeds: webSeedsOf(top.value.get('url-list')) };
}

/**
 * The exact bytes of a torrent's `info` dictionary, which its hash is taken over; null as
 * `torrentContents` would answer null.
 */
export function infoBytes(bytes: Uint8Array): Uint8Array | null {
  if (torrentContents(bytes) === null) return null;
  let i = 1;
  while (bytes[i] !== 0x65) {
    const key = decode(bytes, i, 1)!;
    const value = decode(bytes, key.end, 1)!;
    if (text(key.value) === 'info') return bytes.subarray(key.end, value.end);
    i = value.end;
  }
  return null;
}
