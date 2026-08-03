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
import { Icon, LinearProgress, MantineImage, Skeleton } from '@auralis/ui';
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

/**
 * Deliberately no card chrome — no border, background fill, shadow or
 * padding box. Every reference cited for this app's grid tiles (Feishin,
 * YouTube Music, Spotify, Symfonium) renders a bare square of cover art with
 * title/subtitle floating directly beneath it on the page background, not
 * boxed inside a container. A prior pass wrapped this in a Mantine `Card`
 * (a generic bordered default) instead of matching that — this is the fix.
 */
const TILE_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  width: 160,
  flex: '0 0 auto',
  textAlign: 'left',
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  font: 'inherit',
  color: 'inherit',
};

const TITLE_STYLE: CSSProperties = {
  margin: '8px 0 0',
  fontSize: 14,
  fontWeight: 700,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const AUTHOR_STYLE: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--m3-on-surface-variant)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
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
    <button
      type="button"
      data-testid={`shelf-item-${item.id}`}
      style={TILE_STYLE}
      onClick={() => void navigate({ to: '/item/$itemId', params: { itemId: item.id } })}
    >
      {/*
       * Mantine's `Image` has a `fallbackSrc` prop for the broken-cover case, but it
       * only accepts a replacement *image URL* — this design wants a centred
       * `Icon`, not another image, so that requirement doesn't cleanly fit
       * `fallbackSrc`. Kept the existing `coverFailed` state/`onError` toggle
       * (still needed to decide *which* element to render at all), and only
       * use Mantine's `Image` in the success case, for its `fit` styling API.
       */}
      {coverFailed ? (
        <div style={COVER_FALLBACK_STYLE} aria-hidden="true">
          <Icon name="book" size={40} />
        </div>
      ) : (
        <MantineImage
          src={api.coverUrl(item.id, { width: 240 })}
          alt=""
          width={160}
          height={160}
          fit="cover"
          style={COVER_STYLE}
          onError={() => setCoverFailed(true)}
        />
      )}
      <h3 style={TITLE_STYLE}>{item.media.title}</h3>
      {author ? <p style={AUTHOR_STYLE}>{author}</p> : null}
      {item.progress ? (
        <LinearProgress
          value={item.progress.progress}
          aria-label={`${Math.round(item.progress.progress * 100)}% complete`}
        />
      ) : null}
    </button>
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
