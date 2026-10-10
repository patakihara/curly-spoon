// Generated from appBarPage.json by design/build.js — edit the .json, not this file.
export type Slot = unknown;   // a ComponentRef list (api.d.ts §1)

/** An app-bar page (role `appBarPage`): the app bar (`appBar`) over scrolling content or a fixed body. Parts come from the page config (`header`, `content` | `body`). Its look is the app bar's (page / layer form). A page with an inner sheet is a `playerPage`, which extends this. */
export interface AppBarPageProps {
  header: Slot;
  content: Slot;
  body: Slot;
}
