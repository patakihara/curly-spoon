// Generated from detailHeader.json by design/build.js — edit the .json, not this file.

/** The info of a detail page (art, title, subtitle, meta) in a bar's `expanded` slot. Fades and scales down as the bar collapses (progress); its art is the target of the shared image motion from the opening card. Layouts: column (a person), row (a collection), peek (the mini player: small art beside the text) and player (Now playing: large art bounded by artMin / artMax / artInset, centred text). */
export interface DetailHeaderProps {
  title: string;
  subtitle: string;
  image: string;
  meta: string;
}
