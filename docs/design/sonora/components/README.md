# Auralis component cards — how to read these, and one trap

Nine cards from the design project (`cdb06ed1-f8ac-45bb-bf88-1a8a43567b15`). Each is one
component of the redesigned app. The `renderVals()` body is the real content: it returns the
exact inline style strings the design renders, so every size, radius, colour and
desktop/mobile split a rebuilder needs is a literal in there.

These are **reformatted, not byte-identical** to upstream: the `<!DOCTYPE>`/`<head>`/`<helmet>`
boilerplate is dropped, `x-import component-from-global-scope="SonoraDesignSystem_6c1435.X"` is
written `<Sonora.X>`, and each card's HTML-escaped `data-props` JSON is restated as a readable
`// props:` comment. The `renderVals()` bodies are untouched. `Auralis-Redesign.dc.html` one
level up **is** byte-identical, and is the file to diff against a fresh pull.

## The trap: every prop has two defaults, and they are not always the same

The `// props:` comment carries the **design tool's preview default** — what the card renders
in the gallery. The code below carries the **component's own fallback** — what an omitted prop
actually produces. Usually they agree. Where they don't, **the code is the contract**:

| Component    | Prop           | Preview default | Code fallback                       |
| ------------ | -------------- | --------------- | ----------------------------------- |
| `ResultRow`  | `tone`         | `progress`      | **`library`**                       |
| `ResultRow`  | `actionGlyph`  | `downloading`   | **`play_arrow`**                    |
| `MediaCard`  | `width`        | `176px`         | **`152px` mobile / `176px` desktop** |
| `ArtistCard` | `width`        | `160px`         | **`132px` mobile / `160px` desktop** |

This is worth a table rather than a footnote because it is exactly the defect shape this
project has already paid for twice — a comment describing an intention reads exactly like a
comment describing the code, and both an implementing agent and its reviewer read past it.
