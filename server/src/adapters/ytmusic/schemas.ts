/**
 * Zod schemas for the two InnerTube answers Auralis reads, cut to what it reads (recorded).
 * `search` puts its rows in a shelf and `next` in a panel on its first tab; the other tabs name
 * pages not asked for. Each row is parsed alone, so one bad row never costs the others. A search
 * that finds nothing has no shelf. Any answer may name a visitor id, the player's below among them.
 */
import { z } from 'zod';

const videoId = z.string().regex(/^[\w-]{11}$/);

const watchEndpoint = z.object({
  videoId,
  watchEndpointMusicSupportedConfigs: z.object({
    watchEndpointMusicConfig: z.object({ musicVideoType: z.string() }),
  }),
});

const browseEndpoint = z.object({
  browseEndpointContextSupportedConfigs: z.object({
    browseEndpointContextMusicConfig: z.object({ pageType: z.string() }),
  }),
});

export const runSchema = z.object({
  text: z.string(),
  navigationEndpoint: z
    .object({ browseEndpoint: browseEndpoint.optional(), watchEndpoint: watchEndpoint.optional() })
    .optional(),
});
export type Run = z.infer<typeof runSchema>;

const runs = z.object({ runs: z.array(runSchema).min(1) });

const thumbnails = z.array(z.object({ url: z.string().url(), width: z.number() }));

const flexColumn = z.object({
  musicResponsiveListItemFlexColumnRenderer: z.object({ text: runs }),
});

/** One row of a search: its title, then `Artist • Album • 3:34`. */
export const searchRowSchema = z.object({
  musicResponsiveListItemRenderer: z.object({
    flexColumns: z.array(flexColumn).min(2),
    playlistItemData: z.object({ videoId }),
    thumbnail: z.object({
      musicThumbnailRenderer: z.object({ thumbnail: z.object({ thumbnails }) }),
    }),
  }),
});

/** One row of a radio: its title, `Artist • Album • 1987`, and its length apart. */
export const radioRowSchema = z.object({
  playlistPanelVideoRenderer: z.object({
    videoId,
    title: runs,
    longBylineText: runs,
    lengthText: runs,
    thumbnail: z.object({ thumbnails }),
    navigationEndpoint: z.object({ watchEndpoint }),
  }),
});

/** Where every InnerTube answer may name the visitor id it gave this caller. */
export const responseContextSchema = z.object({ visitorData: z.string().optional() });
export type ResponseContext = z.infer<typeof responseContextSchema>;

export const searchAnswerSchema = z.object({
  responseContext: responseContextSchema.optional(),
  contents: z.object({
    tabbedSearchResultsRenderer: z.object({
      tabs: z.array(
        z.object({
          tabRenderer: z.object({
            content: z.object({
              sectionListRenderer: z.object({
                contents: z.array(
                  z.object({
                    musicShelfRenderer: z.object({ contents: z.array(z.unknown()) }).optional(),
                  }),
                ),
              }),
            }),
          }),
        }),
      ),
    }),
  }),
});

export const radioAnswerSchema = z.object({
  responseContext: responseContextSchema.optional(),
  contents: z.object({
    singleColumnMusicWatchNextResultsRenderer: z.object({
      tabbedRenderer: z.object({
        watchNextTabbedResultsRenderer: z.object({
          tabs: z.array(
            z.object({
              tabRenderer: z.object({
                content: z
                  .object({
                    musicQueueRenderer: z
                      .object({
                        content: z.object({
                          playlistPanelRenderer: z.object({ contents: z.array(z.unknown()) }),
                        }),
                      })
                      .optional(),
                  })
                  .optional(),
              }),
            }),
          ),
        }),
      }),
    }),
  }),
});

/**
 * The player's answer, cut to what decides a play: its status, the track it names, and its formats,
 * each row left for the audio-only guard (`parsePlayer` in music/schemas.ts) to read alone.
 */
export const playerAnswerSchema = z.object({
  responseContext: responseContextSchema.optional(),
  playabilityStatus: z.object({ status: z.string(), reason: z.string().optional() }),
  videoDetails: z
    .object({
      videoId: z.string(),
      lengthSeconds: z.string().regex(/^\d+$/).optional(),
      isLive: z.boolean().optional(),
      isLiveContent: z.boolean().optional(),
    })
    .optional(),
  streamingData: z
    .object({
      expiresInSeconds: z.string().regex(/^\d+$/).optional(),
      formats: z.array(z.unknown()).optional(),
      adaptiveFormats: z.array(z.unknown()).optional(),
    })
    .optional(),
});
export type PlayerAnswer = z.infer<typeof playerAnswerSchema>;
