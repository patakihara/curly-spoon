import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { type Recording, recordingSchema } from './http/recording.js';
import { scanRecording } from './http/scan.js';
import { type RawExchange, scrub } from './http/scrub.js';
import { replayedYtMusic, withoutFlaggedRows } from './record-spotify.js';

const here = dirname(fileURLToPath(import.meta.url));
const recorded = recordingSchema.parse(
  JSON.parse(
    readFileSync(join(here, 'spotify', 'recordings', 'ytmusic', 'ytmusic-001.json'), 'utf8'),
  ),
);
const opts = { secrets: [], baseUrl: 'http://upstream.invalid' };

/** The recording as the recorder saw it, before the scrubber: a whole URL. */
const rawOf = (r: Recording): RawExchange => ({
  ...r,
  request: {
    method: r.request.method,
    url: `${opts.baseUrl}${r.request.path}?${new URLSearchParams(r.request.query)}`,
    headers: r.request.headers,
    body: r.request.body,
  },
});

/** The recorded answer with its second row's artist named like a host, as a real artist was. */
function withHostLikeArtist() {
  const raw = rawOf(recorded);
  const json = JSON.stringify(raw.response.body);
  const body = JSON.parse(json) as {
    json: {
      contents: {
        tabbedSearchResultsRenderer: {
          tabs: {
            tabRenderer: {
              content: {
                sectionListRenderer: {
                  contents: {
                    musicShelfRenderer: {
                      contents: {
                        musicResponsiveListItemRenderer: {
                          flexColumns: {
                            musicResponsiveListItemFlexColumnRenderer: {
                              text: { runs: { text: string }[] };
                            };
                          }[];
                        };
                      }[];
                    };
                  }[];
                };
              };
            };
          }[];
        };
      };
    };
  };
  const rows =
    body.json.contents.tabbedSearchResultsRenderer.tabs[0]!.tabRenderer.content.sectionListRenderer
      .contents[0]!.musicShelfRenderer.contents;
  rows[1]!.musicResponsiveListItemRenderer.flexColumns[1]!.musicResponsiveListItemFlexColumnRenderer.text.runs[0]!.text =
    's.soo';
  return { ...raw, response: { ...raw.response, body } };
}

describe('[M3.spotify/a] the YouTube Music recordings', () => {
  it('[M3.spotify/a] a row the leak scan flags is dropped, the rest kept in order', async () => {
    const raw = withHostLikeArtist();
    const query = (recorded.request.body as { json: { query: string } }).json.query;
    const before = await replayedYtMusic([recorded]).search(query);
    const kept = { ...recorded, ...scrub(withoutFlaggedRows(raw, opts), opts) };
    expect(scanRecording(kept)).toEqual([]);
    const after = await replayedYtMusic([kept]).search(query);
    expect(after.map((r) => r.id)).toEqual(before.filter((_, n) => n !== 1).map((r) => r.id));
  });

  it('[M3.spotify/a] an answer the scan passes is kept whole', () => {
    const cut = withoutFlaggedRows(rawOf(recorded), opts);
    expect(scrub(cut, opts).response.body).toEqual(recorded.response.body);
  });
});
