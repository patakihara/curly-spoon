/** One verb in an OverflowMenu. */
export interface OverflowMenuItem {
  key: string;
  label: string;
  /** Material Symbols Rounded glyph name, leading the label in muted ink. */
  icon?: string;
  /** One muted line under the label, saying what the verb does, e.g. "A lossless copy, by torrent". */
  sub?: string;
}

/**
 * The three-dot button and the menu it opens: the verbs an item offers that are not worth a
 * button of their own, such as adding it to the library or going to its artist. On desktop the
 * menu drops below the button on a raised card and lies over what follows it. On a phone
 * (`platform="mobile"`) it is a modal bottom sheet instead: fixed to the window's foot, over a
 * scrim that covers everything, the bottom bar and mini-player included, with a drag handle and
 * 56px rows; tapping the scrim closes it. Pass it where a row, a card or a header takes a
 * trailing control.
 */
export interface OverflowMenuProps {
  items: OverflowMenuItem[];
  /** The button's accessible name and the menu's. Default "More options". */
  label?: string;
  /** Shows the menu open (true) or shut (false), for a still. Omit to let the button decide. */
  open?: boolean;
  /** Called with the next open state when the button is pressed or a verb is chosen. */
  onOpenChange?: (next: boolean) => void;
  /** Called with the chosen item's key. */
  onSelect?: (key: string) => void;
  /** Which edge of the button the menu lines up with. Default 'end'. */
  align?: 'start' | 'end';
  /**
   * The button's own look: 'surface' (default) is a plain icon button in surface ink; 'scrim' is
   * a small round button on a scrim in on-scrim ink, for a menu that sits over artwork.
   */
  tone?: 'surface' | 'scrim';
  platform?: 'desktop' | 'mobile';
}
export declare function OverflowMenu(props: OverflowMenuProps): JSX.Element;
