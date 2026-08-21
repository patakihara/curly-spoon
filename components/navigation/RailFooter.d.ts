import { ReactNode } from 'react';

/**
 * The pinned bottom of a `NavRail` — the theme switch and the identity of the library you are
 * looking at. Goes in the rail's `footer` slot, which is the one part of the rail that never
 * scrolls, so this is where a persistent, whole-app control belongs rather than in `items`.
 *
 * It takes the rail's own `expanded` and mirrors it: expanded, the theme buttons sit side by
 * side with their labels and the identity row shows its two lines; collapsed, the buttons stack
 * and every label goes, so the footer narrows with the rail instead of clipping. Pass the same
 * value you pass the rail — nothing is read from the DOM.
 *
 * Sections appear only when their handler or content does, the same rule `ItemActionBar`
 * follows: no `onThemeChange` and there is no switch, no `title`/`image` and there is no
 * identity row. A footer given neither renders only `children`.
 *
 * The theme switch sets the value; it does not apply it. Sonora's theming is `data-theme` on an
 * ancestor, so the owning screen holds the state and puts it on the frame (`BackdropShell`'s or
 * `AppShell`'s `theme`) — this is the control, not the mechanism.
 */
export interface RailFooterProps {
  /** The rail's expanded state. Pass the rail's own value so the two narrow together. */
  expanded?: boolean;
  /** The theme currently applied, matched against `themes` to mark the pressed button. */
  theme?: string;
  /** Selectable theme names, in order. Default `['light', 'dark']`. */
  themes?: string[];
  /** Glyph per theme name, merged over the built-in `light`/`dark`/`system` table. */
  themeIcons?: Record<string, string>;
  /** Sets the theme. Omit it and no switch is rendered at all. */
  onThemeChange?: (theme: string) => void;
  /** The library's name — "Local Library". First line of the identity row. */
  title?: string;
  /** What is in it — "Music · Books · Podcasts". Second line; hidden while collapsed. */
  sub?: string;
  /** Artwork for the identity avatar, through `CoverArt`. Without it the avatar is a flat `--accent` disc. */
  image?: string;
  /** Avatar diameter in px. Default 28 — sized to the collapsed rail, not to a page. */
  avatarSize?: number;
  /** Makes the identity row a real button — opening an account menu or a server picker. */
  onIdentityClick?: () => void;
  /** Extra footer content, above the switch — a storage meter, an offline `StatusBanner`. */
  children?: ReactNode;
}
export declare function RailFooter(props: RailFooterProps): JSX.Element;
