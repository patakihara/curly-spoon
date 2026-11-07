/**
 * Zod schemas for the two InnerTube answers Auralis reads, cut to what it reads (recorded).
 * `search` puts its rows in a shelf and `next` in a panel on its first tab; the other tabs name
 * pages not asked for. Each row is parsed alone, so one bad row never costs the others. A search
 * that finds nothing has no shelf.
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

export const searchAnswerSchema = z.object({
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
