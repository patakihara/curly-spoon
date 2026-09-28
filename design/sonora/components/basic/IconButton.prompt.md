A circular icon-only button used for player transport controls, toolbar actions, and sidebar toggles.

```jsx
<IconButton label="Play"><span style={{fontFamily:'Material Symbols Rounded',fontSize:'var(--icon-sm)'}}>play_arrow</span></IconButton>
<IconButton label="Shuffle" active><span style={{fontFamily:'Material Symbols Rounded',fontSize:'var(--icon-sm)'}}>shuffle</span></IconButton>
<IconButton label="More" muted><span style={{fontFamily:'Material Symbols Rounded',fontSize:'var(--icon-sm)'}}>more_vert</span></IconButton>
```

Name the glyph with `icon` (`<IconButton label="Close" icon="close" />`), or pass a **Material Symbols Rounded** glyph span as children (the system uses Material Symbols on every surface, desktop and mobile — see Iconography guidelines). Never hand-draw an SVG. `active` tints the icon accent color; `muted` dims it.
