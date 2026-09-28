/** One row of the play queue — drag handle, art, title/sub, duration, remove. The current row sits on a filled card. */
export interface QueueRowProps {
  title: string;
  sub?: string;
  time?: string;
  /** Cover art; the accent tile without one. */
  image?: string;
  /** Highlights the row as the one now playing. */
  current?: boolean;
  platform?: 'desktop' | 'mobile';
  onClick?: () => void;
  onRemove?: (e?: any) => void;
  /** Show the drag handle. Off for a read-only queue that reorders only in edit mode. */
  handle?: boolean;
  /** Edit mode: adds the leading select control and drops the duration. */
  editing?: boolean;
  selected?: boolean;
  onSelectToggle?: (e?: any) => void;
  draggable?: boolean;
  onDragStart?: (e?: any) => void;
  onDragOver?: (e?: any) => void;
  onDrop?: (e?: any) => void;
  onDragEnd?: (e?: any) => void;
}
export declare function QueueRow(props: QueueRowProps): JSX.Element;
