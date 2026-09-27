import { ReactNode } from 'react';

export interface InputProps {
  placeholder?: string;
  icon?: ReactNode;
  platform?: 'desktop' | 'mobile';
  value?: string;
  onChange?: (e: any) => void;
}
