/**
 * Inline SVG icon set — no icon font, no network fetch, so icons render correctly
 * offline (this app is a PWA meant to work with no media server *or* CDN reachable).
 * Path data is sourced from `@material-symbols/svg-400` (rounded, filled style),
 * vendored in at build time as literal path strings rather than a runtime
 * dependency on the package — every glyph shares that package's
 * `-960 960 960` viewBox and draws in `currentColor` so it inherits whatever
 * text colour the surrounding component sets.
 *
 * A subset of glyphs — `FILLABLE_ICON_NAMES` — additionally support the FILL axis via a
 * `filled` prop (default `true`, unchanged appearance), for surfaces like Sonora's nav rail
 * where a selected destination reads as filled and an unselected one as outlined. See the
 * `IconProps` doc comment for why that is a discriminated union rather than a plain boolean.
 */
import { forwardRef, memo, type SVGProps } from 'react';

export const ICON_NAMES = [
  'play',
  'pause',
  'skip_next',
  'skip_previous',
  'forward_30',
  'replay_30',
  'speed',
  'sleep_timer',
  'bookmark',
  'queue',
  'search',
  'library_books',
  'book',
  'book_2',
  'podcasts',
  'music_note',
  'home',
  'settings',
  'download',
  'add',
  'close',
  'chevron_left',
  'chevron_right',
  'more_vert',
  'heart',
  'shuffle',
  'repeat',
  'cast',
  'lyrics',
  'check',
  'error',
  // Added for the Sonora redesign (wave 16b-3) — see ROADMAP.md §16.
  'album',
  'auto_stories',
  'bigtop_updates',
  'check_circle',
  'download_done',
  'explore',
  'favorite',
  'history',
  'keyboard_arrow_down',
  'play_arrow',
  'queue_music',
  'rss_feed',
  'schedule',
  'trending_up',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/**
 * The subset of glyphs that can render in either the filled (FILL 1) or outlined (FILL 0)
 * form of Material Symbols Rounded — the mechanism `SONORA.md` documents as "Selected nav
 * destinations use the Material Symbols FILL axis" (`docs/design/SONORA.md` §3.7). Both
 * forms live in the *same* `@material-symbols/svg-400/rounded/` family (rounded corners
 * throughout); FILL 0 is the bare `<name>.svg`, FILL 1 is `<name>-fill.svg`. This is
 * deliberately not the package's separate `outlined/` directory, which is a different
 * corner-shape family entirely and would mix shapes within one icon.
 */
export const FILLABLE_ICON_NAMES = ['explore', 'album', 'book_2', 'podcasts', 'search'] as const;

export type FillableIconName = (typeof FILLABLE_ICON_NAMES)[number];

/**
 * Narrows a plain `IconName` to `FillableIconName`. Needed by any caller that wants to pass
 * `filled` while only holding a widened `IconName` (not a literal) — `IconProps`' `filled`
 * arm requires `name: FillableIconName` exactly, which a widened value doesn't satisfy on
 * its own. `packages/ui/gallery/App.tsx`'s outline row uses `FILLABLE_ICON_NAMES` directly
 * instead (each element is already a `FillableIconName` literal); this is for the case where
 * only a runtime `IconName` value is available, e.g. wiring a nav item's selected state.
 */
export function isFillableIconName(name: IconName): name is FillableIconName {
  return (FILLABLE_ICON_NAMES as readonly string[]).includes(name);
}

/**
 * Path data for each glyph, extracted verbatim from `@material-symbols/svg-400`
 * (rounded, filled/"-fill" variant, weight 400) — installed at
 * `packages/ui/node_modules/@material-symbols/svg-400/rounded/<name>-fill.svg`
 * and copied out of the `d` attribute of the real file, not invented. That
 * package's source SVGs use a `0 -960 960 960` viewBox rather than the classic
 * Material Icons `0 0 24 24`, which is why the wrapper `<svg>` below matches it
 * instead. Source file per glyph, all in `rounded/`:
 *
 * play -> play_arrow-fill.svg, pause -> pause-fill.svg, skip_next ->
 * skip_next-fill.svg, skip_previous -> skip_previous-fill.svg, forward_30 ->
 * forward_30-fill.svg, replay_30 -> replay_30-fill.svg, speed -> speed-fill.svg,
 * sleep_timer -> bedtime-fill.svg, bookmark -> bookmark-fill.svg, queue ->
 * queue_music-fill.svg, search -> search-fill.svg, library_books ->
 * library_books-fill.svg, book -> auto_stories-fill.svg (a single open book,
 * deliberately distinct from library_books' shelf-of-books glyph — used where a
 * placeholder represents one specific item, not the library destination),
 * book_2 -> book_2-fill.svg (a closed book with a bookmark ribbon), podcasts ->
 * podcasts-fill.svg, music_note ->
 * music_note-fill.svg, home -> home-fill.svg, settings -> settings-fill.svg,
 * download -> download-fill.svg, add -> add-fill.svg, close -> close-fill.svg,
 * chevron_left -> chevron_left-fill.svg, chevron_right -> chevron_right-fill.svg,
 * more_vert -> more_vert-fill.svg, heart -> favorite-fill.svg, shuffle ->
 * shuffle-fill.svg, repeat -> repeat-fill.svg, cast -> cast-fill.svg, lyrics ->
 * lyrics-fill.svg, check -> check-fill.svg, error -> error-fill.svg, album ->
 * album-fill.svg, bigtop_updates -> bigtop_updates-fill.svg (a podcast-episode /
 * feed-update glyph, distinct from rss_feed), check_circle -> check_circle-fill.svg,
 * download_done -> download_done-fill.svg, explore -> explore-fill.svg, history ->
 * history-fill.svg, keyboard_arrow_down -> keyboard_arrow_down-fill.svg, rss_feed ->
 * rss_feed-fill.svg, schedule -> schedule-fill.svg, trending_up -> trending_up-fill.svg.
 *
 * Four names added for wave 16b-3 are **not** separately vendored, because the upstream
 * package gives them byte-identical path data to a glyph this file already had under a
 * different name — verified by diffing the `d` attribute, not assumed from the name:
 * `auto_stories-fill.svg` === `book`'s existing path (this file's own comment already
 * recorded that source above); `queue_music-fill.svg` === `queue`'s existing path
 * (ditto); `play_arrow-fill.svg` === `play`'s existing path; `favorite-fill.svg` ===
 * `heart`'s existing path. Each pair shares one literal constant below rather than two
 * copies of the same string, so they cannot drift apart if one is ever hand-edited.
 *
 * `OUTLINE_PATHS` below holds the FILL-0 counterpart for `FILLABLE_ICON_NAMES`, sourced
 * from the same `rounded/` directory's bare `<name>.svg` (no `-fill` suffix). Two of the
 * five are visually identical to their filled form — `podcasts` and `search` — because
 * neither glyph has an enclosed region the FILL axis changes; that was verified by diffing
 * `d` attributes too, not assumed, and is not a bug in this file.
 */
const PLAY_ARROW_PATH =
  'M320-258v-450q0-14 9-22t21-8q4 0 8 1t8 3l354 226q7 5 10.5 11t3.5 14q0 8-3.5 14T720-458L366-232q-4 2-8 3t-8 1q-12 0-21-8t-9-22Z';
const FAVORITE_PATH =
  'M458-144q-11-4-19-12l-53-49Q262-320 171-424.5T80-643q0-90 60.5-150.5T290-854q51 0 101 24.5t89 80.5q44-56 91-80.5t99-24.5q89 0 149.5 60.5T880-643q0 114-91 218.5T574-205l-53 49q-8 8-19 12t-22 4q-11 0-22-4Z';
const AUTO_STORIES_PATH =
  'M467-172.5q-6-1.5-11-5.5-44-29-93.5-45.5T260-240q-42 0-82.5 11T100-198q-21 11-40.5-1T40-234v-482q0-11 5.5-21T62-752q46-24 96-36t102-12q58 0 113.5 15T480-740v506q51-33 107-49.5T700-300q36 0 78.5 7t81.5 29v-505q10 4 19.5 8t18.5 9q10 6 16 15.5t6 20.5v482q0 23-19.5 35t-40.5 1q-37-20-77.5-31T700-240q-53 0-102.5 16.5T504-178q-5 4-11 5.5t-13 1.5q-7 0-13-1.5ZM565-349q-8 6-16.5 2.5T540-360v-314q0-3 1-5.5t3-4.5l230-230q7-7 16.5-3.5T800-904v344q0 3-1.5 6t-3.5 5L565-349Z';
const QUEUE_MUSIC_PATH =
  'M642.94-160q-47.94 0-81.44-33.56t-33.5-81.5q0-47.94 32.67-81.44Q593.33-390 640-390q15.97 0 30.48 3Q685-384 698-377v-308q0-14.88 10.35-24.94T734-720h111q14.88 0 24.94 10.29t10.06 25.5Q880-669 869.94-659T845-649h-87v375q0 47.5-33.56 80.75T642.94-160ZM150-320q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h246q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H150Zm0-170q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h413q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H150Zm0-170q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h413q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H150Z';

const PATHS: Record<IconName, string> = {
  play: PLAY_ARROW_PATH,
  pause:
    'M615-200q-24.75 0-42.37-17.63Q555-235.25 555-260v-440q0-24.75 17.63-42.38Q590.25-760 615-760h55q24.75 0 42.38 17.62Q730-724.75 730-700v440q0 24.75-17.62 42.37Q694.75-200 670-200h-55Zm-325 0q-24.75 0-42.37-17.63Q230-235.25 230-260v-440q0-24.75 17.63-42.38Q265.25-760 290-760h55q24.75 0 42.38 17.62Q405-724.75 405-700v440q0 24.75-17.62 42.37Q369.75-200 345-200h-55Z',
  skip_next:
    'M680-270v-420q0-13 8.5-21.5T710-720q13 0 21.5 8.5T740-690v420q0 13-8.5 21.5T710-240q-13 0-21.5-8.5T680-270Zm-460-27v-366q0-14 9-22t21-8q5 0 9 1.5t8 4.5l263 182q7 5 10 11.5t3 13.5q0 7-3 13.5T530-455L267-273q-4 3-8 4.5t-9 1.5q-12 0-21-8t-9-22Z',
  skip_previous:
    'M220-270v-420q0-13 8.5-21.5T250-720q13 0 21.5 8.5T280-690v420q0 13-8.5 21.5T250-240q-13 0-21.5-8.5T220-270Zm473-3L430-455q-7-5-10-11.5t-3-13.5q0-7 3-13.5t10-11.5l263-182q4-3 8-4.5t9-1.5q12 0 21 8t9 22v366q0 14-9 22t-21 8q-5 0-9-1.5t-8-4.5Z',
  forward_30:
    'M339.5-108Q274-136 225-185t-77-114.5Q120-365 120-440t28-140.5Q176-646 225-695t114.5-77Q405-800 480-800h23l-57-57q-8-8-8-20.5t7.65-20.5q8.35-8 20.35-8.5 12-.5 20 7.5l106 106q9 9 9 21t-9 21L487-646q-9 9-21 9t-21.39-9q-8.61-9-8.61-21t9-21l52-52h-22q-125 0-210 87.32T180-440q0 125.36 87.5 212.68Q355-140 480-140t212.5-87.32Q780-314.64 780-440q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38 0 75-28 140.5T735-185q-49 49-114.5 77T480-80q-75 0-140.5-28ZM408-310H306q-10.83 0-17.92-7.12-7.08-7.11-7.08-18 0-10.88 7.08-17.88 7.09-7 17.92-7h96v-55h-56.67Q334-415 327-422q-7-7-7-18t7-18q7-7 18.33-7H402v-56h-96q-10.83 0-17.92-7.12-7.08-7.11-7.08-18 0-10.88 7.08-17.88 7.09-7 17.92-7h101.78q19.22 0 31.72 12.65T452-527v173q0 18.7-12.65 31.35Q426.7-310 408-310Zm145 0q-18.7 0-31.35-12.65Q509-335.3 509-354v-173q0-18.7 12.65-31.35Q534.3-571 553-571h83q18.7 0 31.35 12.65Q680-545.7 680-527v173q0 18.7-12.65 31.35Q654.7-310 636-310h-83Zm6-50h71v-161h-71v161Z',
  replay_30:
    'M408-310H306q-10.83 0-17.92-7.12-7.08-7.11-7.08-18 0-10.88 7.08-17.88 7.09-7 17.92-7h96v-55h-56.67Q334-415 327-422q-7-7-7-18t7-18q7-7 18.33-7H402v-56h-96q-10.83 0-17.92-7.12-7.08-7.11-7.08-18 0-10.88 7.08-17.88 7.09-7 17.92-7h101.78q19.22 0 31.72 12.65T452-527v173q0 18.7-12.65 31.35Q426.7-310 408-310Zm145 0q-18.7 0-31.35-12.65Q509-335.3 509-354v-173q0-18.7 12.65-31.35Q534.3-571 553-571h83q18.7 0 31.35 12.65Q680-545.7 680-527v173q0 18.7-12.65 31.35Q654.7-310 636-310h-83Zm6-50h71v-161h-71v161ZM339.5-108Q274-136 225-185t-77-114.5Q120-365 120-440q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38 0 125.36 87.5 212.68Q355-140 480-140t212.5-87.32Q780-314.64 780-440q0-125.36-85-212.68Q610-740 485-740h-22l52 52q9 9 9 21t-8.61 21q-9.39 9-21.39 9t-21-9L368-751q-9-9-9-21t9-21l106-106q8-8 20.5-8t20.85 8q7.65 8 7.65 20.5t-8 20.5l-58 58h23q75 0 140.5 28T735-695q49 49 77 114.5T840-440q0 75-28 140.5T735-185q-49 49-114.5 77T480-80q-75 0-140.5-28Z',
  speed:
    'M418-340q25 25 63 23.5t55-27.5l180-271q7-11-1.5-19.5T695-636L424-456q-26 18-28.5 54.5T418-340ZM192-160q-18 0-34-8.5T134-193q-26-48-40-100T80-399q0-83 31.5-156T197-682.5q54-54.5 126.5-86T478-800q83 0 156.5 31.5t128 86Q817-628 848.5-555T880-399q0 54-13 106.5T827-193q-9 16-25 24.5t-34 8.5H192Z',
  sleep_timer:
    'M484-80q-84 0-157.5-32t-128-86.5Q144-253 112-326.5T80-484q0-132 77.5-238T361-868q17-5 31 5t12 27q-7 88 23.5 169.5T521-522q63 63 145 94t170 24q17-2 26.5 13t4.5 32q-40 125-145.5 202T484-80Z',
  bookmark:
    'm480-240-196 84q-30 13-57-5t-27-50v-574q0-24 18-42t42-18h440q24 0 42 18t18 42v574q0 32-27 50t-57 5l-196-84Z',
  queue: QUEUE_MUSIC_PATH,
  search:
    'M378-329q-108.16 0-183.08-75Q120-479 120-585t75-181q75-75 181.5-75t181 75Q632-691 632-584.85 632-542 618-502q-14 40-42 75l242 240q9 8.56 9 21.78T818-143q-9 9-22.22 9-13.22 0-21.78-9L533-384q-30 26-69.96 40.5Q423.08-329 378-329Zm-1-60q81.25 0 138.13-57.5Q572-504 572-585t-56.87-138.5Q458.25-781 377-781q-82.08 0-139.54 57.5Q180-666 180-585t57.46 138.5Q294.92-389 377-389Z',
  library_books:
    'M373-420h165q12.75 0 21.38-8.68 8.62-8.67 8.62-21.5 0-12.82-8.62-21.32-8.63-8.5-21.38-8.5H373q-12.75 0-21.37 8.68-8.63 8.67-8.63 21.5 0 12.82 8.63 21.32 8.62 8.5 21.37 8.5Zm0-90h335q12.75 0 21.38-8.68 8.62-8.67 8.62-21.5 0-12.82-8.62-21.32-8.63-8.5-21.38-8.5H373q-12.75 0-21.37 8.68-8.63 8.67-8.63 21.5 0 12.82 8.63 21.32 8.62 8.5 21.37 8.5Zm0-90h335q12.75 0 21.38-8.68 8.62-8.67 8.62-21.5 0-12.82-8.62-21.32-8.63-8.5-21.38-8.5H373q-12.75 0-21.37 8.68-8.63 8.67-8.63 21.5 0 12.82 8.63 21.32 8.62 8.5 21.37 8.5ZM260-200q-24 0-42-18t-18-42v-560q0-24 18-42t42-18h560q24 0 42 18t18 42v560q0 24-18 42t-42 18H260ZM140-80q-24 0-42-18t-18-42v-590q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v590h590q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32Q742.75-80 730-80H140Z',
  book: AUTO_STORIES_PATH,
  book_2:
    'M290-80q-54 0-92-38t-38-92v-540q0-54 38-92t92-38h450q25 0 42.5 17.5T800-820v515q0 9-5 16.5T781-277q-19 8-30 26t-11 41q0 23 11 40.5t30 25.5q9 4 14 13t5 21q0 12-8.5 21T770-80H290Zm81.5-268.5Q380-357 380-370v-420q0-13-8.5-21.5T350-820q-13 0-21.5 8.5T320-790v420q0 13 8.5 21.5T350-340q13 0 21.5-8.5ZM290-140h409q-9-15-14-33t-5-37q0-20 5-37.5t15-32.5H290q-29 0-49.5 20.5T220-210q0 29 20.5 49.5T290-140Z',
  podcasts:
    'M450-110v-296q-22-9-36-29t-14-45q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 25-14 45t-36 29v296q0 13-8.5 21.5T480-80q-13 0-21.5-8.5T450-110ZM226-212q-9 9-22.5 9T182-213q-48-54-75-121.5T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 78-27 145.5T778-213q-8 10-21.5 10.5T734-211q-9-9-8-22t10-23q40-45 62-102t22-122q0-142-99-241t-241-99q-142 0-241 99t-99 241q0 65 22 122t62 102q9 10 10 22.5t-8 21.5Zm113-113q-9 9-22 9t-21-10q-26-32-41-70.5T240-480q0-100 70-170t170-70q100 0 170 70t70 170q0 45-15 83.5T664-326q-8 10-20.5 10.5T622-324q-9-9-9-22t8-23q18-23 28.5-51t10.5-60q0-75-52.5-127.5T480-660q-75 0-127.5 52.5T300-480q0 32 10.5 60t28.5 51q8 10 8.5 22.5T339-325Z',
  music_note:
    'M286.5-163.5Q243-207 243-270t43.5-106.5Q330-420 393-420q28 0 50.5 8t39.5 22v-420q0-13 8.5-21.5T513-840h174q13 0 21.5 8.5T717-810v75q0 13-8.5 21.5T687-705H543v435q0 63-43.5 106.5T393-120q-63 0-106.5-43.5Z',
  home: 'M160-180v-390q0-14.25 6.38-27 6.37-12.75 17.62-21l260-195q15.68-12 35.84-12Q500-825 516-813l260 195q11.25 8.25 17.63 21 6.37 12.75 6.37 27v390q0 24.75-17.62 42.37Q764.75-120 740-120H590q-12.75 0-21.37-8.63Q560-137.25 560-150v-220q0-12.75-8.62-21.38Q542.75-400 530-400H430q-12.75 0-21.37 8.62Q400-382.75 400-370v220q0 12.75-8.62 21.37Q382.75-120 370-120H220q-24.75 0-42.37-17.63Q160-155.25 160-180Z',
  settings:
    'M421-80q-14 0-25-9t-13-23l-15-94q-19-7-40-19t-37-25l-86 40q-14 6-28 1.5T155-226L97-330q-8-13-4.5-27t15.5-23l80-59q-2-9-2.5-20.5T185-480q0-9 .5-20.5T188-521l-80-59q-12-9-15.5-23t4.5-27l58-104q8-13 22-17.5t28 1.5l86 40q16-13 37-25t40-18l15-95q2-14 13-23t25-9h118q14 0 25 9t13 23l15 94q19 7 40.5 18.5T669-710l86-40q14-6 27.5-1.5T804-734l59 104q8 13 4.5 27.5T852-580l-80 57q2 10 2.5 21.5t.5 21.5q0 10-.5 21t-2.5 21l80 58q12 8 15.5 22.5T863-330l-58 104q-8 13-22 17.5t-28-1.5l-86-40q-16 13-36.5 25.5T592-206l-15 94q-2 14-13 23t-25 9H421Zm59-270q54 0 92-38t38-92q0-54-38-92t-92-38q-54 0-92 38t-38 92q0 54 38 92t92 38Z',
  download:
    'M469-327q-5-2-10-7L308-485q-9-9.27-8.5-21.64.5-12.36 9.11-21.36 9.39-9 21.89-9t21.5 9l98 99v-341q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v341l99-99q8.8-9 20.9-8.5 12.1.5 21.49 9.5 8.61 9 8.61 21.5t-9 21.5L501-334q-5 5-10.13 7-5.14 2-11 2-5.87 0-10.87-2ZM220-160q-24 0-42-18t-18-42v-113q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v113h520v-113q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v113q0 24-18 42t-42 18H220Z',
  add: 'M450-450H230q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h220v-220q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v220h220q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5H510v220q0 12.75-8.68 21.37-8.67 8.63-21.5 8.63-12.82 0-21.32-8.63-8.5-8.62-8.5-21.37v-220Z',
  close:
    'M480-438 270-228q-9 9-21 9t-21-9q-9-9-9-21t9-21l210-210-210-210q-9-9-9-21t9-21q9-9 21-9t21 9l210 210 210-210q9-9 21-9t21 9q9 9 9 21t-9 21L522-480l210 210q9 9 9 21t-9 21q-9 9-21 9t-21-9L480-438Z',
  chevron_left:
    'm406-481 177 177q9 9 8.5 21t-9.5 21q-9 9-21.5 9t-21.5-9L341-460q-5-5-7-10t-2-11q0-6 2-11t7-10l199-199q9-9 21.5-9t21.5 9q9 9 9 21.5t-9 21.5L406-481Z',
  chevron_right:
    'M530-481 353-658q-9-9-8.5-21t9.5-21q9-9 21.5-9t21.5 9l198 198q5 5 7 10t2 11q0 6-2 11t-7 10L396-261q-9 9-21 8.5t-21-9.5q-9-9-9-21.5t9-21.5l176-176Z',
  more_vert:
    'M479.86-160Q460-160 446-174.14t-14-34Q432-228 446.14-242t34-14Q500-256 514-241.86t14 34Q528-188 513.86-174t-34 14Zm0-272Q460-432 446-446.14t-14-34Q432-500 446.14-514t34-14Q500-528 514-513.86t14 34Q528-460 513.86-446t-34 14Zm0-272Q460-704 446-718.14t-14-34Q432-772 446.14-786t34-14Q500-800 514-785.86t14 34Q528-732 513.86-718t-34 14Z',
  heart: FAVORITE_PATH,
  shuffle:
    'M606-160q-13 0-21.5-8.5T576-190q0-13 8.5-21.5T606-220h90L543-372q-9-9-9-21t9-21q9-9 21.5-9.5T586-415l154 153v-91q0-13 8.5-21.5T770-383q13 0 21.5 8.5T800-353v163q0 13-8.5 21.5T770-160H606Zm-436-10q-9-9-9-21t9-21l528-528h-92q-13 0-21.5-8.5T576-770q0-13 8.5-21.5T606-800h164q13 0 21.5 8.5T800-770v163q0 13-8.5 21.5T770-577q-13 0-21.5-8.5T740-607v-90L212-169q-9 9-21 8.5t-21-9.5Zm-1-579q-9-9-9-21.5t9-21.5q9-9 21-9t21 9l205 205q9 9 9.5 21t-8.5 21q-9 9-21.5 9t-21.5-9L169-749Z',
  repeat:
    'm236-210 65 65q9 9 8.5 21t-8.75 21.12q-9 9.12-21.37 9.5Q267-93 258-102L141-219q-5-5-7-10.13-2-5.14-2-11 0-5.87 2-10.87 2-5 7-10l117-117q9.07-9 21.53-8.5Q292-386 301-377q8.25 9 8.63 21 .37 12-8.63 21l-65 65h464v-130q0-12.75 8.68-21.38 8.67-8.62 21.5-8.62 12.82 0 21.32 8.62 8.5 8.63 8.5 21.38v130q0 24.75-17.62 42.37Q724.75-210 700-210H236Zm488-480H260v130q0 12.75-8.68 21.37-8.67 8.63-21.5 8.63-12.82 0-21.32-8.63-8.5-8.62-8.5-21.37v-130q0-24.75 17.63-42.38Q235.25-750 260-750h464l-65-65q-9-9-8.5-21t8.75-21.12q9-9.12 21.38-9.5Q693-867 702-858l117 117q5 5 7 10.13 2 5.14 2 11 0 5.87-2 10.87-2 5-7 10L702-582q-9.07 9-21.53 8.5Q668-574 659-583q-8.25-9-8.62-21-.38-12 8.62-21l65-65Z',
  cast: 'M881-220q0 24.75-17.62 42.37Q845.75-160 821-160H626q-10.71 0-17.97-8.1-7.27-8.1-8.03-18.9-4-96-41-181t-98.57-151.13q-61.58-66.14-143.5-108.5Q235-670 140-680q-25-3-42-19.9-17-16.89-17-42 0-25.1 17.62-41.6T141-800h680q24.75 0 42.38 17.62Q881-764.75 881-740v520Zm-570.47 60q-11.73 0-20.53-7.33T279-187q-9-69-56.5-117.5T107-362q-11-2-18.5-11.05T81-393.69Q81-406 88.5-415q7.5-9 18.5-8 93 9 158 75.5T340-188q2 11.79-7.5 19.89Q323-160 310.53-160ZM471-160q-12 0-21-8t-10-20q-11-134-103.5-229T111-523q-13-1-21.5-10.05-8.5-9.06-8.5-21.13Q81-567 91.5-575.5T116-583q154.76 12.84 263.38 123.42T500-193q1 14-7.62 23.5-8.63 9.5-21.38 9.5Zm-352.14 0Q102-160 90.5-171.64T79-200.14Q79-217 90.64-228.5t28.5-11.5q16.86 0 28.36 11.64t11.5 28.5q0 16.86-11.64 28.36t-28.5 11.5Z',
  lyrics:
    'M270-410h100q12.75 0 21.38-8.68 8.62-8.67 8.62-21.5 0-12.82-8.62-21.32-8.63-8.5-21.38-8.5H270q-12.75 0-21.37 8.68-8.63 8.67-8.63 21.5 0 12.82 8.63 21.32 8.62 8.5 21.37 8.5Zm489.88-80Q714-490 682-522.12q-32-32.12-32-78T682.06-678q32.06-32 77.86-32 10.08 0 22.58 3 12.5 3 27.5 8v-191q0-12.75 8.63-21.38Q827.25-920 840-920h90q12.75 0 21.38 8.68 8.62 8.67 8.62 21.5 0 12.82-8.62 21.32-8.63 8.5-21.38 8.5h-60v260q0 45.83-32.12 77.92-32.12 32.08-78 32.08ZM270-530h220q12.75 0 21.38-8.68 8.62-8.67 8.62-21.5 0-12.82-8.62-21.32-8.63-8.5-21.38-8.5H270q-12.75 0-21.37 8.68-8.63 8.67-8.63 21.5 0 12.82 8.63 21.32 8.62 8.5 21.37 8.5Zm0-120h220q12.75 0 21.38-8.68 8.62-8.67 8.62-21.5 0-12.82-8.62-21.32-8.63-8.5-21.38-8.5H270q-12.75 0-21.37 8.68-8.63 8.67-8.63 21.5 0 12.82 8.63 21.32 8.62 8.5 21.37 8.5Zm-30 410L131-131q-5 5-10.5 7t-10.83 2Q99-122 89.5-130q-9.5-8-9.5-22v-668q0-24.75 17.63-42.38Q115.25-880 140-880h480q31 0 53.5 21t22.5 52q0 17-8.4 31.41-8.39 14.42-22.6 23.59-39 25-62 65.18-23 40.18-23 86.61 0 48.21 23.5 88.71Q627-471 668-446q25.67 15.79 40.83 41.89Q724-378 724-348q0 45-30 76.5T620-240H240Z',
  check:
    'm378-332 363-363q9-9 21.5-9t21.5 9q9 9 9 21.5t-9 21.5L399-267q-9 9-21 9t-21-9L175-449q-9-9-8.5-21.5T176-492q9-9 21.5-9t21.5 9l159 160Z',
  error:
    'M503.5-289.48q9.5-9.48 9.5-23.5t-9.48-23.52q-9.48-9.5-23.5-9.5t-23.52 9.48q-9.5 9.48-9.5 23.5t9.48 23.52q9.48 9.5 23.5 9.5t23.52-9.48Zm1-152.15q8.5-8.62 8.5-21.37v-193q0-12.75-8.68-21.38-8.67-8.62-21.5-8.62-12.82 0-21.32 8.62-8.5 8.63-8.5 21.38v193q0 12.75 8.68 21.37 8.67 8.63 21.5 8.63 12.82 0 21.32-8.63ZM480.27-80q-82.74 0-155.5-31.5Q252-143 197.5-197.5t-86-127.34Q80-397.68 80-480.5t31.5-155.66Q143-709 197.5-763t127.34-85.5Q397.68-880 480.5-880t155.66 31.5Q709-817 763-763t85.5 127Q880-563 880-480.27q0 82.74-31.5 155.5Q817-252 763-197.68q-54 54.31-127 86Q563-80 480.27-80Z',
  album:
    'M480-316q70 0 120-47.5T650-480q0-71-49.5-120.5T480-650q-69 0-116.5 50T316-480q0 69 47.5 116.5T480-316Zm-28.5-135.5Q440-463 440-480t11.5-28.5Q463-520 480-520t28.5 11.5Q520-497 520-480t-11.5 28.5Q497-440 480-440t-28.5-11.5ZM480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-156t86-127Q252-817 325-848.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 82-31.5 155T763-197.5q-54 54.5-127 86T480-80Z',
  auto_stories: AUTO_STORIES_PATH,
  bigtop_updates:
    'M130-560q0 63 21.5 121T214-333q8 8 8.5 19t-7.5 19q-8 8-18 6t-18-10q-48-54-73.5-121.5T80-560q0-72 25.5-139.5T179-821q8-8 18-9.5t18 6.5q8 8 7.5 18.5T214-787q-41 48-62.5 106T130-560Zm143.5 71.5Q285-454 308-425q7 8 7.5 18.5T308-388q-8 8-18 7.5t-17-8.5q-29-36-45-80t-16-91q0-47 16-91t45-80q7-8 17-9t18 7q8 8 7.5 18.5T308-696q-23 29-34.5 64T262-560q0 37 11.5 71.5ZM450-150v-324q-28-9-44.5-33T389-560q0-38 26.5-64.5T480-651q38 0 64.5 26.5T571-560q0 29-16.5 53T510-474v324q0 13-8.5 21.5T480-120q-13 0-21.5-8.5T450-150Zm236.5-481.5Q675-666 652-695q-7-8-7.5-18.5T652-732q8-8 18-7.5t17 8.5q29 36 45 80t16 91q0 47-16 91t-45 80q-7 8-16.5 8.5T653-388q-8-8-8-18.5t7-18.5q23-29 34.5-63.5T698-560q0-37-11.5-71.5ZM830-560q0-63-21.5-121T746-787q-8-8-8.5-19t7.5-19q8-8 18-6t18 10q48 54 73.5 121.5T880-560q0 72-25.5 139.5T781-299q-8 8-18 9.5t-18-6.5q-8-8-7.5-18.5T746-333q41-48 62.5-106T830-560Z',
  check_circle:
    'm421-389-98-98q-9-9-22-9t-23 10q-9 9-9 22t9 22l122 123q9 9 21 9t21-9l239-239q10-10 10-23t-10-23q-10-9-23.5-8.5T635-603L421-389Zm59 309q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-156t86-127Q252-817 325-848.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 82-31.5 155T763-197.5q-54 54.5-127 86T480-80Z',
  download_done:
    'm380-422 357-357q9-9 21-8.5t21 9.5q9 9 9 21t-9 21L401-358q-9 9-21 9t-21-9L181-536q-9-9-8.5-21t9.5-21q9-9 21-9t21 9l156 156ZM230-160q-13 0-21.5-8.5T200-190q0-13 8.5-21.5T230-220h500q13 0 21.5 8.5T760-190q0 13-8.5 21.5T730-160H230Z',
  explore:
    'm330-311 213-66q14-5 24-15t15-24l66-213q3-9-3.5-15.5T629-648l-213 66q-14 5-24 15t-15 24l-66 213q-3 9 3.5 15.5T330-311Zm150-129q-17 0-28.5-11.5T440-480q0-17 11.5-28.5T480-520q17 0 28.5 11.5T520-480q0 17-11.5 28.5T480-440Zm0 360q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-156t86-127Q252-817 325-848.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 82-31.5 155T763-197.5q-54 54.5-127 86T480-80Z',
  favorite: FAVORITE_PATH,
  history:
    'M477-120q-142 0-243.5-95.5T121-451q-1-12 7.5-21t21.5-9q12 0 20.5 8.5T181-451q11 115 95 193t201 78q127 0 215-89t88-216q0-124-89-209.5T477-780q-68 0-127.5 31T246-667h75q13 0 21.5 8.5T351-637q0 13-8.5 21.5T321-607H172q-13 0-21.5-8.5T142-637v-148q0-13 8.5-21.5T172-815q13 0 21.5 8.5T202-785v76q52-61 123.5-96T477-840q75 0 141 28t115.5 76.5Q783-687 811.5-622T840-482q0 75-28.5 141t-78 115Q684-177 618-148.5T477-120Zm34-374 115 113q9 9 9 21.5t-9 21.5q-9 9-21 9t-21-9L460-460q-5-5-7-10.5t-2-11.5v-171q0-13 8.5-21.5T481-683q13 0 21.5 8.5T511-653v159Z',
  keyboard_arrow_down:
    'M469-358q-5-2-10-7L261-563q-9-9-8.5-21.5T262-606q9-9 21.5-9t21.5 9l175 176 176-176q9-9 21-8.5t21 9.5q9 9 9 21.5t-9 21.5L501-365q-5 5-10 7t-11 2q-6 0-11-2Z',
  play_arrow: PLAY_ARROW_PATH,
  queue_music: QUEUE_MUSIC_PATH,
  rss_feed:
    'M142-142q-22-22-22-53t22-53q22-22 53-22t53 22q22 22 22 53t-22 53q-22 22-53 22t-53-22Zm613 22q-20 0-32.5-14T708-168q-9-109-54-203T537-537q-72-72-166-117t-203-54q-20-2-34-14.5T120-755q0-20 15-32.5t35-10.5q127 9 236.5 60.5T601-601q85 85 136.5 194.5T798-170q2 20-10.5 35T755-120Zm-258 0q-19 0-32.5-13.5T449-167q-8-57-32-106t-62-87q-38-38-85.5-63.5T166-457q-19-3-32.5-16T120-505q0-19 13.5-32t31.5-11q75 8 139.5 40.5T419-424q50 51 81.5 117.5T540-165q2 19-11 32t-32 13Z',
  schedule:
    'M513-492v-171q0-13-8.5-21.5T483-693q-13 0-21.5 8.5T453-663v183q0 6 2 11t6 10l144 149q9 10 22.5 9.5T650-310q9-9 9-22t-9-22L513-492ZM480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-82 31.5-155t86-127.5Q252-817 325-848.5T480-880q82 0 155 31.5t127.5 86Q817-708 848.5-635T880-480q0 82-31.5 155t-86 127.5Q708-143 635-111.5T480-80Z',
  trending_up:
    'M102-252q-9-9-9-21.5t9-21.5l228-227q16.93-17 41.97-17Q397-539 414-522l125 125 241-241h-97q-12.75 0-21.37-8.68-8.63-8.67-8.63-21.5 0-12.82 8.63-21.32 8.62-8.5 21.37-8.5h167q12.75 0 21.38 8.62Q880-680.75 880-668v167q0 12-8.27 21t-20.5 9Q839-471 830-480t-9-21v-93L580-354q-16.93 17-41.97 17Q513-337 496-354L371-478 145-252q-9 9-21.5 9t-21.5-9Z',
};

/**
 * FILL-0 (outline) counterpart to `PATHS` for `FILLABLE_ICON_NAMES`, sourced from the same
 * `@material-symbols/svg-400/rounded/` directory's bare `<name>.svg` — no `-fill` suffix,
 * same shape family as the filled forms above, differing only in the FILL axis. `podcasts`
 * and `search` are byte-identical to their filled path (verified by diff): those glyphs
 * have no enclosed region for the FILL axis to change, so rendering `filled={false}` on
 * them is a legitimate no-op, not a wiring bug.
 */
const OUTLINE_PATHS: Record<FillableIconName, string> = {
  explore:
    'm330-311 213-66q14-5 24-15t15-24l66-213q3-8.64-3.5-15.32T629-648l-213 66q-14 5-24 15t-15 24l-66 213q-3 8.64 3.5 15.32T330-311Zm149.76-129q-16.76 0-28.26-11.74-11.5-11.73-11.5-28.5 0-16.76 11.74-28.26 11.73-11.5 28.5-11.5 16.76 0 28.26 11.74 11.5 11.73 11.5 28.5 0 16.76-11.74 28.26-11.73 11.5-28.5 11.5Zm.51 360q-82.74 0-155.5-31.5Q252-143 197.5-197.5t-86-127.34Q80-397.68 80-480.5t31.5-155.66Q143-709 197.5-763t127.34-85.5Q397.68-880 480.5-880t155.66 31.5Q709-817 763-763t85.5 127Q880-563 880-480.27q0 82.74-31.5 155.5Q817-252 763-197.68q-54 54.31-127 86Q563-80 480.27-80Zm.22-60Q622-140 721-239.49q99-99.48 99-241Q820-622 721-721t-240.51-99q-141.52 0-241 99Q140-622 140-480.49q0 141.52 99.49 241 99.48 99.49 241 99.49ZM480-480Z',
  album:
    'M480-316q70 0 120-47.5T650-480q0-71-49.5-120.5T480-650q-69 0-116.5 50T316-480q0 69 47.5 116.5T480-316Zm-28.5-135.5Q440-463 440-480t11.5-28.5Q463-520 480-520t28.5 11.5Q520-497 520-480t-11.5 28.5Q497-440 480-440t-28.5-11.5ZM480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-156t86-127Q252-817 325-848.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 82-31.5 155T763-197.5q-54 54.5-127 86T480-80Zm0-60q142 0 241-99.5T820-480q0-142-99-241t-241-99q-141 0-240.5 99T140-480q0 141 99.5 240.5T480-140Zm0-340Z',
  book_2:
    'M220-320q15-10 32.5-15t37.5-5h30v-480h-30q-29.17 0-49.58 20.42Q220-779.17 220-750v430Zm160-20h360v-480H380v480Zm-160 20v-500 500Zm70 240q-53.86 0-91.93-38.07Q160-156.14 160-210v-540q0-53.86 38.07-91.93Q236.14-880 290-880h450q24.75 0 42.38 17.62Q800-844.75 800-820v515q0 9.14-5 16.57T781-277q-19 8-30 25.77-11 17.76-11 41 0 23.23 10.93 40.82Q761.87-151.82 781-144q9 4 14 13t5 21q0 12.44-8.62 21.22Q782.75-80 770-80H290Zm-.46-60H699q-9-15-14-33t-5-37q0-20 5-37.5t15-32.5H289.61q-28.61 0-49.11 20.42Q220-239.17 220-210q0 29 20.5 49.5t49.04 20.5Z',
  podcasts:
    'M450-110v-296q-22-9-36-29t-14-45q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 25-14 45t-36 29v296q0 13-8.5 21.5T480-80q-13 0-21.5-8.5T450-110ZM226-212q-9 9-22.5 9T182-213q-48-54-75-121.5T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 78-27 145.5T778-213q-8 10-21.5 10.5T734-211q-9-9-8-22t10-23q40-45 62-102t22-122q0-142-99-241t-241-99q-142 0-241 99t-99 241q0 65 22 122t62 102q9 10 10 22.5t-8 21.5Zm113-113q-9 9-22 9t-21-10q-26-32-41-70.5T240-480q0-100 70-170t170-70q100 0 170 70t70 170q0 45-15 83.5T664-326q-8 10-20.5 10.5T622-324q-9-9-9-22t8-23q18-23 28.5-51t10.5-60q0-75-52.5-127.5T480-660q-75 0-127.5 52.5T300-480q0 32 10.5 60t28.5 51q8 10 8.5 22.5T339-325Z',
  search:
    'M378-329q-108.16 0-183.08-75Q120-479 120-585t75-181q75-75 181.5-75t181 75Q632-691 632-584.85 632-542 618-502q-14 40-42 75l242 240q9 8.56 9 21.78T818-143q-9 9-22.22 9-13.22 0-21.78-9L533-384q-30 26-69.96 40.5Q423.08-329 378-329Zm-1-60q81.25 0 138.13-57.5Q572-504 572-585t-56.87-138.5Q458.25-781 377-781q-82.08 0-139.54 57.5Q180-666 180-585t57.46 138.5Q294.92-389 377-389Z',
};

interface IconCommonProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  /** Icon side length, CSS px. Defaults to 24 (the design's base icon size). */
  size?: number;
  /**
   * Accessible name. Omit when the icon is purely decorative (e.g. sitting beside a
   * visible label) — it is then hidden from the accessibility tree entirely.
   */
  title?: string;
}

