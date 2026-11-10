/**
 * ID3v2 tags (id3.org's 2.3.0 and 2.4.0 structure and frames documents): reading one at a file's
 * start, and building Auralis's tags as ID3v2.4 frames under Picard's names, UTF-8. A 2.3 frame
 * kept from a file is carried into 2.4 with its header rewritten; a 2.2 tag keeps nothing.
 */
import { type TrackTags, TagsRefused } from '../tags.js';

export interface Id3Frame {
  readonly id: string;
  /** The frame's two flag bytes, as ID3v2.4 lays them out. */
  readonly flags: number;
  readonly body: Buffer;
}

export interface Id3Tag {
  /** 2, 3 or 4. */
  readonly major: number;
  /** Every byte the tag takes: header, body, padding and any footer. */
  readonly length: number;
  readonly frames: readonly Id3Frame[];
}

export const MUSICBRAINZ_UFID_OWNER = 'http://musicbrainz.org';
const UTF8 = 3;
/** The longest tag read: a picture rarely makes a tag a tenth of this. */
const MAX_TAG = 64 * 1024 * 1024;
const FRAME_ID = /^[A-Z0-9]{4}$/;

function syncsafe(bytes: Buffer, at: number): number | null {
  const part = bytes.subarray(at, at + 4);
  if (part.some((byte) => byte > 0x7f)) return null;
  return (part[0]! << 21) | (part[1]! << 14) | (part[2]! << 7) | part[3]!;
}

function toSyncsafe(n: number): Buffer {
  if (n >= 1 << 28) throw new TagsRefused('an ID3 tag is too long');
  return Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]);
}

/** The bytes an ID3v2 tag at the start of `head` (its first 10 bytes) takes, or 0. */
export function id3v2Length(head: Buffer): number {
  if (head.length < 10 || head.toString('latin1', 0, 3) !== 'ID3') return 0;
  const size = syncsafe(head, 6);
  if (size === null) throw new TagsRefused('an ID3 tag’s size is not valid');
  const footer = head[3] === 4 && (head[5]! & 0x10) !== 0 ? 10 : 0;
  return 10 + size + footer;
}

/** The 2.4 flags of a 2.3 frame, or null when its body is compressed, encrypted or grouped. */
function v23Flags(flags: number): number | null {
  if ((flags & 0x00e0) !== 0) return null;
  return (flags >> 1) & 0x7000;
}

/** Frames 2.4 dropped: the dates now in `TDRC`, `TDOR` and `TDRL`, and the old sound frames. */
const NOT_IN_V24 = new Set([
  'TYER',
  'TDAT',
  'TIME',
  'TORY',
  'TRDA',
  'TSIZ',
  'RVAD',
  'EQUA',
  'IPLS',
]);

/**
 * The tag at the start of `bytes` (all of it), or null when there is none. Throws `TagsRefused` for
 * a tag Auralis cannot carry over: unsynchronised, or a frame that runs past the tag.
 */
export function readId3Tag(bytes: Buffer): Id3Tag | null {
  const length = id3v2Length(bytes);
  if (length === 0) return null;
  if (length > MAX_TAG) throw new TagsRefused('an ID3 tag is too long');
  if (length > bytes.length) throw new TagsRefused('an ID3 tag runs past the file');
  const major = bytes[3]!;
  const flags = bytes[5]!;
  if (major < 2 || major > 4) throw new TagsRefused('an ID3 tag’s version is not known');
  if ((flags & 0x80) !== 0) throw new TagsRefused('an ID3 tag is unsynchronised');
  if (major === 2) return { major, length, frames: [] };

  const footer = major === 4 && (flags & 0x10) !== 0 ? 10 : 0;
  const end = length - footer;
  let at = 10;
  if ((flags & 0x40) !== 0) {
    const extended = major === 4 ? syncsafe(bytes, at) : bytes.readUInt32BE(at) + 4;
    if (extended === null || at + extended > end) {
      throw new TagsRefused('an ID3 tag’s extended header is not valid');
    }
    at += extended;
  }
  const frames: Id3Frame[] = [];
  while (at + 10 <= end && bytes[at] !== 0) {
    const id = bytes.toString('latin1', at, at + 4);
    if (!FRAME_ID.test(id)) throw new TagsRefused('an ID3 frame is not valid');
    const size =
      major === 4
        ? (syncsafe(bytes, at + 4) ?? bytes.readUInt32BE(at + 4))
        : bytes.readUInt32BE(at + 4);
    if (at + 10 + size > end) throw new TagsRefused('an ID3 frame runs past its tag');
    const frameFlags = bytes.readUInt16BE(at + 8);
    const body = Buffer.from(bytes.subarray(at + 10, at + 10 + size));
    at += 10 + size;
    if (major === 4) frames.push({ id, flags: frameFlags, body });
    else if (!NOT_IN_V24.has(id)) {
      const flags24 = v23Flags(frameFlags);
      if (flags24 !== null) frames.push({ id, flags: flags24, body });
    }
  }
  return { major, length, frames };
}

const TERMINATOR = [Buffer.from([0]), Buffer.from([0, 0]), Buffer.from([0, 0]), Buffer.from([0])];

