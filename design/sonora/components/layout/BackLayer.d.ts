import { ReactNode } from 'react';

/**
 * The backdrop's back layer: `--surface-bg-alt` at 0dp, no rounding and no elevation, carrying
 * the page heading and the controls that inform the front layer. `BackdropShell` places it above
 * the front layer and lets the rail run continuous with it.
 *
 * **Which controls belong here.** M2 puts "navigation, steppers, text fields, selection controls"
 * on the back layer, and a filter group arguably qualifies — but a screen's secondary header
 * belongs to the front layer. The line Sonora draws: *anything that scrolls away with the content
 * or names a section of it goes in the front layer's `FrontLayerHeader`; anything that
 * reconfigures what the front layer is showing may sit here in `controls`.* Sub-tabs and
 * "Artists / Albums / Songs" are subheader; a library-scope switch or a sort mode is `controls`.
 */
export interface BackLayerProps {
  /** The page heading, in the display face at `--h2-size` (`--h3-size` on mobile). */
  title?: string;
  /** Before the title — a back link, or on mobile the account avatar (never in a filter row). */
  leading?: ReactNode;
  /** After the title — a search button, an overflow menu. */
  trailing?: ReactNode;
  /** Contextual controls that reconfigure the front layer, on a band below the heading. */
  controls?: ReactNode;
  platform?: 'desktop' | 'mobile';
}
export declare function BackLayer(props: BackLayerProps): JSX.Element;
