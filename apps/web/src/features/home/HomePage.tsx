/**
 * Home: real shelves ("Continue listening", "Recently added", etc.) for the
 * signed-in user's first audiobook library. Music/podcast home surfaces are a
 * later phase (docs/ROADMAP.md); this page picks the first `mediaType ===
 * 'book'` library the same way the nav rail's "Books" destination does
 * (e2e/app/navigation.spec.ts), so the two never disagree about which
 * library "Books" means.
 */
import { useState, type CSSProperties } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Card, Icon, LinearProgress, Skeleton } from '@auralis/ui';
import { useLibrariesQuery, useLibraryHomeQuery, useSetupQuery } from '../../api/queries.js';
import { useApi } from '../../api/ApiContext.js';
import type { LibraryItem, Shelf } from '../../api/types.js';

const ROW_STYLE: CSSProperties = {
  display: 'flex',
  gap: 16,
  overflowX: 'auto',
  paddingBottom: 8,
};

const COLUMN_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
};

/** Same box the cover `<img>` occupies, so a failed load doesn't reflow the card. */
const COVER_STYLE: CSSProperties = {
  width: '100%',
  aspectRatio: '1 / 1',
  objectFit: 'cover',
  borderRadius: 'var(--m3-shape-sm)',
  display: 'block',
};

/** Tonal placeholder shown in place of a cover that 404s or otherwise fails to
 * load — `api.coverUrl` (apps/web/src/api/client.ts) builds a URL from the
 * item id alone with no way to know up front whether a cover actually
 * exists, so the browser's native broken-image glyph is the alternative to
 * this. */
const COVER_FALLBACK_STYLE: CSSProperties = {
  width: COVER_STYLE.width,
  aspectRatio: COVER_STYLE.aspectRatio,
  borderRadius: COVER_STYLE.borderRadius,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--m3-surface-container-highest)',
  color: 'var(--m3-on-surface-variant)',
};

/** `authors[]` is the richer, structured field and wins when present; `author`
 * is the free-text fallback some upstream shapes send instead. */
function authorLabel(item: LibraryItem): string | null {
  const joined = item.media.authors?.map((a) => a.name).join(', ');
  if (joined && joined.length > 0) return joined;
  return item.media.author ?? null;
}

function ShelfCard({ item }: { item: LibraryItem }) {
  const api = useApi();
  const navigate = useNavigate();
  const author = authorLabel(item);
  const [coverFailed, setCoverFailed] = useState(false);

  return (
    <Card
      interactive
      variant="elevated"
      data-testid={`shelf-item-${item.id}`}
      style={{ minWidth: 160, maxWidth: 160, flex: '0 0 auto', textAlign: 'left' }}
      onClick={() => void navigate({ to: '/item/$itemId', params: { itemId: item.id } })}
    >
      {coverFailed ? (
        <div style={COVER_FALLBACK_STYLE} aria-hidden="true">
          <Icon name="library_books" size={40} />
        </div>
      ) : (
        <img
          src={api.coverUrl(item.id, { width: 240 })}
          alt=""
          width={160}
          height={160}
          style={COVER_STYLE}
          onError={() => setCoverFailed(true)}
        />
      )}
      <h3>{item.media.title}</h3>
      {author ? <p>{author}</p> : null}
      {item.progress ? (
        <LinearProgress
          value={item.progress.progress}
          aria-label={`${Math.round(item.progress.progress * 100)}% complete`}
        />
      ) : null}
    </Card>
  );
}

function ShelfRow({ shelf }: { shelf: Shelf }) {
  return (
    <section data-testid={`shelf-${shelf.id}`}>
      <h2>{shelf.label}</h2>
      <div style={ROW_STYLE}>
        {shelf.items.map((item) => (
          <ShelfCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

/** Split out from `HomePage` so `useLibraryHomeQuery` only ever mounts once a real
 * library id is known — `useLibraryHomeQuery` (apps/web/src/api/queries.ts) has no
 * `enabled` flag, so calling it with a placeholder id would fire a request that
 * 404s and flash an error before the real id arrives. */
function HomeShelves({ libraryId }: { libraryId: string }) {
  const homeQuery = useLibraryHomeQuery(libraryId);

  if (homeQuery.isLoading) {
    return (
      <div style={COLUMN_STYLE}>
        {[0, 1].map((i) => (
          <Skeleton key={i} shape="rectangular" width="100%" height={200} />
        ))}
      </div>
    );
  }

  if (homeQuery.isError) {
    return <p role="alert">Couldn't load your shelves: {homeQuery.error.message}</p>;
  }

  const shelves = (homeQuery.data?.shelves ?? []).filter((shelf) => shelf.items.length > 0);

  if (shelves.length === 0) {
    return <p>Nothing to show yet — start listening and it will show up here.</p>;
  }

  return (
    <div style={COLUMN_STYLE}>
      {shelves.map((shelf) => (
        <ShelfRow key={shelf.id} shelf={shelf} />
      ))}
    </div>
  );
}

export function HomePage() {
  const setupQuery = useSetupQuery();
  const configured = setupQuery.data?.configured ?? false;
  const librariesQuery = useLibrariesQuery(configured);
  const bookLibrary = librariesQuery.data?.libraries.find(
    (library) => library.mediaType === 'book',
  );

  return (
    <div className="auralis-page" data-testid="home-page">
      <h1>Home</h1>

      {!configured ? (
        <p>Connect Audiobookshelf in Settings to see your libraries here.</p>
      ) : librariesQuery.isLoading ? (
        <div style={COLUMN_STYLE}>
          {[0, 1].map((i) => (
            <Skeleton key={i} shape="rectangular" width="100%" height={200} />
          ))}
        </div>
      ) : librariesQuery.isError ? (
        <p role="alert">Couldn't load your libraries: {librariesQuery.error.message}</p>
      ) : !bookLibrary ? (
        <p>No audiobook library yet — connect one in Settings.</p>
      ) : (
        <HomeShelves libraryId={bookLibrary.id} />
      )}
    </div>
  );
}
