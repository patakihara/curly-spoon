/**
 * Library browse: filter, sort, and (later) series grouping over one library's
 * items. Sorting and filtering are pure functions in `sorting.ts` — this
 * component is just the control bar and the query wiring around them.
 */
import { useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { Button, Card, Chip, Skeleton } from '@auralis/ui';
import { useLibrariesQuery, useLibraryItemsQuery } from '../../api/queries.js';
import { filterItems, sortItems, type SortKey } from './sorting.js';

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'title', label: 'Title' },
  { key: 'author', label: 'Author' },
  { key: 'duration', label: 'Duration' },
  { key: 'added', label: 'Recently added' },
];

export function LibraryPage() {
  const { libraryId } = useParams({ from: '/library/$libraryId' });
  const navigate = useNavigate();
  const itemsQuery = useLibraryItemsQuery(libraryId);
  // Only used to decide whether this is the podcast library, so "Add podcast" shows
  // in the one place it's reachable from — see `PodcastDiscoverPage`'s doc comment
  // for why discovery lives at its own route rather than nested under this one.
  const librariesQuery = useLibrariesQuery(true);
  const isPodcastLibrary = librariesQuery.data?.libraries.some(
    (library) => library.id === libraryId && library.mediaType === 'podcast',
  );

  const [sortKey, setSortKey] = useState<SortKey>('title');
  const [query, setQuery] = useState('');
  const [hideFinished, setHideFinished] = useState(false);

  const items = itemsQuery.data?.items ?? [];
  const visibleItems = sortItems(filterItems(items, { query, hideFinished }), sortKey);

  return (
    <div className="auralis-page" data-testid="library-page">
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
      >
        <h1>Library</h1>
        {isPodcastLibrary ? (
          <Button
            variant="tonal"
            size="sm"
            onClick={() => void navigate({ to: '/podcasts/discover' })}
            data-testid="add-podcast"
          >
            Add podcast
          </Button>
        ) : null}
      </div>

      <div
        data-testid="sort-controls"
        role="group"
        aria-label="Sort by"
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
      >
        {SORT_OPTIONS.map((option) => (
          <Chip
            key={option.key}
            variant="filter"
            selected={sortKey === option.key}
            onSelectedChange={() => setSortKey(option.key)}
            data-testid={`sort-${option.key}`}
          >
            {option.label}
          </Chip>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="search"
          aria-label="Filter this library by title or author"
          placeholder="Filter by title or author"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          data-testid="library-filter-input"
        />
        <Chip
          variant="filter"
          selected={hideFinished}
          onSelectedChange={setHideFinished}
          data-testid="filter-finished"
        >
          Finished
        </Chip>
      </div>

      {itemsQuery.isLoading ? (
        <div className="auralis-card-grid">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} shape="rectangular" width={180} height={240} />
          ))}
        </div>
      ) : itemsQuery.isError ? (
        <p role="alert">Couldn't load this library: {itemsQuery.error.message}</p>
      ) : items.length === 0 ? (
        <p>This library is empty.</p>
      ) : visibleItems.length === 0 ? (
        <p>No items match your filters.</p>
      ) : (
        <div className="auralis-card-grid" data-testid="library-item-cards">
          {visibleItems.map((item) => (
            <Card
              key={item.id}
              interactive
              variant="elevated"
              data-testid={`item-card-${item.id}`}
              onClick={() => void navigate({ to: '/item/$itemId', params: { itemId: item.id } })}
            >
              <h2>{item.media.title}</h2>
              {item.media.authors?.length ? (
                <p>{item.media.authors.map((a) => a.name).join(', ')}</p>
              ) : item.media.author ? (
                <p>{item.media.author}</p>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
