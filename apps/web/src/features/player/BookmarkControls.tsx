/**
 * Bookmark add/list/remove for Now Playing. `ListItem` renders a `<button>` of
 * its own, so the remove control sits as a sibling rather than nested inside
 * it — a `<button>` inside a `<button>` is invalid HTML and several browsers
 * mangle the DOM to "fix" it.
 */
import { Button, Icon, IconButton, ListItem } from '@auralis/ui';
import { usePlayerStore } from '../../state/playerStore.js';
import { formatDuration } from './playback.js';
import { defaultBookmarkTitle } from './playerUi.js';

export function BookmarkControls() {
  const chapters = usePlayerStore((s) => s.chapters);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const bookmarks = usePlayerStore((s) => s.bookmarks);
  const addBookmark = usePlayerStore((s) => s.addBookmark);
  const removeBookmark = usePlayerStore((s) => s.removeBookmark);
  const seek = usePlayerStore((s) => s.seek);

  return (
    <div className="auralis-bookmarks">
      <Button
        variant="text"
        leadingIcon={<Icon name="bookmark" />}
        data-testid="bookmark-add"
        onClick={() => addBookmark(currentTime, defaultBookmarkTitle(chapters, currentTime))}
      >
        Add bookmark
      </Button>
      {bookmarks.length > 0 ? (
        <ul className="auralis-bookmarks__list" data-testid="bookmark-list">
          {bookmarks.map((bookmark) => (
            <li className="auralis-bookmarks__row" key={bookmark.id}>
              <ListItem
                data-testid={`bookmark-item-${bookmark.id}`}
                headline={bookmark.title}
                supportingText={formatDuration(bookmark.time)}
                onClick={() => seek(bookmark.time)}
              />
              <IconButton
                aria-label={`Remove bookmark ${bookmark.title}`}
                data-testid={`bookmark-remove-${bookmark.id}`}
                onClick={() => removeBookmark(bookmark.id)}
              >
                <Icon name="close" />
              </IconButton>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
