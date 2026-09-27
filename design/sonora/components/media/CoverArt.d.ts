/**
 * The artwork layer used inside every art container in the system. Absolutely fills its parent
 * (which must be `position: relative` and `overflow: hidden`) and owns one detail that is easy to
 * get wrong: the gradient fallback is *removed* once the image loads, rather than left behind it.
 *
 * A rounded corner is antialiased, so semi-transparent edge pixels blend with whatever is behind
 * the image — a gradient left underneath shows up as a coloured fringe around the art, which no
 * amount of image bleed can hide.
 */
export interface CoverArtProps {
  /** Image URL. Omitted or still loading, the fallback shows instead. */
  src?: string;
  /** CSS background for the placeholder. Defaults to the accent→violet gradient. */
  fallback?: string;
  alt?: string;
}
export declare function CoverArt(props: CoverArtProps): JSX.Element;
