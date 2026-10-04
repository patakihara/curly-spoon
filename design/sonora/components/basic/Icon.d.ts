import { CSSProperties } from 'react';

/**
 * A Material Symbols Rounded glyph: the only Sonora component that sets the icon font, its size,
 * its fill and its weight. Every glyph in Sonora draws through it, hidden from assistive
 * technology: the control's label or the text beside it names what it does.
 */
export interface IconProps {
  /** Material Symbols Rounded glyph name, e.g. "play_arrow". */
  name: string;
  /** A step of the icon size ramp, `--icon-2xs` (14px) to `--icon-xl` (40px). Default 'sm', 24px. */
  size?: '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** The glyph's filled form, as play, active and on-state glyphs take. */
  filled?: boolean;
  /**
   * 'body' is the regular stroke (wght 400); 'strong' the heavier one (wght 500). 'text' sets no
   * weight: the glyph follows the font-weight of the text it sits in, as a glyph beside a button's
   * label or in a bold caption does. Default 'body'.
   */
  weight?: 'body' | 'strong' | 'text';
  /** Colour, placement or a transform; never the font settings Icon owns. */
  style?: CSSProperties;
  /** A class for an animation hook, such as a glyph that fades in when it changes. */
  className?: string;
}
export declare function Icon(props: IconProps): JSX.Element;
