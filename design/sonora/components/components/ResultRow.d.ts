import { ReactNode } from 'react';

/**
 * One row of a track, search-result or request list: art with a hover play/cancel action,
 * title + meta, and a status pill. A percentage in `status` (or an explicit `progress`)
 * draws a circular progress ring over the art; "queued", "searching" and "failed" get their own states.
 */
export interface ResultRowProps {
  title: string;
  meta?: string;
  /**
   * A line under the meta that wraps rather than cuts, up to two lines: why the row is there, such
   * as a recommendation's reason. Omit for a row that needs no reason.
   */
  detail?: string;
  /**
   * e.g. "In library", "Requested · 87%", "Queued", "Searching…", "Failed"; null for a row with
   * no status. "Playing" renders animated equalizer bars instead of a pill. On mobile a status
   * with a percentage shows only the percentage ("42%"), beside the ring over the art.
   */
  status?: string | null;
  progress?: number | null;
  /** Colour family for the pill and ring; null for a row with no status. */
  tone?: 'library' | 'request' | 'progress' | 'error' | null;
  /** Glyph for the art overlay action; "downloading" renders a pause control. */
  actionGlyph?: string;
  /** Cover art URL. Falls back to the generated gradient when omitted. */
  image?: string;
  /**
   * Material Symbols Rounded glyph name, leading the row in place of the art: a row with no cover
   * of its own, such as a search suggestion ("search") or a recent search ("history"). With no art
   * there is no art action. Ignored beside `number`.
   */
  icon?: string;
  platform?: 'desktop' | 'mobile';
  /**
   * Without it the row is drawn disabled, unless it has `onAction`: then the row is no control,
   * and only its art acts. A row holding another control (`onAction`, `trailing`) takes its tap
   * on the title for the keyboard and a screen reader, so no control sits inside another; a
   * pointer taps it anywhere.
   */
  onClick?: () => void;
  /**
   * The art's action: play, or cancel or retry a request, as the status says. Without it the art
   * draws no action; the row's `onClick` never stands in for it.
   */
  onAction?: () => void;
  /** Hairline separator along the bottom, inset to the text column. Set on all but the last row of a list. */
  divider?: boolean;
  /** A track number, leading the row in place of the art: an album's tracks, which share one cover. Null or omitted for art. */
  number?: number | null;
  /** Rendered after the status pill, at the row's trailing edge — an overflow menu or an add control. */
  trailing?: ReactNode;
}
export declare function ResultRow(props: ResultRowProps): JSX.Element;
