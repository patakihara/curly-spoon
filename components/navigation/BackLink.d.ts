/** Back affordance above a detail page, naming the place it returns to. */
export interface BackLinkProps {
  label: string;
  platform?: 'desktop' | 'mobile';
  onClick?: () => void;
}
export declare function BackLink(props: BackLinkProps): JSX.Element;
