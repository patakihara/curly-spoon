A clickable action button in four variants and two platform radii, for desktop or mobile surfaces.

```jsx
<Button variant="primary" size="md" onClick={play}>Play</Button>
<Button variant="secondary" platform="mobile">Shuffle</Button>
<Button variant="ghost" icon={<span style={{fontFamily:'Material Symbols Rounded',fontSize:'var(--icon-sm)'}}>settings</span>}>Settings</Button>
<Button variant="danger" disabled>Delete</Button>
```

Variants: `primary` (filled accent), `secondary` (outlined), `ghost` (text-only), `danger` (destructive). Sizes: `sm`/`md`/`lg`. `platform="mobile"` swaps the sharp desktop corner radius for a fully-rounded pill.
