import { mkdtempSync, rmSync } from 'node:fs';
import { type FileHandle, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NO_GRANULE, OggWriter, oggPackets, oggPages, type OggPage } from './ogg.js';

let dir: string;
let file: FileHandle;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'auralis-ogg-'));
  file = await open(join(dir, 'stream.ogg'), 'w+');
});
afterEach(async () => {
  await file.close();
  rmSync(dir, { recursive: true, force: true });
});

async function pages(): Promise<OggPage[]> {
  const all: OggPage[] = [];
  for await (const page of oggPages(file)) all.push(page);
  return all;
}

/** A packet that fills more than one page: 255 segments of 255 bytes hold 65,025. */
const long = Buffer.alloc(70_000, 7);

describe('[M3.keep/a] each Ogg page carries the granule of the last packet that ends on it (RFC 3533)', () => {
  it('[M3.keep/a] a page whose last packet carries on still names the packet that ended before it', async () => {
    const writer = new OggWriter(file, 1);
    await writer.packet(Buffer.alloc(100, 1), 960n);
    await writer.packet(long, 1920n, true);
    const [first, second] = await pages();
    expect(first!.continued).toBe(false);
    expect(first!.granule).toBe(960n);
    expect(second!.continued).toBe(true);
    expect(second!.granule).toBe(1920n);
  });

  it('[M3.keep/a] a page on which no packet ends has no granule', async () => {
    const writer = new OggWriter(file, 1);
    await writer.packet(Buffer.alloc(140_000, 3), 960n, true);
    const all = await pages();
    expect(all.map((page) => page.granule)).toEqual([NO_GRANULE, NO_GRANULE, 960n]);
  });

  it('[M3.keep/a] the packets read back whole, each granule on the last to end on its page', async () => {
    const writer = new OggWriter(file, 1);
    await writer.packet(Buffer.alloc(100, 1), 960n);
    await writer.packet(long, 1920n, true);
    const read: { size: number; granule: bigint }[] = [];
    for await (const packet of oggPackets(file)) {
      read.push({ size: packet.data.length, granule: packet.granule });
    }
    expect(read).toEqual([
      { size: 100, granule: 960n },
      { size: long.length, granule: 1920n },
    ]);
  });
});
