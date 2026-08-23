A section heading above a carousel or grid, with an optional trailing icon action. Use it for every "Not Recently Played" / "Most played" / "Genres" row so headings stay consistent between platforms.

```jsx
<SectionHeader title="Not Recently Played" action="arrow_forward" onAction={showAll} />
<SectionHeader title="Most played" platform="desktop" />
```

`platform="desktop"` switches to the heavy display font at h3 size; mobile uses body font at text-xl.
