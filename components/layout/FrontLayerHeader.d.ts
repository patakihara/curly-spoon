import { ReactNode } from 'react';

/**
 * The front layer's subheader — a fixed area on the front layer, at the same 1dp as the content
 * scrolling below it. This is where a screen's secondary header lives in a backdrop: tabs, a
 * connected `ButtonGroup`, a scoped `SearchField`. It is *not* part of the app bar, and it does
 * not carry the layer's rounding; the front layer does.
 *
 * Its horizontal padding is `--grid-margin`, the page measure, so tabs line up with the section
 * headings beneath them.
 *
 * The divider rule:
 * - `tabs={false}` — a hairline fades in along the bottom edge with scroll progress.
 * - `tabs={true}` — a hairline is always shown, static rather than scroll-linked, and the tabs
 *   are pinned flush to the band's bottom edge (instead of centered) so the tab bar's own
 *   underline indicator sits right on it, reading as one line instead of two.
 * - Either way the hairline is **inset** by the page margin rather than spanning the gutters, so
 *   it reads as the top of the content column instead of cutting the surface in half.
 *
 * ### The scroll-spy subheader (`spy`)
 *
 * A front layer that scrolls vertically **requires** a subheader — the band is what the content
 * scrolls under. When the screen has no control to put in it, the band is not therefore empty:
 * with `spy` it shows the title of the section that has most recently scrolled up past it. At the
 * top, before any section has passed, it is blank, and that blank is a real state — the row keeps
 * its height so nothing jumps when the first title arrives.
 *
 * Two ways to say what the titles are, neither of which requires rewriting page content:
 *
 * - **The caller supplies them** — `sections={['Jump back in', 'Recently added', …]}`, the same
 *   strings already passed to the `Section`s in the feed, in document order. They are matched
 *   positionally against the elements found by `spySelector`, whose default already matches the
 *   `<section>` that `Section` renders. Used only when the count matches exactly: a mismatch
 *   would label each section with its neighbour's name, so it falls back to blank instead.
 * - **The content carries them** — any element in the scroll container with a `data-spy-title`
 *   attribute. Per-element, so it always wins over the positional list, and it is the way in when
 *   the feed is not built from `Section`.
 *
 * The band finds the scroller itself, by looking inside the front layer for the vertical scroller
 * that contains sections, and watches it with a capture listener. It never writes `scrollTop`, so
 * `FrontLayer`'s per-view scroll memory is untouched. Horizontal shelves are ignored.
 *
 * A title change cross-fades over `--duration-fast` on `--ease-standard`, and is instant under
 * `prefers-reduced-motion`.
 */
export interface FrontLayerHeaderProps {
  /** A `TabBar`, a `ButtonGroup`, a `SearchField` — whatever the screen's secondary header is. */
  children?: ReactNode;
  /** The content is a tab bar: shows a static (non-scroll-linked) hairline and pins children to the band's bottom edge, so the tab bar's own indicator sits on that hairline. */
  tabs?: boolean;
  /** 0–1 scroll progress; `FrontLayer` supplies it. Pass it explicitly to show a scrolled state statically. */
  progress?: number;
  /**
   * Turn the band into a scroll spy: it reports the section title that last passed under it, and
   * is blank until one does. Leading in the band, so `children` may still sit beside it — but the
   * case this exists for is the subheader that has no control of its own and would otherwise be
   * an empty strip.
   */
  spy?: boolean;
  /**
   * The section titles, in document order — plain strings, or objects with a `title`. Matched
   * positionally against the elements `spySelector` finds, and only when the counts agree.
   * Ignored entirely without `spy`.
   */
  sections?: Array<string | { title?: string }>;
  /**
   * Which elements count as sections. Default `'[data-spy-title],section'` — the `<section>` that
   * `Section` already renders, plus anything explicitly tagged. Narrow it when a feed nests
   * sections it does not want spied.
   */
  spySelector?: string;
  /**
   * Controlled form: the title to show, `''` for the blank state. Supplying it switches the DOM
   * watching off entirely, which is how a card shows a given state without being scrolled.
   * Requires `spy` — the row is not rendered at all without it, so `spyTitle` alone does nothing.
   */
  spyTitle?: string;
  /** Fires with the new title each time it changes, `''` when the band goes back to blank. */
  onSpyChange?: (title: string) => void;
  platform?: 'desktop' | 'mobile';
}
export declare function FrontLayerHeader(props: FrontLayerHeaderProps): JSX.Element;
