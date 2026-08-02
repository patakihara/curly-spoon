import type { ReactNode } from 'react';

/** One destination in the shell's primary navigation, shared by bar and rail. */
export interface NavigationItem {
  key: string;
  label: string;
  icon: ReactNode;
}

export interface NavigationSharedProps {
  items: NavigationItem[];
  activeKey: string;
  onActiveChange: (key: string) => void;
  'aria-label'?: string;
}
