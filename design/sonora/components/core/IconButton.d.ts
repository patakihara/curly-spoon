import { ReactNode } from 'react';

export interface IconButtonProps {
  children: ReactNode;
  size?: number;
  active?: boolean;
  muted?: boolean;
  label: string;
  onClick?: () => void;
}