function decode(encoding: number, bytes: Buffer): string {
  if (encoding === 0) return bytes.toString('latin1');
  if (encoding === 3) return bytes.toString('utf8');
  if (encoding === 2) return Buffer.from(bytes).swap16().toString('utf16le');
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return Buffer.from(bytes.subarray(2, bytes.length & ~1))
      .swap16()
      .toString('utf16le');
  }
  return bytes.subarray(bytes[0] === 0xff && bytes[1] === 0xfe ? 2 : 0).toString('utf16le');
}

/** A text body's strings, split at its encoding's terminator; a trailing one ends the last. */
function strings(encoding: number, bytes: Buffer): string[] {
  const terminator = TERMINATOR[encoding] ?? TERMINATOR[0]!;
  const parts: string[] = [];
  let at = 0;
  while (at <= bytes.length) {
    let next = bytes.indexOf(terminator, at);
    while (next !== -1 && terminator.length === 2 && (next - at) % 2 === 1) {
      next = bytes.indexOf(terminator, next + 1);
    }
    if (next === -1) {
      if (at < bytes.length) parts.push(decode(encoding, bytes.subarray(at)));
      break;
    }
    parts.push(decode(encoding, bytes.subarray(at, next)));
    at = next + terminator.length;
  }
  return parts;
}

/** A text frame's values (`T???` but `TXXX`), or `TXXX`'s description then its values. */
export function frameStrings(frame: Id3Frame): string[] {
  const encoding = frame.body[0] ?? 0;
  return strings(encoding, frame.body.subarray(1));
}

/** `UFID`'s owner and identifier. */
export function ufid(frame: Id3Frame): { owner: string; id: string } {
  const zero = frame.body.indexOf(0);
  return {
    owner: frame.body.toString('latin1', 0, zero),
    id: frame.body.toString('latin1', zero + 1),
  };
}

/** The frames Auralis's tags replace; any old MusicBrainz frame does. */
const OWNED = new Set(['TIT2', 'TPE1', 'TPE2', 'TALB', 'TRCK', 'TPOS', 'TDRC', 'TDOR']);

export function replacedFrame(frame: Id3Frame): boolean {
  if (OWNED.has(frame.id)) return true;
  if (frame.id === 'UFID') return ufid(frame).owner === MUSICBRAINZ_UFID_OWNER;
  if (frame.id === 'TXXX') {
    const description = (frameStrings(frame)[0] ?? '').toUpperCase();
    return description === 'ARTISTS' || description.startsWith('MUSICBRAINZ ');
  }
  return false;
}

function text(id: string, values: readonly string[]): Id3Frame {
  return {
    id,
    flags: 0,
    body: Buffer.concat([Buffer.from([UTF8]), Buffer.from(values.join('\0'), 'utf8')]),
  };
}

/** `n/total`, or `n`, as `TRCK` and `TPOS` write a position. */
function position(n: number | null | undefined, total: number | null | undefined): string | null {
  if (n === null || n === undefined) return null;
  return total === null || total === undefined ? String(n) : `${n}/${total}`;
}

/** Auralis's tags as ID3v2.4 frames, Picard's names. A tag left out writes no frame. */
export function id3Frames(tags: TrackTags): Id3Frame[] {
  const frames: Id3Frame[] = [];
  const add = (id: string, value: string | null | undefined) => {
    if (value !== null && value !== undefined && value !== '') frames.push(text(id, [value]));
  };
  const addUser = (description: string, values: readonly (string | null | undefined)[]) => {
    const present = values.filter((v): v is string => v !== null && v !== undefined && v !== '');
    if (present.length > 0) frames.push(text('TXXX', [description, ...present]));
  };
  add('TIT2', tags.title);
  add('TPE1', tags.artist);
  add('TPE2', tags.albumArtist);
  add('TALB', tags.album);
  add('TRCK', position(tags.trackNumber, tags.trackTotal));
  add('TPOS', position(tags.discNumber, tags.discTotal));
  add('TDRC', tags.date);
  add('TDOR', tags.originalDate);
  addUser(
    'ARTISTS',
    tags.artists.map((a) => a.name),
  );
  addUser('MusicBrainz Album Id', [tags.releaseId]);
  addUser('MusicBrainz Release Group Id', [tags.releaseGroupId]);
  addUser(
    'MusicBrainz Artist Id',
    tags.artists.map((a) => a.id),
  );
  addUser(
    'MusicBrainz Album Artist Id',
    (tags.albumArtists ?? []).map((a) => a.id),
  );
  addUser('MusicBrainz Release Track Id', [tags.releaseTrackId]);
  if (tags.recordingId) {
    frames.push({
      id: 'UFID',
      flags: 0,
      body: Buffer.concat([
        Buffer.from(`${MUSICBRAINZ_UFID_OWNER}\0`, 'latin1'),
        Buffer.from(tags.recordingId, 'latin1'),
      ]),
    });
  }
  return frames;
}

/** An ID3v2.4 tag of `frames` and `padding` zero bytes. */
export function id3v24Tag(frames: readonly Id3Frame[], padding: number): Buffer {
  const parts: Buffer[] = [];
  for (const frame of frames) {
    const header = Buffer.alloc(10);
    header.write(frame.id, 0, 'latin1');
    toSyncsafe(frame.body.length).copy(header, 4);
    header.writeUInt16BE(frame.flags, 8);
    parts.push(header, frame.body);
  }
  const body = Buffer.concat([...parts, Buffer.alloc(padding)]);
  return Buffer.concat([
    Buffer.from('ID3', 'latin1'),
    Buffer.from([4, 0, 0]),
    toSyncsafe(body.length),
    body,
  ]);
}
