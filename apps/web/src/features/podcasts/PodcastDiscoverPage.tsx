/**
 * Podcast discovery: search the iTunes-backed directory (or paste an RSS URL
 * directly), preview the real feed, then subscribe. Search only runs on explicit
 * submit — like `AskForBookPanel`, this fans out to a real upstream rather than
 * filtering something local, so it shouldn't hammer it on every keystroke.
 *
 * A feed preview is reached two ways, both funnelled into the same `previewMutation`
 * and the same `PodcastFeedPreview` panel below: picking a directory search result
 * (which carries `itunesId`/`pageUrl` through to the eventual subscribe body via
 * `directoryResult`), or pasting an RSS URL straight in (no directory result at all —
 * `subscribeMetadata.ts`'s `buildSubscribeBody` degrades gracefully either way).
 *
 * Reached from the podcast library's "Add podcast" entry point (`LibraryPage.tsx`)
 * once a podcast-mediaType library exists — see that file's doc comment for why the
 * nav entry lives there rather than as a new top-level destination.
 */
import { useState } from 'react';
import { Button, Card, SearchField } from '@auralis/ui';
import { RichDescription } from '../../components/RichDescription.js';
import { ApiError } from '../../api/errors.js';
import {
  useLibrariesQuery,
  usePodcastDirectorySearchQuery,
  usePreviewPodcastFeedMutation,
  useSetupQuery,
} from '../../api/queries.js';
import type { PodcastDirectoryResult } from '../../api/types.js';
import { PodcastFeedPreview } from './PodcastFeedPreview.js';

interface ActivePreview {
  rssFeed: string;
  directoryResult: PodcastDirectoryResult | null;
}

export function PodcastDiscoverPage() {
  const [term, setTerm] = useState('');
  const [submittedTerm, setSubmittedTerm] = useState('');
  const [rssUrl, setRssUrl] = useState('');
  const [active, setActive] = useState<ActivePreview | null>(null);

  const setupQuery = useSetupQuery();
  const configured = setupQuery.data?.configured ?? false;
  const librariesQuery = useLibrariesQuery(configured);
  const podcastLibrary = librariesQuery.data?.libraries.find((l) => l.mediaType === 'podcast');

  const searchQuery = usePodcastDirectorySearchQuery(submittedTerm);
  const previewMutation = usePreviewPodcastFeedMutation();

  const submitSearch = () => setSubmittedTerm(term.trim());

  const startPreview = (directoryResult: PodcastDirectoryResult | null, rssFeed: string) => {
    setActive({ rssFeed, directoryResult });
    previewMutation.mutate(rssFeed);
  };

  const results = searchQuery.data?.results ?? [];

  return (
    <div className="auralis-page" data-testid="podcast-discover-page">
      <h1>Add a podcast</h1>

      <section>
        <h2>Search</h2>
        <div data-testid="podcast-search-field">
          <SearchField
            value={term}
            onChange={setTerm}
            onSubmit={submitSearch}
            placeholder="Podcast name"
            aria-label="Podcast name to search for"
          />
        </div>

        <Button
          variant="outlined"
          size="sm"
          onClick={submitSearch}
          data-testid="podcast-search-submit"
        >
          Search
        </Button>

        {searchQuery.isLoading ? (
          <p>Searching…</p>
        ) : searchQuery.isError ? (
          <p role="alert" data-testid="podcast-search-error">
            {searchQuery.error instanceof ApiError
              ? searchQuery.error.message
              : 'Could not search podcasts.'}
          </p>
        ) : submittedTerm.length === 0 ? null : results.length === 0 ? (
          <p>No podcasts found for "{submittedTerm}".</p>
        ) : (
          <ul
            data-testid="podcast-search-results"
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {results.map((result) => (
              <li key={result.itunesId}>
                <Card
                  interactive
                  variant="elevated"
                  data-testid={`podcast-result-${result.itunesId}`}
                  onClick={() => {
                    if (result.feedUrl) startPreview(result, result.feedUrl);
                  }}
                >
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    {result.cover ? (
                      <img
                        src={result.cover}
                        alt=""
                        width={56}
                        height={56}
                        style={{ borderRadius: 8, objectFit: 'cover' }}
                      />
                    ) : null}
                    <div>
                      <strong>{result.title}</strong>
                      {result.artistName ? <p>{result.artistName}</p> : null}
                      {/* The directory result's description is untrusted third-party text that
                       * `RichDescription` may render as a real `<a>` — nested inside this `Card`'s
                       * `<button>` (an HTML5 violation the browser still renders, since React
                       * builds the DOM directly rather than through the HTML parser that would
                       * normally reject it). Without this guard, activating that link — by click
                       * or by keyboard Enter, both of which dispatch a `click` that bubbles —
                       * *also* fires the card's own `onClick` and starts an unwanted feed preview
                       * at the same time the link navigates away. Stopping propagation here, on
                       * just the description's wrapper, keeps every other part of the card
                       * (title, artist, whitespace) selecting it as before. */}
                      <span onClick={(event) => event.stopPropagation()}>
                        <RichDescription html={result.descriptionPlain} />
                      </span>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Or paste an RSS feed URL</h2>
        <label className="auralis-field" htmlFor="podcast-rss-url">
          <span className="auralis-field__label">RSS feed URL</span>
          <input
            id="podcast-rss-url"
            type="url"
            value={rssUrl}
            onChange={(event) => setRssUrl(event.target.value)}
            data-testid="podcast-rss-input"
          />
        </label>
        <Button
          variant="outlined"
          size="sm"
          onClick={() => {
            const trimmed = rssUrl.trim();
            if (trimmed.length > 0) startPreview(null, trimmed);
          }}
          disabled={rssUrl.trim().length === 0}
          data-testid="podcast-rss-preview"
        >
          Preview feed
        </Button>
      </section>

      {previewMutation.isPending ? (
        <p>Loading feed…</p>
      ) : previewMutation.isError ? (
        <p role="alert" data-testid="podcast-preview-error">
          {previewMutation.error instanceof ApiError
            ? previewMutation.error.message
            : 'Could not load this feed.'}
        </p>
      ) : previewMutation.isSuccess && active ? (
        <PodcastFeedPreview
          preview={previewMutation.data.preview}
          rssFeed={active.rssFeed}
          directoryResult={active.directoryResult}
          podcastLibrary={podcastLibrary}
        />
      ) : null}
    </div>
  );
}
