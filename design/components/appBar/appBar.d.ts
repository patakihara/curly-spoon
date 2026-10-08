// Generated from appBar.json by design/build.js — edit the .json, not this file.

/** The surface of an app-bar page: a 56px bar with back, title and actions, over full-screen content. Light surface: dark content.

## Page form (14.2)
Two parts, like a backdrop (own visuals, tokens shared with it): a top row (topHeight, back-layer colours: fill / ink) and a sheet below it (sheetFill, sheetRadius on its top corners, sheetShadow) holding the expanded slot and, at its bottom edge, the `bottom` slot row (bottomRowHeight / PadX / Gap; the field spans what the buttons leave). The whole bar shrinks from expandedHeight to height on scroll (progress), so the sheet goes from expandedHeight − topHeight to height − topHeight (144). The album info (expanded slot) stays in the sheet: as the sheet shrinks its artwork shrinks from detailHeader artSize down to infoArtMin (sheetPadTop above, infoPadBottom below); it never fades. */
export interface AppBarProps {
}
