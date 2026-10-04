A circular icon-only button used for player transport controls, toolbar actions, and sidebar toggles.

```jsx
<IconButton label="Play" icon="play_arrow" />
<IconButton label="Shuffle" active icon="shuffle" />
<IconButton label="More" muted><Icon name="more_vert" /></IconButton>
```

Name the glyph with `icon` (`<IconButton label="Close" icon="close" />`), or pass an `Icon` as children (the system uses Material Symbols Rounded, through `Icon`, on every surface, desktop and mobile — see Iconography guidelines). Never hand-draw an SVG. `active` tints the icon accent color; `muted` dims it.
