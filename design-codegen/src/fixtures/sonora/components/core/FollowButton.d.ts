/**
 * Subscription toggle whose label states the current state, not the action to take — "Following"
 * means you are, and pressing it stops. Inverts a normal button, so it always carries
 * `aria-pressed`. Wraps the existing Button rather than reimplementing it.
 */
export interface FollowButtonProps {
  following?: boolean;
  /** Called with the next following state on click. */
  onChange?: (next: boolean) => void;
  /** Overrides either label; the unset half falls back to "Follow" / "Following". */
  labels?: { off?: string; on?: string };
  platform?: 'desktop' | 'mobile';
  size?: 'sm' | 'md' | 'lg';
}
export declare function FollowButton(props: FollowButtonProps): JSX.Element;
