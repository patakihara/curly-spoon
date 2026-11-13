/**
 * What a FLAC's comments or an MP3's ID3v2 tag says of a track's place: its track and disc numbers,
 * and the MusicBrainz release track id Auralis tags with, by which a file placed by an earlier try
 * is known as Auralis's own. A file with no tag, or one that is neither, says nothing.
 */
import { type FileHandle, open } from 'node:fs/promises';
import { flacComments, readFlac } from '../flac/blocks.js';
import { frameStrings, id3v2Length, readId3Tag } from '../id3/frames.js';
import { TagsRefused } from '../tags.js';

export interface TrackFields {
  readonly trackNumber: number | null;
  readonly discNumber: number | null;
  readonly releaseTrackId: string | null;
}

const NONE: TrackFields = { trackNumber: null, discNumber: null, releaseTrackId: null };

/** `3`, `03` or `3/10` as 3; anything else null. */
const numberOf = (value: string | undefined): number | null => {
  const n = /^\s*(\d{1,3})\s*(?:\/\s*\d+\s*)?$/.exec(value ?? '')?.[1];
  return n === undefined ? null : Number(n);
};

async function flacFields(file: FileHandle): Promise<TrackFields> {
  const comments = flacComments(await readFlac(file))?.comments ?? [];
  const first = (key: string) => comments.find((c) => c.key.toUpperCase() === key)?.value;
  return {
    trackNumber: numberOf(first('TRACKNUMBER')),
    discNumber: numberOf(first('DISCNUMBER')),
    releaseTrackId: first('MUSICBRAINZ_RELEASETRACKID') ?? null,
  };
}

async function id3Fields(file: FileHandle): Promise<TrackFields> {
  const head = Buffer.alloc(10);
  await file.read(head, 0, 10, 0);
  const length = id3v2Length(head);
  if (length === 0) return NONE;
  const bytes = Buffer.alloc(length);
  const { bytesRead } = await file.read(bytes, 0, length, 0);
  const tag = readId3Tag(bytes.subarray(0, bytesRead));
  const text = (id: string) => {
    const frame = tag?.frames.find((f) => f.id === id);
    return frame === undefined ? undefined : frameStrings(frame)[0];
  };
  const releaseTrack = tag?.frames
    .filter((f) => f.id === 'TXXX')
    .map(frameStrings)
    .find(([description]) => description === 'MusicBrainz Release Track Id')?.[1];
  return {
    trackNumber: numberOf(text('TRCK')),
    discNumber: numberOf(text('TPOS')),
    releaseTrackId: releaseTrack ?? null,
  };
}

/** The fields the file at `path` carries; none for a file of no tag or a tag Auralis cannot read. */
export async function trackFields(path: string): Promise<TrackFields> {
  const file = await open(path, 'r');
  try {
    try {
      return await flacFields(file);
    } catch (error) {
      if (!(error instanceof TagsRefused)) throw error;
    }
    try {
      return await id3Fields(file);
    } catch (error) {
      if (!(error instanceof TagsRefused)) throw error;
      return NONE;
    }
  } finally {
    await file.close();
  }
}
