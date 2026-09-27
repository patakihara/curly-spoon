/**
 * The three queue actions a music item offers: **play next** (arrow_top_right), **play**
 * (play_arrow / pause, emphasised in --accent-rose) and **play last** (last_page).
 *
 * Deliberately a *disconnected* group — three separate circles with a gap — to distinguish these
 * one-shot actions from ButtonGroup's connected segments, which express a persistent selection.
 *
 * Hidden until the user hovers or keyboard-focuses an ancestor carrying the sn-acts-host class
 * (MediaCard's artwork does this for you), because a desktop pointer can reveal them on demand
 * while a permanently visible set would compete with the cover art. Touch surfaces should pass
 * `always` or use a long-press menu instead — there is no hover to reveal them.
 */
export interface PlayActionsProps {
  /** Insert directly after the current track. */
  onNext?: () => void;
  onPlay?: () => void;
  /** Append to the end of the queue. */
  onLast?: () => void;
  /** Swaps the centre glyph to pause. */
  playing?: boolean;
  /** Diameter of the centre button in px; the outer two are 6px smaller. Default 40. */
  size?: number;
  /** Skip the hover gate and stay visible — for touch, or a permanently exposed row. */
  always?: boolean;
  gap?: string;
}
export declare function PlayActions(props: PlayActionsProps): JSX.Element;
