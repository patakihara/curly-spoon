/**
 * Where the audio is going, and at what quality — a listener needs both without leaving the
 * player. Also the natural home for Auralis's direct-play-vs-transcode distinction.
 */
export interface OutputDeviceButtonProps {
  /** "Living room", "RENAULT" … omit when playing locally. */
  device?: string;
  /** "Lossless", "Transcoded" — a short badge beside the glyph. */
  quality?: string;
  /** Accent ink and a filled glyph while routed to something remote. */
  connected?: boolean;
  /** Material Symbols Rounded glyph name. Default 'speaker'; 'cast'/'bluetooth' when the route says so. */
  glyph?: string;
  onClick?: () => void;
}
export declare function OutputDeviceButton(props: OutputDeviceButtonProps): JSX.Element;
