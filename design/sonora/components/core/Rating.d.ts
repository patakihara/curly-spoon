/**
 * Aggregate community judgement at a glance — a single star and the value, not five stars; the
 * number carries the information and five glyphs would only decorate it.
 */
export interface RatingProps {
  /** 0–max. */
  value: number;
  /** Population; formatted compactly next to the value (17700 -> "17.7K"). */
  count?: number;
  /** Scale the value is out of. */
  max?: number;
  platform?: 'desktop' | 'mobile';
}
export declare function Rating(props: RatingProps): JSX.Element;
