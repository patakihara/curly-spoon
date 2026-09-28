Mobile bottom tab bar. The active tab gets a rounded pill background behind its icon and its label appears. `icon` is a **Material Symbols Rounded glyph name** (the component renders it in that font); never pass an SVG. Colors follow whichever theme scope it renders inside (`data-theme="dark"`), so there is no theme prop.

```jsx
<BottomNav
  active="home"
  onChange={setTab}
  items={[{key:'home',label:'Browse',icon:'explore'},{key:'songs',label:'Music',icon:'album'}]}
/>
```
