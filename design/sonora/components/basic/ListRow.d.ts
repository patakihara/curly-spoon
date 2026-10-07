import { ReactNode } from 'react';

/**
 * The one row shell every list row draws (ResultRow, EpisodeRow, QueueRow, ExpanderRow, ValueRow,
 * SettingRow): a press as a button's, with Enter and Space, the hairline divider inset to the text
 * column, the leading, text and trailing slots, the density, and the row's art with its hover play
 * overlay. A press inside a control of the row stays the control's.
 */
export interface ListRowProps {
  /** The text slot, a column filling the row between the leading and trailing slots. */
  children?: ReactNode;
  /** Drawn first, before any art: a track number, a select control, a drag handle. */
  leading?: ReactNode;
  /** Drawn at the row's trailing edge: a status pill, a duration, a value, a switch, a control. */
  trailing?: ReactNode;
  /** Cover art URL for the art, which `artSize` draws. Falls back to the accent tile when omitted. */
  image?: string;
  /** A step of the art ramp (`--art-<size>`). Set, the row draws its art after `leading`; omitted, none. */
  artSize?: '3xs' | '2xs' | 'xs' | 'sm' | 'md' | 'lg';
  /** Greys the art to no colour: an item you don't have, such as an episode of a show you don't follow. */
  artGrey?: boolean;
  /** Drawn centred over the art on a scrim: work in flight, such as a progress ring. */
  artStatus?: ReactNode;
  /** The art's own action, a glyph over the art on a strong scrim, shown on hover or focus (always on a phone). Without it there is none. */
  onArt?: (e?: any) => void;
  /** The art action's accessible name. Default "Play". */
  artLabel?: string;
  /** The art action's glyph, a Material Symbols name. Default `play_arrow`. */
  artIcon?: string;
  /** The art action's glyph size, a step of the Icon ramp. Default `sm`. */
  artIconSize?: '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** The art's corner, a step of the radius ramp. Default `xs` on a phone, `2xs` on desktop. */
  artRadius?: '2xs' | 'xs';
  /** Presses the row. With neither it nor `disabled` the row is no button, only a container for its own controls. */
  onClick?: (e?: any) => void;
  /** Draws the row as a button that is off. */
  disabled?: boolean;
  /** Hairline separator along the bottom, inset to the text column. Set on all but the last row of a list. */
  divider?: boolean;
  /**
   * Padding and gap: `compact` (the queue), `regular` (default, a track list), `roomy` (an episode
   * list), `group` (a folded group), `card` (a filled settings row) or `flush` (no padding: a tile
   * whose art meets its edge, such as QuickPick).
   */
  density?: 'compact' | 'regular' | 'roomy' | 'group' | 'card' | 'flush';
  /** What it sits on: `none` (default), `card` (the card fill) or `selected` (the card tinted toward the accent). */
  surface?: 'none' | 'card' | 'selected';
  /** How the slots line up across the row: `center` (default) or `start`, the top, for a row whose text runs long. */
  align?: 'center' | 'start';
  platform?: 'desktop' | 'mobile';
  /** For a row that shows or hides something: whether it is shown, announced as expanded. */
  expanded?: boolean;
  /** Whether the row can be dragged, to reorder it. */
  draggable?: boolean;
  onDragStart?: (e?: any) => void;
  onDragOver?: (e?: any) => void;
  onDrop?: (e?: any) => void;
  onDragEnd?: (e?: any) => void;
}
export declare function ListRow(props: ListRowProps): JSX.Element;
