import { ReactNode } from 'react';

export interface InputProps {
  placeholder?: string;
  icon?: ReactNode;
  platform?: 'desktop' | 'mobile';
  value?: string;
  /** The new text, on every keystroke. */
  onChange?: (next: string) => void;
}
