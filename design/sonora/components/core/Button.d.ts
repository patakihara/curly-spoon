import { ReactNode } from 'react';

/**
 */
export interface ButtonProps {
  children: ReactNode;
  /** Visual style. Primary = filled accent; secondary = outlined surface; ghost = text-only; danger = destructive red. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  /** Desktop = sharp Feishin-style radius; mobile = fully-rounded Material pill (Booming/Symphony). */
  platform?: 'desktop' | 'mobile';
  icon?: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  /**
   * Marks the button as a toggle and sets `aria-pressed`. For a control whose label states the
   * current state rather than the action it performs — FollowButton's "Following". Leave it
   * undefined for an ordinary button and no attribute is emitted.
   */
  pressed?: boolean;
}
