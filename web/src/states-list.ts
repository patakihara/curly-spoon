/**
 * What the states fixture (`/states.html`, src/states.tsx) draws, as data the browser tests read
 * too. Each entry is one interactive Sonora component, drawn three ways: with its action bound
 * (`action`), with no action (`none`) and, when it declares one, with `disabled` set. One that can
 * keep its own state is drawn a fourth way, keeping it with no action (`own`).
 */

export type Variant = 'action' | 'none' | 'disabled' | 'own';

export interface StateEntry {
  name: string;
  /** Whether it declares a `disabled` prop, and so is drawn a third way. */
  disabled: boolean;
  /** False for text fields and sliders, which Material draws with no ripple. */
  ripple: boolean;
  /** The state host under test, a selector inside the entry. Default: its first `.sn-int`. */
  target?: string;
  /**
   * The component leaves the control out when its action is absent rather than drawing it
   * disabled, so the `none` drawing has no control to test.
   */
  omits?: boolean;
  /**
   * Left uncontrolled, the component keeps its own state, so its control is enabled with no action
   * and a press changes what it shows. The `action` and `none` drawings are controlled.
   */
  owns?: boolean;
}

/** Every interactive Sonora component, at each level. */
export const STATE_ENTRIES: readonly StateEntry[] = [
  { name: 'AccountButton', disabled: false, ripple: true },
  { name: 'ArtistCard', disabled: false, ripple: true },
  { name: 'BottomNav', disabled: false, ripple: true },
  { name: 'Button', disabled: true, ripple: true },
  { name: 'ButtonGroup', disabled: false, ripple: true },
  { name: 'DownloadButton', disabled: false, ripple: true },
  { name: 'EditableList', disabled: false, ripple: true },
  { name: 'EpisodeRow', disabled: false, ripple: true },
  { name: 'ExpandableText', disabled: false, ripple: true, owns: true },
  { name: 'ExpanderRow', disabled: false, ripple: true },
  { name: 'FeatureCard', disabled: false, ripple: true, omits: true },
  { name: 'FieldRow', disabled: false, ripple: false },
  { name: 'FollowButton', disabled: false, ripple: true },
  { name: 'IconButton', disabled: true, ripple: true },
  { name: 'Input', disabled: true, ripple: false },
  { name: 'Lyrics', disabled: false, ripple: true, omits: true },
  { name: 'LyricsPage', disabled: false, ripple: true },
  { name: 'LyricsSyncButton', disabled: false, ripple: true },
  { name: 'MediaCard', disabled: false, ripple: true },
  { name: 'MediaHeader', disabled: false, ripple: true },
  { name: 'MiniPlayer', disabled: false, ripple: true },
  { name: 'NavRail', disabled: false, ripple: true },
  { name: 'NowPlaying', disabled: false, ripple: true },
  { name: 'NowPlayingPage', disabled: false, ripple: true },
  { name: 'OverflowMenu', disabled: false, ripple: true },
  { name: 'PlayActions', disabled: false, ripple: true },
  { name: 'PlayerPanel', disabled: false, ripple: true, target: '[role="tab"]' },
  { name: 'PlayerSubPage', disabled: false, ripple: true, omits: true },
  { name: 'PreviewButton', disabled: true, ripple: true },
  { name: 'QueuePage', disabled: false, ripple: true, target: '[aria-label="Clear queue"]' },
  { name: 'QueueRow', disabled: false, ripple: true },
  { name: 'QuickPick', disabled: false, ripple: true },
  { name: 'RailItem', disabled: false, ripple: true },
  { name: 'ResultRow', disabled: false, ripple: true },
  { name: 'SearchButton', disabled: false, ripple: true },
  { name: 'SearchField', disabled: true, ripple: false },
  { name: 'Section', disabled: false, ripple: true },
  { name: 'SectionHeader', disabled: false, ripple: true },
  { name: 'SeekBar', disabled: false, ripple: false },
  { name: 'SettingRow', disabled: false, ripple: true },
  { name: 'SideSheet', disabled: false, ripple: true, omits: true },
  { name: 'Slider', disabled: false, ripple: false },
  { name: 'SortFilterBar', disabled: false, ripple: true },
  { name: 'SpeedControl', disabled: false, ripple: true },
  { name: 'StatusBanner', disabled: false, ripple: true },
  { name: 'Switch', disabled: false, ripple: true },
  { name: 'TabBar', disabled: false, ripple: true },
  { name: 'TonalIconButton', disabled: true, ripple: true },
  { name: 'TransportBar', disabled: false, ripple: true },
  { name: 'ValueRow', disabled: false, ripple: true },
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
  { component: 'QueuePage', prop: 'onEditingChange' },
  ...['onDragStart', 'onDragOver', 'onDrop', 'onDragEnd'].flatMap((prop) => [
    { component: 'EditableList', prop },
    { component: 'QueueRow', prop },
  ]),
  { component: 'EditableList', prop: 'onReorder' },
  { component: 'QueuePage', prop: 'onReorder' },
];

declare global {
  interface Window {
    /** Presses of each drawing's bound action, by `pressKey`. */
    __presses: Record<string, number>;
  }
}

/** The key a press of one drawing counts under, in `window.__presses`. */
export const pressKey = (name: string, variant: Variant) => `${name}/${variant}`;
