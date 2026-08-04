/**
 * Builds the `POST /podcasts` body from a previewed feed, following Audiobookshelf's
 * subscribe contract (`subscribePodcastBodySchema` in `apps/server/src/routes/schemas.ts`).
 *
 * Total, not partial: a target library with no folder, or a feed with no usable title,
 * degrades to `null` rather than throwing — `folderId`/`folderPath`/`title` are all
 * required by the schema and there's nothing sane to substitute for a missing folder,
 * while an empty title would otherwise 400 confusingly deep inside the subscribe call.
 *
 * `directoryResult` is optional because a feed can be previewed two ways: picked from a
 * `GET /podcasts/search` result (carries `itunesId`/`pageUrl`, which the feed preview
 * itself never has), or a raw RSS URL pasted directly (no directory result at all). Fields
 * present on both prefer the feed preview, since it reflects the feed as it exists right
 * now rather than whatever the directory had indexed.
 */
import type {
  Library,
  PodcastDirectoryResult,
  PodcastFeedPreview,
  SubscribePodcastBody,
} from '../../api/types.js';

export interface BuildSubscribeBodyParams {
  preview: PodcastFeedPreview;
  rssFeed: string;
  library: Pick<Library, 'id' | 'folders'>;
  directoryResult?: PodcastDirectoryResult | null;
  autoDownloadEpisodes?: boolean;
}

export function buildSubscribeBody(params: BuildSubscribeBodyParams): SubscribePodcastBody | null {
  const folder = params.library.folders[0];
  if (!folder) return null;

  const title = (params.preview.title ?? params.directoryResult?.title ?? '').trim();
  if (title.length === 0) return null;

  const genres =
    params.preview.categories.length > 0
      ? params.preview.categories
      : (params.directoryResult?.genres ?? []);

  return {
    libraryId: params.library.id,
    folderId: folder.id,
    folderPath: folder.path,
    rssFeed: params.rssFeed,
    title,
    metadata: {
      author: params.preview.author ?? params.directoryResult?.artistName ?? null,
      description: params.preview.description ?? params.directoryResult?.description ?? null,
      releaseDate: params.directoryResult?.releaseDate ?? params.preview.pubDate ?? null,
      imageUrl: params.preview.image ?? params.directoryResult?.cover ?? null,
      genres,
      language: params.preview.language,
      explicit: params.preview.explicit,
      itunesPageUrl: params.directoryResult?.pageUrl ?? null,
      itunesId: params.directoryResult?.itunesId ?? null,
    },
    autoDownloadEpisodes: params.autoDownloadEpisodes,
  };
}
