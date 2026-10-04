import { CSSProperties, ReactNode } from 'react';

/**
 * Sonora's one icon-only button, round on every variant but tonal. `variant` picks its container:
 * `plain` (none: a glyph in surface ink, muted ink or the active colour), `outline` (a hairline
 * ring, for a quiet verb beside a row of buttons), `tonal` (a squat pill on the card fill, for a
 * control sitting on the page, such as the list/grid switch; changing `icon` turns the glyph over
 * rather than cutting to it, instantly under reduced motion), `raised` (the card fill and a shadow,
 * floating over content, as a shelf's arrows do) or `scrim` (the soft scrim in on-scrim ink, over
 * artwork). `label` is always its accessible name.
 */
export interface IconButtonProps {
  /** A glyph, an `Icon`, or any content. Ignored when `icon` is given. */
  children?: ReactNode;
  /** A Material Symbols Rounded glyph name, drawn through Icon in place of `children`. */
  icon?: string;
  /** The `icon` glyph's step of Icon's ramp. Default 'sm' (24px); 'xs' (20px) on tonal. */
  iconSize?: '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** The container. Default 'plain'. */
  variant?: 'plain' | 'outline' | 'tonal' | 'raised' | 'scrim';
  /**
   * A step of the control ramp, `--control-xs` (32px) to `--control-3xl` (72px): its height, and
   * its width but on tonal, which is a spacing step wider. Default 'sm' (36px); 'xs' on tonal.
   */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  /** On: the glyph in the `tone` colour; on tonal, accent ink and the glyph filled. */
  active?: boolean;
  /**
   * The colour `active` takes: `accent` (default), `play` for the transport's play/pause, or
   * `library` for an item kept in the library. `inherit` takes the ink of what the button sits on,
   * at rest and active, as on a status banner.
   */
  tone?: 'accent' | 'play' | 'library' | 'inherit';
  /** The muted surface ink at rest. */
  muted?: boolean;
  /** Its accessible name. */
  label: string;
  /** The action. Without it the button is drawn disabled. */
  onClick?: () => void;
  /** Drawn disabled: the glyph at 38%, a filled container at 12%, no focus or press. */
  disabled?: boolean;
  /** A tooltip, usually the label. */
  title?: string;
  /** For a toggle: whether it is on, announced as pressed. */
  pressed?: boolean;
  /** For a menu or disclosure button: whether what it opens is open. */
  expanded?: boolean;
  /** The id of the element it opens, closes or scrolls. */
  controls?: string;
  /** A class for a reveal or animation hook, such as a corner button shown on hover. */
  className?: string;
  /** Placement only: position, offsets, margin, opacity. Never its size, fill or ink. */
  style?: CSSProperties;
}
export declare function IconButton(props: IconButtonProps): JSX.Element;
