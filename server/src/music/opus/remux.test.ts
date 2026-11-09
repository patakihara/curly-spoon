import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { type FileHandle, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readWebmOpus } from './ebml.js';
import { oggPages, type OggPage } from './ogg.js';
import {
  opusPackets,
  OpusRefused,
  packetSamples,
  readOggOpus,
  remux,
  type VorbisComment,
} from './remux.js';

const here = dirname(fileURLToPath(import.meta.url));
/** YouTube Music's layout, made by scripts/fixtures/tone.sh: 20 s mono, 1,001 packets. */
const clipPath = join(here, '..', '..', 'adapters', 'googlevideo', 'recordings', 'opus-clip.webm');
const clip = readFileSync(clipPath);

const comments: VorbisComment[] = [
  { key: 'TITLE', value: 'Not Gonna Give It Up' },
  { key: 'ARTIST', value: 'Peter Tosh' },
  { key: 'ARTISTS', value: 'Peter Tosh' },
  { key: 'ALBUM', value: 'Mama Africa' },
  { key: 'TRACKNUMBER', value: '3' },
  { key: 'MUSICBRAINZ_TRACKID', value: '00000000-0000-4000-8000-000000000001' },
  { key: 'MUSICBRAINZ_ALBUMID', value: '00000000-0000-4000-8000-000000000002' },
];

let dir: string;
const handles: FileHandle[] = [];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'auralis-opus-'));
});

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.close()));
  rmSync(dir, { recursive: true, force: true });
});

async function opened(path: string, flags = 'r'): Promise<FileHandle> {
  const handle = await open(path, flags);
  handles.push(handle);
  return handle;
}

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const all: T[] = [];
  for await (const item of items) all.push(item);
  return all;
}

/** Remuxes the WebM bytes into a fresh .opus in the test's folder, and gives its path. */
async function remuxed(
  webm: Buffer = clip,
  tags: readonly VorbisComment[] = comments,
  picture?: Parameters<typeof remux>[3],
): Promise<string> {
  const from = join(dir, `in-${handles.length}.webm`);
  const to = join(dir, `out-${handles.length}.opus`);
  writeFileSync(from, webm);
  await remux(await opened(from), await opened(to, 'w+'), tags, picture);
  return to;
}

async function webmFacts(webm: Buffer) {
  const path = join(dir, `facts-${handles.length}.webm`);
  writeFileSync(path, webm);
  const { head, packets } = await readWebmOpus(await opened(path));
  return { head, packets: await collect(packets) };
}

// A small WebM writer, for the shapes the fixture does not have. Sizes are 8-byte vints.
const UNKNOWN = Buffer.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);

function idBytes(id: number): Buffer {
  const bytes: number[] = [];
  for (let value = id; value > 0; value = Math.floor(value / 256)) bytes.unshift(value & 0xff);
  return Buffer.from(bytes);
}

function el(id: number, data: Buffer | Buffer[], unknownSize = false): Buffer {
  const body = Array.isArray(data) ? Buffer.concat(data) : data;
  const size = Buffer.alloc(8);
  size[0] = 0x01;
  size.writeUIntBE(body.length, 2, 6);
  return Buffer.concat([idBytes(id), unknownSize ? UNKNOWN : size, body]);
}

interface Shape {
  readonly codec?: string;
  readonly tracks?: number;
  readonly laced?: boolean;
  readonly unknownCluster?: boolean;
}

async function builtWebm(shape: Shape = {}): Promise<Buffer> {
  const { head, packets } = await webmFacts(clip);
  const entry = (number: number) =>
    el(0xae, [
      el(0xd7, Buffer.from([number])),
      el(0x86, Buffer.from(shape.codec ?? 'A_OPUS', 'latin1')),
      el(0x63a2, head),
    ]);
  const tracks = el(
    0x1654ae6b,
    Array.from({ length: shape.tracks ?? 1 }, (_, i) => entry(i + 1)),
  );
  const flags = 0x80 | (shape.laced ? 0x02 : 0);
  const blocks = packets
    .slice(0, 50)
    .map((packet, i) => el(0xa3, [Buffer.from([0x81, 0, i, flags]), packet.data]));
  const cluster = el(0x1f43b675, [el(0xe7, Buffer.from([0])), ...blocks], shape.unknownCluster);
  return Buffer.concat([
    el(0x1a45dfa3, el(0x4282, Buffer.from('webm', 'latin1'))),
    el(0x18538067, [tracks, cluster]),
  ]);
}

