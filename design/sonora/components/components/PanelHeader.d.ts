import { ReactNode } from 'react';

/**
 * The header of a panel: its title, any controls before and after it, and its close. Sonora's one
 * panel header: the phone player sheet (`NowPlaying`), the player's sub-pages (`PlayerSubPage`) and
 * the side sheet (`SideSheet`) all draw it. The app bar is `BackLayer`'s, not this.
 */
export interface PanelHeaderProps {
  /** What the panel holds. It clips to one line. */
  title?: string;
  /**
   * `page` (default): a player sub-page's bar, `--appbar-height-mobile` tall, its title in the body
   * face, the close at its end. `player`: the phone player sheet's bar, what it plays from as a
   * centred overline between `leading` and `trailing`. `sheet`: a side sheet's title row, as tall as
   * the desktop app bar (`--appbar-height`) on the sheet's fill, its title a heading, the close
   * pinned to the top corner.
   */
  variant?: 'page' | 'player' | 'sheet';
  /** `page` only: its inset, `--spacing-lg` on a phone and `--spacing-md` on desktop. */
  platform?: 'desktop' | 'mobile';
  /** Controls before the title, such as the player sheet's collapse. */
  leading?: ReactNode;
  /** Controls after the title, such as the player sheet's menu. */
  trailing?: ReactNode;
  /** Closes the panel, handed the click event. Without it there is no close. */
  onClose?: (e?: any) => void;
  /** The close's accessible name. Default "Close" and the title. */
  closeLabel?: string;
  /** Material Symbols glyph for the close. Default 'close'. */
  closeGlyph?: string;
  /** The id of what the close folds away, announced as what it controls. */
  closeControls?: string;
  /** A hairline under the header. */
  divider?: boolean;
}
export declare function PanelHeader(props: PanelHeaderProps): JSX.Element;
