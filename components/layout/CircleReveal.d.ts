/**
 * Wraps a surface so it grows into view as a circle from the point that opened it — a detail
 * page expanding out of the card you tapped. Pass the pointer's viewport coordinates; with no
 * coordinates it expands from the centre. Honours prefers-reduced-motion by appearing at once.
 */
export interface CircleRevealProps {
  /** Pointer clientX that triggered the open. */
  x?: number;
  /** Pointer clientY that triggered the open. */
  y?: number;
  /** Styles for the revealed surface itself (position, background, layout). */
  style?: React.CSSProperties;
  /** Defaults to `var(--duration-medium)`. */
  duration?: string;
  children?: React.ReactNode;
}
export declare function CircleReveal(props: CircleRevealProps): JSX.Element;
