/**
 * Offline availability as a three-state control: idle -> downloading (determinate or
 * indeterminate, cancellable mid-flight) -> done, and pressing a done button removes the
 * download. An IconButton: outlined at rest and done, plain while its ProgressRing runs, so the
 * ring is not drawn inside a second one.
 */
export interface DownloadButtonProps {
  state?: 'idle' | 'downloading' | 'done';
  /** 0–1. Indeterminate ring when null and `state` is 'downloading'. */
  progress?: number | null;
  /** Fires on press in every state: starts, cancels, or removes, depending on `state`. Without it the button is drawn disabled. */
  onClick?: () => void;
  /** A step of IconButton's control ramp. Default 'sm' (36px). */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
}
export declare function DownloadButton(props: DownloadButtonProps): JSX.Element;
