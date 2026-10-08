// Generated from nowPlaying.json by design/build.js — edit the .json, not this file.
export type Slot = unknown;   // a ComponentRef list (api.d.ts §1)

/** What is playing, as one 48px row: art, title over subtitle (mono), transport controls. The same component is the compact peek, the wide floating card and the bar above an expanded Up next sheet — they look identical. */
export interface NowPlayingProps {
  art: string;
  title: string;
  subtitle: string;
  controls: Slot;
}
