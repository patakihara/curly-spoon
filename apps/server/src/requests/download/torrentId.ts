/**
 * Deriving the one identifier that survives everything: the lowercased BitTorrent info
 * hash. Indexers hand us either a magnet URI or a `.torrent` file, and `DownloadClientProvider`
 * needs a single stable handle before it can even talk to a client — so this module has no
 * dependency on any provider and can be tested in complete isolation from both of them.
 */

import { createHash } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** `bytes[i]`, but `-1` past the end instead of `undefined` — keeps every comparison below a plain number check under `noUncheckedIndexedAccess`. */
function byteAt(bytes: Uint8Array, i: number): number {
  return i < bytes.length ? bytes[i]! : -1;
}

/**
 * Decodes RFC 4648 base32 (no padding required) into raw bytes. BitTorrent v1 magnets
 * encode the 20-byte info hash this way when they don't use hex, so a 32-character base32
 * string must decode to exactly 20 bytes to be a valid btih.
 */
function decodeBase32(input: string): Uint8Array | null {
  const clean = input.toUpperCase().replace(/=+$/u, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) return null;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

/**
 * Pulls the info hash out of a magnet URI's `xt=urn:btih:<hash>` parameter. `urn:btmh:`
 * (BitTorrent v2, a different hash scheme entirely) and anything malformed degrade to
 * `null` rather than throwing — a rejected magnet is data the caller reports, not a crash.
 */
export function infoHashFromMagnet(magnetUri: string): string | null {
  let params: URLSearchParams;
  try {
    const queryStart = magnetUri.indexOf('?');
    if (queryStart === -1) return null;
    params = new URLSearchParams(magnetUri.slice(queryStart + 1));
  } catch {
    return null;
  }

  for (const xt of params.getAll('xt')) {
    const match = /^urn:btih:([A-Za-z0-9]+)$/u.exec(xt.trim());
    if (!match) continue;
    // The capture group is non-optional in the pattern above, so a successful match always
    // has it.
    const raw = match[1]!;
    if (/^[0-9A-Fa-f]{40}$/u.test(raw)) {
      return raw.toLowerCase();
    }
    if (/^[A-Za-z2-7]{32}$/u.test(raw)) {
      const decoded = decodeBase32(raw);
      if (decoded && decoded.length === 20) {
        return Buffer.from(decoded).toString('hex');
      }
    }
  }
  return null;
}

/** The result of scanning one bencoded value: where it ends, and (for strings) its bytes. */
interface ScanResult {
  /** Offset of the byte immediately after this value. */
  end: number;
}

/**
 * Finds the end of the bencoded value starting at `offset`, without building any parsed
 * representation of it — we only ever need byte ranges, never the decoded value, because
 * re-encoding a parsed structure reorders dict keys and produces a hash no tracker
 * recognises. Returns `null` when the bytes at `offset` are not a valid bencode value
 * (including running off the end of the buffer), so a truncated file degrades to `null`
 * instead of throwing.
 *
 * `depth` is a hard recursion limit, and it is load-bearing rather than defensive. These
 * bytes come from a `.torrent` URL an indexer handed us — third-party content — and
 * bencode nests one byte per level, so a file well under 10 KB can be thousands of lists
 * deep. Without the limit that overflows the stack and throws a raw `RangeError` straight
 * through `add()`, which both breaks this module's "degrades to null" contract and turns a
 * hostile file into a downed request pipeline. No legitimate torrent nests anywhere near
 * this far: the deepest real structure is `info.files[].path[]`, about four levels.
 */
const MAX_BENCODE_DEPTH = 64;

function scanValue(bytes: Uint8Array, offset: number, depth = 0): ScanResult | null {
  if (offset >= bytes.length) return null;
  if (depth > MAX_BENCODE_DEPTH) return null;
  const marker = byteAt(bytes, offset);

  // Integer: i<digits>e
  if (marker === 0x69 /* 'i' */) {
    let i = offset + 1;
    if (byteAt(bytes, i) === 0x2d /* '-' */) i += 1;
    const digitsStart = i;
    while (byteAt(bytes, i) >= 0x30 && byteAt(bytes, i) <= 0x39) i += 1;
    if (i === digitsStart || byteAt(bytes, i) !== 0x65 /* 'e' */) return null;
    return { end: i + 1 };
  }

  // Byte string: <len>:<bytes>
  if (marker >= 0x30 && marker <= 0x39) {
    const lenResult = scanByteStringLength(bytes, offset);
    if (!lenResult) return null;
    const { length, headerEnd } = lenResult;
    const end = headerEnd + length;
    if (end > bytes.length) return null;
    return { end };
  }

  // List: l...e
  if (marker === 0x6c /* 'l' */) {
    let i = offset + 1;
    while (byteAt(bytes, i) !== 0x65 /* 'e' */ && i < bytes.length) {
      const inner = scanValue(bytes, i, depth + 1);
      if (!inner) return null;
      i = inner.end;
    }
    if (i >= bytes.length) return null;
    return { end: i + 1 };
  }

  // Dict: d...e, alternating key/value
  if (marker === 0x64 /* 'd' */) {
    let i = offset + 1;
    while (byteAt(bytes, i) !== 0x65 /* 'e' */ && i < bytes.length) {
      const key = scanValue(bytes, i, depth + 1);
      if (!key) return null;
      const val = scanValue(bytes, key.end, depth + 1);
      if (!val) return null;
      i = val.end;
    }
    if (i >= bytes.length) return null;
    return { end: i + 1 };
  }

  return null;
}

/** Parses the `<len>:` header of a bencoded byte string, returning the length and where the bytes start. */
function scanByteStringLength(
  bytes: Uint8Array,
  offset: number,
): { length: number; headerEnd: number } | null {
  let i = offset;
  const digitsStart = i;
  while (byteAt(bytes, i) >= 0x30 && byteAt(bytes, i) <= 0x39) i += 1;
  if (i === digitsStart || byteAt(bytes, i) !== 0x3a /* ':' */) return null;
  const lengthStr = Buffer.from(bytes.slice(digitsStart, i)).toString('ascii');
  const length = Number.parseInt(lengthStr, 10);
  if (!Number.isFinite(length) || length < 0) return null;
  return { length, headerEnd: i + 1 };
}

/**
 * The info hash of a `.torrent` file is the SHA-1 of the raw bencoded bytes of its `info`
 * dict value — not a hash of anything we've parsed. We therefore only ever locate the byte
 * range of the top-level `info` value and hash that exact slice; we never reconstruct or
 * re-encode it, which is the classic way to produce a hash trackers silently reject.
 */
export function infoHashFromTorrentFile(bytes: Uint8Array): string | null {
  if (bytes.length === 0 || byteAt(bytes, 0) !== 0x64 /* must be a top-level dict */) return null;

  let i = 1;
  while (i < bytes.length && byteAt(bytes, i) !== 0x65 /* 'e' */) {
    const key = scanValue(bytes, i);
    if (!key) return null;
    const val = scanValue(bytes, key.end);
    if (!val) return null;

    // Is this key literally "4:info"?
    const keyBytes = bytes.slice(i, key.end);
    if (keyBytes.length === 6 && Buffer.from(keyBytes).toString('ascii') === '4:info') {
      const infoSlice = bytes.slice(key.end, val.end);
      return createHash('sha1').update(infoSlice).digest('hex');
    }

    i = val.end;
  }
  return null;
}