/**
 * `filled` is only offered on `FillableIconName` — a discriminated union rather than a
 * plain optional boolean, so `<Icon name="home" filled={false} />` is a **compile** error
 * instead of silently rendering `PATHS.home` (there is no outline data for `home` to fall
 * back to). Omitting `filled` keeps today's appearance exactly as-is: every glyph, fillable
 * or not, renders filled by default, so no existing call site changes rendering.
 *
 * The second arm deliberately types `name` as the *full* `IconName`, not
 * `Exclude<IconName, FillableIconName>` — several existing call sites elsewhere in the repo
 * (`apps/web`'s `CoverImage.tsx`, `Shell.tsx`) hold `name` as an already-widened `IconName`
 * (e.g. from a lookup keyed by media kind), not a literal, and never pass `filled`. Excluding
 * `FillableIconName` from that arm would make such a call site fail to match *either* arm —
 * TypeScript can't prove a widened value excludes a subset of its own type — which is exactly
 * the "breaks an existing call site" outcome this component must not cause. Because the two
 * arms only differ once `filled` is actually supplied, permissiveness here costs nothing: a
 * caller that explicitly passes `filled` on a name TypeScript can't prove is fillable (either
 * because it names a non-fillable glyph, or because `name` is itself widened) still fails to
 * match either arm and is still a compile error — narrow first, e.g. with
 * `isFillableIconName`, as `packages/ui/gallery/App.tsx`'s outline row does.
 */
export type IconProps =
  | (IconCommonProps & { name: FillableIconName; filled?: boolean })
  | (IconCommonProps & { name: IconName; filled?: undefined });

export const Icon = memo(
  forwardRef<SVGSVGElement, IconProps>(function Icon(props, ref) {
    const { name, size = 24, title, className, filled, ...rest } = props;
    const decorative = title === undefined;
    // `filled` is only ever non-undefined when `name` is a `FillableIconName` (the prop
    // type above guarantees it), so the cast is safe; the `?? PATHS[name]` fallback is
    // defensive only, for a caller that reaches this via `as any`.
    const d =
      filled === false ? (OUTLINE_PATHS[name as FillableIconName] ?? PATHS[name]) : PATHS[name];
    return (
      <svg
        ref={ref}
        className={className ? `m3-icon ${className}` : 'm3-icon'}
        width={size}
        height={size}
        viewBox="0 -960 960 960"
        fill="currentColor"
        role={decorative ? undefined : 'img'}
        aria-hidden={decorative ? true : undefined}
        {...rest}
      >
        {title ? <title>{title}</title> : null}
        <path d={d} />
      </svg>
    );
  }),
);
