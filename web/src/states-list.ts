/**
 * What the states fixture (`/states.html`, src/states.tsx) draws, as data the browser tests read
 * too. Each entry is one interactive Sonora component, drawn three ways: with its action bound
 * (`action`), with no action (`none`) and, when it declares one, with `disabled` set. One that can
 * keep its own state is drawn a fourth way, keeping it with no action (`own`).
 */

export type Variant = 'action' | 'none' | 'disabled' | 'own';

export interface StateEntry {
  /** The component, or `Component.variant` for each look of one drawn in several. */
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
  { name: 'IconButton.outline', disabled: true, ripple: true },
  { name: 'IconButton.play', disabled: true, ripple: true },
  { name: 'IconButton.raised', disabled: true, ripple: true },
  { name: 'IconButton.scrim', disabled: true, ripple: true },
  { name: 'IconButton.tonal', disabled: true, ripple: true },
  { name: 'Input', disabled: true, ripple: false },
  { name: 'ListRow', disabled: true, ripple: true, omits: true },
  { name: 'Lyrics', disabled: false, ripple: true, omits: true },
  { name: 'LyricsPage', disabled: false, ripple: true },
  { name: 'LyricsSyncButton', disabled: false, ripple: true },
  { name: 'MediaCard', disabled: false, ripple: true },
  { name: 'MediaCard.round', disabled: false, ripple: true },
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
  { name: 'SectionHeader.subject', disabled: false, ripple: true, omits: true },
  { name: 'SeekBar', disabled: false, ripple: false },
  { name: 'SettingRow', disabled: false, ripple: true },
  { name: 'SideSheet', disabled: false, ripple: true, omits: true },
  { name: 'Slider', disabled: false, ripple: false },
  { name: 'SortFilterBar', disabled: false, ripple: true },
  { name: 'SpeedControl', disabled: false, ripple: true },
  { name: 'StatusBanner', disabled: false, ripple: true },
  { name: 'Switch', disabled: false, ripple: true },
  { name: 'TabBar', disabled: false, ripple: true },
  { name: 'TransportBar', disabled: false, ripple: true },
  { name: 'ValueRow', disabled: false, ripple: true },
  { name: 'ViewToggle', disabled: false, ripple: true },
];

declare global {
  interface Window {
    /** Presses of each drawing's bound action, by `pressKey`. */
    __presses: Record<string, number>;
    /** What each press handed the bound action, by `pressKey`: the event's type, or what it was. */
    __pressedWith: Record<string, string[]>;
  }
}

/** The Sonora component an entry draws: its name before any `.variant`. */
export const componentOf = (entry: StateEntry) => entry.name.split('.')[0]!;

/** The key a press of one drawing counts under, in `window.__presses`. */
export const pressKey = (name: string, variant: Variant) => `${name}/${variant}`;
