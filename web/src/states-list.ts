/**
 * What the states fixture (`/states.html`, src/states.tsx) draws, as data the browser tests read
 * too. Each entry is one interactive Sonora component, drawn three ways: with its action bound
 * (`action`), with no action (`none`) and, when it declares one, with `disabled` set.
 */

export type Variant = 'action' | 'none' | 'disabled';

export interface StateEntry {
  name: string;
  /** Whether it declares a `disabled` prop, and so is drawn a third way. */
  disabled: boolean;
  /** False for text fields and sliders, which Material draws with no ripple. */
  ripple: boolean;
  /** The state host under test, a selector inside the entry. Default: its first `.sn-int`. */
  target?: string;
}

/** The interactive components at Sonora's basic level. */
export const STATE_ENTRIES: readonly StateEntry[] = [
  { name: 'AccountButton', disabled: false, ripple: true },
  { name: 'Button', disabled: true, ripple: true },
  { name: 'ButtonGroup', disabled: false, ripple: true },
  { name: 'DownloadButton', disabled: false, ripple: true },
  { name: 'ExpandableText', disabled: false, ripple: true },
  { name: 'FollowButton', disabled: false, ripple: true },
  { name: 'IconButton', disabled: true, ripple: true },
  { name: 'Input', disabled: true, ripple: false },
  { name: 'LyricsSyncButton', disabled: false, ripple: true },
  { name: 'OverflowMenu', disabled: false, ripple: true },
  { name: 'PreviewButton', disabled: true, ripple: true },
  { name: 'RailItem', disabled: false, ripple: true },
  { name: 'SearchButton', disabled: false, ripple: true },
  { name: 'SearchField', disabled: true, ripple: false },
  { name: 'SeekBar', disabled: false, ripple: false },
  { name: 'Slider', disabled: false, ripple: false },
  { name: 'SortFilterBar', disabled: false, ripple: true },
  { name: 'SpeedControl', disabled: false, ripple: true },
  { name: 'Switch', disabled: false, ripple: true },
  { name: 'TonalIconButton', disabled: true, ripple: true },
  { name: 'ViewToggle', disabled: false, ripple: true },
];

/**
 * Handler props that are not actions: a control is never disabled for lacking one. Everything else
 * named `on…` in a Sonora `.d.ts` is an action, and its component has an entry above.
 */
export const NOT_ACTIONS: readonly { component: string; prop: string }[] = [
  { component: 'BackdropShell', prop: 'onProgress' },
  { component: 'FrontLayer', prop: 'onProgress' },
  { component: 'ScrollArea', prop: 'onScroll' },
  { component: 'FrontLayerHeader', prop: 'onSpyChange' },
  { component: 'OverflowMenu', prop: 'onOpenChange' },
  ...['onDragStart', 'onDragOver', 'onDrop', 'onDragEnd'].flatMap((prop) => [
    { component: 'EditableList', prop },
    { component: 'QueueRow', prop },
  ]),
];

declare global {
  interface Window {
    /** Presses of each drawing's bound action, by `pressKey`. */
    __presses: Record<string, number>;
  }
}

/** The key a press of one drawing counts under, in `window.__presses`. */
export const pressKey = (name: string, variant: Variant) => `${name}/${variant}`;
