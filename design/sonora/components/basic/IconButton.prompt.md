Sonora's one icon-only button: transport controls, toolbar and app-bar actions, closes, the list/grid switch, a shelf's arrows and the corner menu over a cover. Never build a round glyph button by hand; pick a variant.

```jsx
<IconButton label="Play" icon="play_arrow" />
<IconButton label="Shuffle" active icon="shuffle" />
<IconButton label="More" muted><Icon name="more_vert" weight="strong" /></IconButton>
<IconButton label="Add to a list" variant="outline" muted icon="playlist_add" />
<IconButton label="Switch to list view" variant="tonal" icon="view_list" />
<IconButton label="Scroll forward" variant="raised" size="md" icon="chevron_right" />
<IconButton label="More options" variant="scrim" size="xs" icon="more_vert" />
```

- `variant`: `plain` (default, no container), `outline` (a hairline ring: a quiet verb beside buttons), `tonal` (a squat pill on the card fill for a control on the page; changing `icon` turns the glyph over), `raised` (card fill and shadow, floating over content), `scrim` (over artwork, in on-scrim ink).
- `size` is a step of the control ramp, `xs` 32px to `3xl` 72px; default `sm` (36px), `xs` on tonal. Never a number.
- Name the glyph with `icon`, or pass an `Icon` as children for a weight or fill of its own (Material Symbols Rounded, through `Icon`, on every surface — see Iconography guidelines). Never hand-draw an SVG.
- `label` is always the accessible name. `active` tints the glyph in `tone` (accent, play or library; accent ink and a filled glyph on tonal); `muted` dims it; `tone="inherit"` takes the ink of what it sits on.
- `style` is for placement only (position, offsets, opacity); `className` for a reveal hook.