describe('[M3.keep/a] the WebM stream moved into Ogg Opus', () => {
  it('[M3.keep/a] every packet comes out byte for byte the same, all 1,001 of them', async () => {
    const out = await remuxed();
    const before = await collect(opusPackets(await opened(clipPath)));
    const after = await collect(opusPackets(await opened(out)));
    expect(before).toHaveLength(1001);
    expect(after).toHaveLength(1001);
    after.forEach((packet, i) => expect(packet.equals(before[i]!)).toBe(true));
  });

  it("[M3.keep/a] the OpusHead is the stream's own", async () => {
    const out = await remuxed();
    const { head } = await webmFacts(clip);
    expect((await readOggOpus(await opened(out))).head.equals(head)).toBe(true);
  });

  it("[M3.keep/a] the last granule is the packets' samples less the WebM's DiscardPadding", async () => {
    const out = await remuxed();
    const { packets } = await webmFacts(clip);
    const discardNs = packets.at(-1)!.discardPaddingNs;
    expect(discardNs).toBeGreaterThan(0);
    const samples = packets.reduce((sum, packet) => sum + packetSamples(packet.data), 0);
    const expected = samples - Math.round((discardNs * 48_000) / 1e9);
    expect((await readOggOpus(await opened(out))).lastGranule).toBe(BigInt(expected));
  });

  it('[M3.keep/a] every page checks against its CRC, and a changed byte fails it', async () => {
    const out = await remuxed();
    const pages = await collect(oggPages(await opened(out)));
    expect(pages.length).toBeGreaterThan(3);
    expect(pages.map((page) => page.sequence)).toEqual(pages.map((_, i) => i));
    expect(pages.map((page) => page.first)).toEqual(pages.map((_, i) => i === 0));
    expect(pages.map((page) => page.last)).toEqual(pages.map((_, i) => i === pages.length - 1));

    const bytes = readFileSync(out);
    bytes[bytes.length - 10] = bytes[bytes.length - 10]! ^ 0xff;
    const broken = join(dir, 'broken.opus');
    writeFileSync(broken, bytes);
    await expect(collect(oggPages(await opened(broken)))).rejects.toThrow(/CRC/);
  });

  it('[M3.keep/a] the head and the tags each have pages to themselves, as Ogg Opus asks', async () => {
    const pages = await collect(oggPages(await opened(await remuxed())));
    expect(pages[0]!.data.toString('latin1', 0, 8)).toBe('OpusHead');
    expect(pages[0]!.segments.at(-1)).toBeLessThan(255);
    expect(pages[1]!.data.toString('latin1', 0, 8)).toBe('OpusTags');
    expect(pages[1]!.granule).toBe(0n);
    expect(pages[2]!.continued).toBe(false);
  });

  it('[M3.keep/a] the tags and the cover read back as written', async () => {
    const cover = { mime: 'image/jpeg', data: randomBytes(3000), width: 500, height: 500 };
    const out = await remuxed(clip, comments, cover);
    const { tags } = await readOggOpus(await opened(out));
    expect(tags.comments).toEqual(comments);
    expect(tags.picture).toEqual(cover);
  });

  it('[M3.keep/a] a key may repeat, as ARTISTS does once per artist', async () => {
    const both = [
      { key: 'ARTISTS', value: 'El Chombo' },
      { key: 'ARTISTS', value: 'Cutty Ranks' },
    ];
    const { tags } = await readOggOpus(await opened(await remuxed(clip, both)));
    expect(tags.comments).toEqual(both);
    expect(tags.picture).toBeNull();
  });

  it('[M3.keep/a] no page passes 255 segments, and a tags packet over 64 KiB spans pages', async () => {
    const cover = { mime: 'image/jpeg', data: randomBytes(200 * 1024) };
    const out = await remuxed(clip, comments, cover);
    const pages: OggPage[] = await collect(oggPages(await opened(out)));
    for (const page of pages) expect(page.segments.length).toBeLessThanOrEqual(255);
    expect(pages[2]!.continued).toBe(true);
    const read = await readOggOpus(await opened(out));
    expect(read.tags.picture!.data.equals(cover.data)).toBe(true);
    expect(read.packets).toBe(1001);
  });

  it('[M3.keep/a] a WebM of the same shape built here remuxes too', async () => {
    const out = await remuxed(await builtWebm());
    expect((await readOggOpus(await opened(out))).packets).toBe(50);
  });
});

describe('[M3.keep/a] a stream that cannot be copied exactly is refused, never guessed', () => {
  it('[M3.keep/a] a laced block', async () => {
    await expect(remuxed(await builtWebm({ laced: true }))).rejects.toThrow(OpusRefused);
    await expect(remuxed(await builtWebm({ laced: true }))).rejects.toThrow(/laced/);
  });

  it('[M3.keep/a] a Cluster of unknown size, as a live stream has', async () => {
    await expect(remuxed(await builtWebm({ unknownCluster: true }))).rejects.toThrow(/no size/);
  });

  it('[M3.keep/a] a second track', async () => {
    await expect(remuxed(await builtWebm({ tracks: 2 }))).rejects.toThrow(/2 tracks/);
  });

  it('[M3.keep/a] a codec other than Opus', async () => {
    await expect(remuxed(await builtWebm({ codec: 'A_VORBIS' }))).rejects.toThrow(/A_VORBIS/);
  });

  it('[M3.keep/a] a file cut short', async () => {
    const short = clip.subarray(0, Math.floor(clip.length / 2));
    await expect(remuxed(short)).rejects.toThrow(/shorter/);
  });

  it('[M3.keep/a] a file that is not WebM at all', async () => {
    await expect(remuxed(randomBytes(4096))).rejects.toThrow(OpusRefused);
  });
});
