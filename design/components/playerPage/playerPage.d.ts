// Generated from playerPage.json by design/build.js — edit the .json, not this file.
import type { AppBarPageProps } from '../appBarPage/appBarPage';
export type Slot = unknown;   // a ComponentRef list (api.d.ts §1)

/** A player page (role `playerPage`, extends `appBarPage`): an app-bar page with an inner sheet (`pageSheet`) below its body (Now playing: Up next / Lyrics / Related). Parts: the app-bar page's, plus `sheet`. Looks like an app-bar page; the sheet's look is the hire's (`bottomSheet`).
 *  Variant of appBarPage: drawn by its implementation. */
export interface PlayerPageProps extends AppBarPageProps {
  sheet: Slot;
}
