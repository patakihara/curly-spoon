/**
 * Vorbis comments and FLAC picture blocks, as both Ogg Opus (`OpusTags`, `METADATA_BLOCK_PICTURE`)
 * and FLAC (`VORBIS_COMMENT`, `PICTURE`) carry them.
 */

/** One Vorbis comment. A key may repeat, as `ARTISTS` does once per artist. */
export interface VorbisComment {
  readonly key: string;
  readonly value: string;
}

/** A cover, as a FLAC picture block carries it. */
export interface Picture {
  readonly mime: string;
  readonly data: Buffer;
  readonly width?: number;
  readonly height?: number;
}

export interface VorbisComments {
  readonly vendor: string;
  readonly comments: readonly VorbisComment[];
}

const FRONT_COVER = 3;
const KEY = /^[\x20-\x3c\x3e-\x7d]+$/;

function u32be(value: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value >>> 0);
  return bytes;
}

function u32le(value: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value >>> 0);
  return bytes;
}

/** The comment packet's body without any framing: vendor, count, then each `KEY=value`. */
export function vorbisCommentBody(vendor: string, comments: readonly VorbisComment[]): Buffer {
  const vendorBytes = Buffer.from(vendor, 'utf8');
  const parts = [u32le(vendorBytes.length), vendorBytes, u32le(comments.length)];
  for (const { key, value } of comments) {
    if (!KEY.test(key)) throw new Error(`a Vorbis comment key is not valid: ${key}`);
    const comment = Buffer.from(`${key}=${value}`, 'utf8');
    parts.push(u32le(comment.length), comment);
  }
  return Buffer.concat(parts);
}

/** Reads a comment body; throws a `RangeError` when it runs past its end. */
export function readVorbisCommentBody(body: Buffer): VorbisComments {
  let at = 0;
  const take = (): string => {
    const length = body.readUInt32LE(at);
    if (at + 4 + length > body.length) throw new RangeError('a Vorbis comment runs past its end');
    const text = body.toString('utf8', at + 4, at + 4 + length);
    at += 4 + length;
    return text;
  };
  const vendor = take();
  const count = body.readUInt32LE(at);
  at += 4;
  const comments: VorbisComment[] = [];
  for (let i = 0; i < count; i++) {
    const text = take();
    const equals = text.indexOf('=');
    comments.push({ key: text.slice(0, equals), value: text.slice(equals + 1) });
  }
  return { vendor, comments };
}

/** A FLAC picture block's body, a front cover. */
export function pictureBlock(picture: Picture): Buffer {
  const mime = Buffer.from(picture.mime, 'latin1');
  return Buffer.concat([
    u32be(FRONT_COVER),
    u32be(mime.length),
    mime,
    u32be(0),
    u32be(picture.width ?? 0),
    u32be(picture.height ?? 0),
    u32be(0),
    u32be(0),
    u32be(picture.data.length),
    picture.data,
  ]);
}

export function readPictureBlock(bytes: Buffer): Picture {
  let at = 4;
  const take = (): Buffer => {
    const length = bytes.readUInt32BE(at);
    const part = bytes.subarray(at + 4, at + 4 + length);
    at += 4 + length;
    return part;
  };
  const mime = take().toString('latin1');
  take();
  const width = bytes.readUInt32BE(at);
  const height = bytes.readUInt32BE(at + 4);
  at += 16;
  return { mime, data: Buffer.from(take()), width, height };
}
