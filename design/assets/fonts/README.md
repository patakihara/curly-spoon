# Icon font

`material-symbols-rounded.woff2` is Material Symbols Rounded, fetched once by hand from Google Fonts with the query
the mockup used before: `css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200`
(version v378, 5,397,756 bytes). It is a variable font: optical size 20 to 48, weight 100 to 700, FILL 0 to 1 and
grade -50 to 200 (Symbol's props). `fonts.css` declares it; every DC that draws icons links `fonts.css`.

The whole font ships: icon names reach the page as data (config, composition tokens), so no subset could know them all.

Licence: Apache License 2.0, Google (`LICENSE-MaterialSymbols.txt`). The repository's own licence does not cover it.
