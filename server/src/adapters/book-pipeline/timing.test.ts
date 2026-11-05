import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { scanRecording } from '../http/scan.js';
import { recordingSchema } from '../http/recording.js';

const span = z.object({ start: z.string().datetime(), end: z.string().datetime() });

const importStep = span.extend({ what: z.string().min(1) });

const timingSchema = z.object({
  measuredOn: z.literal('a real request on the household server'),
  book: z.object({
    title: z.string().min(1),
    author: z.string().min(1),
    publicDomain: z.literal(true),
    audioBytes: z.number().int().positive(),
    durationSeconds: z.number().positive(),
  }),
  search: span.extend({
    query: z.string().min(1),
    results: z.number().int().nonnegative(),
    perIndexer: z
      .array(
        z.object({
          indexer: z.string().regex(/^indexer-[a-f]$/),
          elapsedMs: z.number().int().nonnegative(),
          results: z.number().int().nonnegative(),
        }),
      )
      .min(1),
  }),
  download: span.extend({
    added: span,
    firstByte: z.string().datetime(),
    lastProgress: z.string().datetime(),
    clientCompleted: z.boolean(),
    handFix: span.extend({ bytes: z.number().int().positive(), what: z.string().min(1) }),
  }),
  import: z.object({
    hardlink: importStep,
    narratorTag: importStep,
    seriesTag: importStep,
    authorImage: importStep,
  }),
  scan: span.extend({
    how: z.literal('folder watcher'),
    scanRequested: z.literal(false),
    addedAtPerAudiobookshelf: z.string().datetime(),
    tracksListed: z.number().int().positive(),
  }),
  notes: z.array(z.string().min(1)).min(1),
});

const here = dirname(fileURLToPath(import.meta.url));
const raw: unknown = JSON.parse(readFileSync(join(here, 'timing', 'real-request.json'), 'utf8'));
const timing = timingSchema.parse(raw);

const ms = (at: string) => Date.parse(at);
const lasted = ({ start, end }: { start: string; end: string }) => ms(end) - ms(start);

describe('[M3.timing/a] the book pipeline timed on a real request', () => {
  it('[M3.timing/a] the recording covers the search, the download, the import and the scan, each with a start and an end', () => {
    const steps = [
      timing.search,
      timing.download,
      timing.import.hardlink,
      timing.import.narratorTag,
      timing.import.seriesTag,
      timing.import.authorImage,
      timing.scan,
    ];
    for (const step of steps) expect(lasted(step)).toBeGreaterThanOrEqual(0);
  });

  it('[M3.timing/a] the steps ran in the order a request runs them', () => {
    expect(ms(timing.search.end)).toBeLessThanOrEqual(ms(timing.download.start));
    expect(ms(timing.download.end)).toBeLessThanOrEqual(ms(timing.import.hardlink.start));
    expect(ms(timing.import.hardlink.end)).toBeLessThanOrEqual(ms(timing.import.narratorTag.start));
    expect(ms(timing.import.narratorTag.end)).toBeLessThanOrEqual(
      ms(timing.import.seriesTag.start),
    );
    expect(ms(timing.import.seriesTag.end)).toBeLessThanOrEqual(
      ms(timing.import.authorImage.start),
    );
    expect(ms(timing.scan.start)).toBe(ms(timing.import.hardlink.start));
  });

  it('[M3.timing/a] the watcher found the new folder inside its 15 minutes, with no scan asked for', () => {
    expect(lasted(timing.scan)).toBeLessThan(15 * 60 * 1000);
    expect(timing.scan.scanRequested).toBe(false);
  });

  it('[M3.timing/a] the notes keep what M3.books needs from the run', () => {
    const notes = timing.notes.join('\n');
    expect(notes).toMatch(/magnetUrl.*localhost/);
    expect(notes).toMatch(/guid/);
    expect(notes).toMatch(/seeder/i);
    expect(notes).toMatch(/Debian/);
  });

  it('[M3.timing/a] the recording passes the leak scan and names no indexer', () => {
    const asRecording = recordingSchema.parse({
      upstream: 'book-pipeline',
      upstreamVersion: '0.0.0',
      call: 'real-request-timing',
      request: { method: 'GET', path: '/', query: {}, headers: {}, body: null },
      response: { status: 200, headers: {}, body: { json: raw } },
    });
    expect(scanRecording(asRecording)).toEqual([]);
    expect(JSON.stringify(raw)).not.toMatch(
      /pirate|1337x|limetorrents|knaben|audiobook ?bay|myanonamouse|ebookbay|etree|eztv|torrentscsv/i,
    );
  });
});
