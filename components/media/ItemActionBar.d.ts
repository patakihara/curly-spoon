/**
 * The per-item verb set — save, download, share, more, play — with each verb's state legible
 * without opening a menu. Only a control whose handler is supplied is rendered. Composes
 * DownloadButton for the download toggle rather than reimplementing its ring.
 */
export interface ItemActionBarProps {
  saved?: boolean;
  /** Toggles the saved state. Given, renders the save control. */
  onSave?: () => void;
  download?: 'idle' | 'downloading' | 'done';
  /** 0–1; indeterminate when null and `download` is 'downloading'. */
  downloadProgress?: number | null;
  /** Given, renders the download control (a composed DownloadButton). */
  onDownload?: () => void;
  /** Given, renders the share control. */
  onShare?: () => void;
  /** Given, renders the overflow-menu control. */
  onMore?: () => void;
  /** Given, renders a trailing filled play circle pushed to the far edge of the bar. */
  onPlay?: () => void;
  playing?: boolean;
  /** Diameter, in px, of every control in the bar. */
  size?: number;
  platform?: 'desktop' | 'mobile';
}
export declare function ItemActionBar(props: ItemActionBarProps): JSX.Element;
