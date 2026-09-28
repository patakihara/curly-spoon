/** Circular artist/author/narrator card for a people shelf. */
export interface ArtistCardProps {
  title: string;
  sub?: string;
  platform?: 'desktop' | 'mobile';
  /** Cover art URL. Falls back to the generated gradient when omitted. */
  image?: string;
  width?: string;
  onClick?: () => void;
}
export declare function ArtistCard(props: ArtistCardProps): JSX.Element;
