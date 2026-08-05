/**
 * The favourite toggle shared by every place this wave adds one: an album's track rows, an
 * album's own header, an artist's own header, and the favourites view. A real toggle control
 * — `@auralis/ui`'s `IconButton` already implements `aria-pressed` plus a required
 * `aria-label` for exactly this "two-state, icon-only" shape (see that component's own doc
 * comment: "toggle mode (e.g. shuffle, like)") — this wraps it with the one thing every call
 * site here needs and would otherwise duplicate: the mutation call, the accessible name text,
 * and (for rows/cards where the toggle sits inside something else that's clickable — an
 * album's track row plays on click, an artist's album card navigates on click)
 * stopping the click from also triggering that outer handler.
 *
 * Deliberately not added to `packages/ui` — this wave's spec scopes that package out, and
 * the mutation call itself (`useToggleJellyfinFavoriteMutation`) is this app's own API layer,
 * not a design-system concern that package could own without a dependency the other way.
 */
import { Icon, IconButton } from '@auralis/ui';
import { useToggleJellyfinFavoriteMutation } from '../../api/queries.js';

export interface FavoriteToggleProps {
  itemId: string;
  /** Used only to build the accessible name ("Remove Roygbiv from favourites") — never
   * rendered as visible text, so a generic fallback is fine if a caller has nothing better. */
  itemName: string;
  favorite: boolean;
  /** Called when the mutation rejects, after the optimistic flip has already rolled back —
   * see `useToggleJellyfinFavoriteMutation`'s own doc comment for why the rollback itself is
   * silent and this is how the caller learns to tell the user. */
  onError?: () => void;
  /** Called synchronously, before the mutation is even started — i.e. before the optimistic
   * cache write that (for a caller like `MusicFavoritesPage` that filters its list down to
   * `favorite === true` items) removes this row on the very same render. A caller that needs
   * to redirect focus away from this button before its own row disappears (rather than
   * leaving the browser to drop focus to `<body>`, the phase-10 a11y audit's finding) must do
   * it here, not in a mutation callback — by the time any mutation callback fires, the row
   * this button was in may already be gone. */
  onToggle?: (nextFavorite: boolean) => void;
  /** Set to `false` when this toggle is not nested inside another clickable element (e.g. a
   * page header, not a row or card) — stopping propagation there would be a silent no-op but
   * there is no reason to call it either. Defaults to `true` since every current call site
   * needs it. */
  stopPropagation?: boolean;
  'data-testid'?: string;
}

export function FavoriteToggle({
  itemId,
  itemName,
  favorite,
  onError,
  onToggle,
  stopPropagation = true,
  'data-testid': testId,
}: FavoriteToggleProps) {
  const mutation = useToggleJellyfinFavoriteMutation();

  return (
    <IconButton
      aria-label={favorite ? `Remove ${itemName} from favourites` : `Add ${itemName} to favourites`}
      selected={favorite}
      data-testid={testId}
      onClick={(event) => {
        if (stopPropagation) event.stopPropagation();
      }}
      onSelectedChange={(nextFavorite) => {
        onToggle?.(nextFavorite);
        mutation.mutate({ itemId, favorite: nextFavorite }, { onError: () => onError?.() });
      }}
    >
      <Icon name="heart" />
    </IconButton>
  );
}
