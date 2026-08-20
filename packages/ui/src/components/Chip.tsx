/**
 * Chip — thin wrapper around Mantine's `Chip` (itself a styled checkbox pill) plus
 * `CloseButton` for the `input` variant's remove control.
 *
 * Only `filter` chips are genuinely two-state here — `assist`/`input` chips are
 * single-shot action chips, not toggles. Mantine's `Chip` is fundamentally a
 * checkbox, so for `assist`/`input` it's pinned fully controlled at
 * `checked={false}` (an inert `onChange` keeps React from warning about a
 * controlled input with no change handler) and the wrapper's own `onClick` does
 * the real work — same as the original hand-rolled button's "always fire
 * `onClick`, only flip selection for filter chips" behaviour.
 *
 * Note this changes the chip's interactive DOM element from a `<button>` to an
 * `<input type="checkbox">` (Mantine's own choice, not overridable) — anything
 * that queried a `<button>` inside a chip (e.g. `aria-pressed` toggling) now needs
 * to target the input instead.
 *
 * `icon` is rendered as a plain leading `<span>` inside the label, not via
 * Mantine's own `icon` prop: that prop's slot only paints while `checked`, which
 * is permanently `false` for `assist`/`input` chips — passing a custom icon
 * through it would silently never render (confirmed against the gallery's
 * `chip-assist` case). The one exception is a *selected* `filter` chip, which
 * still uses Mantine's own default check glyph (by passing no `icon` at all),
 * matching the original "selected filter chips always show a checkmark,
 * ignoring any custom icon" behaviour.
 *
 * **Wave 16c-1 (docs/ROADMAP.md §16) colours.** Before this wave `Chip.tsx` had zero
 * `--m3-*` references — its colour rode entirely on Mantine's own `theme.colors.auralis`
 * ramp, resolved from `variant`/`checked` with no explicit override (unlike Button.tsx/
 * IconButton.tsx, which already had an override to migrate). To actually put Chip onto
 * Sonora rather than leave it untouched, `chipStyleVars` below sets Mantine's own `Chip`
 * CSS custom properties (`--chip-bg`/`--chip-color`/`--chip-bd`/`--chip-radius`, read from
 * `Chip.varsResolver` in `@mantine/core`) via the `style` prop, which — same technique as
 * Button.tsx's `VARIANT_STYLE_OVERRIDE` — wins over Mantine's own resolved values at equal
 * specificity because it lands later in the merged inline `style`.
 *
 * **Reconciled against Sonora's own vendored `Chip.jsx`** (`docs/design/sonora/
 * primitives/`, landed after this wave's spec was written). This corrected a real bug,
 * not just a token-name preference: the first draft made the *unchecked* chip's background
 * `transparent`, reasoning from the readme's general "borders are nearly invisible"
 * guidance — but `--surface-border` at 8% opacity as the chip's *only* visual boundary,
 * with no fill at all, reads as text rather than a control. **The real `Chip.jsx` gives the
 * unchecked state a `var(--surface-card)` background** — a real fill, not a near-invisible
 * outline; the readme's guidance is about chrome borders generally, not this control's own
 * boundary. Checked state also moves from `--accent-ink` to plain `var(--accent)` —
 * checked, like `IconButton`'s `active`, and this confirms `--accent-ink` never appears in
 * any of the five real primitives (see IconButton.tsx's comment). Radius moves from
 * `--radius-pill` (a guess with no source) to `--radius-md` (24px), the real file's exact
 * value.
 *
 * `--accent-contrast` (#fff, static) on `--accent` (violet #8b5cf6) measures ~4.23:1 —
 * just under WCAG AA's 4.5:1 text threshold, though clear of the 3:1 large-text/
 * UI-component one. This is no longer an inference: `Chip.jsx` line 18 literally specifies
 * `color: color ? '#fff' : selected ? 'var(--accent-contrast)' : 'var(--surface-fg)'` —
 * the design's own pairing, source-confirmed, not this wave's choice. `--accent-contrast`
 * is a single fixed on-accent colour for a 17-hue customizable accent; several lighter
 * presets (yellow, lime, amber, cyan) will fail more severely. See the wave report.
 */
import { forwardRef, type CSSProperties, type ReactNode } from 'react';
import clsx from 'clsx';
import { Chip as MantineChip, CloseButton } from '@mantine/core';
import './Chip.css';

/**
 * Mantine `Chip`'s own custom-property names (`Chip.varsResolver`), set here on the
 * component's `style` prop. **This alone turned out not to be enough** — see
 * `chipLabelStyle` below for why — but it's kept because `<MantineChip>`'s `style` prop
 * lands on the component's *root* wrapper (`Chip.mjs`'s `getStyles('root')`), and a CSS
 * custom property set there still cascades down to the label via normal inheritance, so
 * it's harmless insurance for anything in Mantine's own CSS that does read `--chip-bg`
 * (the `filled`/`light`-variant class, once `[data-checked]`).
 */
function chipStyleVars(checked: boolean): CSSProperties {
  return {
    '--chip-bg': checked ? 'var(--accent)' : 'var(--surface-card, rgb(20, 20, 20))',
    '--chip-color': checked ? 'var(--accent-contrast, #fff)' : 'var(--surface-fg, currentColor)',
    '--chip-bd': checked ? 'var(--accent)' : 'var(--surface-border, rgb(255 255 255 / 8%))',
    '--chip-radius': 'var(--radius-md, 24px)',
  } as CSSProperties;
}

/**
 * The real fix, found empirically while verifying this wave: Mantine's `Chip` paints its
 * visible surface on a separate **`label`** part (`Chip.mjs`: `...getStyles('label', …)`
 * on its own `<Box component="label">`), not on the root the `style` prop reaches. Its
 * compiled `outline`-variant CSS (the unchecked state, since `Chip.tsx` passes
 * `variant={showsCheckGlyph ? 'filled' : 'outline'}`) hardcodes
 * `background-color: var(--mantine-color-dark-6)` / `var(--mantine-color-gray-0)` for
 * that label's *unchecked* background and never reads `--chip-bg` at all in that state
 * (only the `filled`/`light`-variant CSS does, and only once `[data-checked]`) — so
 * `chipStyleVars` alone was silently a no-op for the unchecked case
 * (`e2e/ui/chip.spec.ts` caught it: measured `rgb(46, 46, 46)`, Mantine's own dark-mode
 * default, instead of the intended `--surface-card`). Mantine's `styles={{ label: {…} }}`
 * prop is the styles-API mechanism for targeting that part directly, and inline style
 * wins over any of Mantine's `:where()`-wrapped class rules (zero specificity by design,
 * so consumers can always override) regardless of which variant's class applies.
 */
function chipLabelStyle(checked: boolean): CSSProperties {
  return {
    backgroundColor: checked ? 'var(--accent)' : 'var(--surface-card, rgb(20, 20, 20))',
    color: checked ? 'var(--accent-contrast, #fff)' : 'var(--surface-fg, currentColor)',
    borderColor: checked ? 'var(--accent)' : 'var(--surface-border, rgb(255 255 255 / 8%))',
    borderRadius: 'var(--radius-md, 24px)',
  };
}

/**
 * Setting `background-color` as an inline style (above) beats Mantine's own compiled hover
 * rule at ordinary CSS specificity, so the label had no hover feedback at all until this class
 * was added — see `Chip.css`'s header comment for why `filter` rather than another
 * `background-color` override is the fix (it composes with the inline fill instead of
 * fighting it for specificity).
 */
const CHIP_LABEL_CLASS = 'm3-chip-label';

export type ChipVariant = 'assist' | 'filter' | 'input';

export interface ChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ChipVariant;
  /** Only meaningful for `filter` chips. */
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  icon?: ReactNode;
  /** Only meaningful for `input` chips — renders a trailing remove control. */
  onRemove?: () => void;
  /** Applied to the wrapper (the chip's public root), not the inner control. */
  'data-testid'?: string;
  children: ReactNode;
  /**
   * Opt-in single-selection grouping for `variant="filter"` chips that are mutually
   * exclusive — e.g. a theme-mode row (system/light/dark) or a sort-order row, where
   * exactly one of the row's chips is ever `selected`. **Not** for independent
   * multi-select filter rows (e.g. a content-type filter that can toggle back to "all"
   * on a second click of the same chip) — a native `<input type="radio">` does not fire
   * a change event when the already-checked one is clicked again, so that toggle-off
   * convenience would silently stop working.
   *
   * When set, every chip sharing the same `radioGroup` string renders
   * `<input type="radio" name={radioGroup}>` instead of Mantine's default
   * `<input type="checkbox">` — so assistive tech announces "radio button, N of M" and
   * excludes the group's other options by construction, and arrow-key navigation moves
   * between them. Each chip in the group still needs its own distinct `value` (passed
   * straight through via `...rest`, since `ButtonHTMLAttributes` already declares it) so
   * the browser can tell the options apart.
   *
   * Exclusivity itself is unaffected either way — every filter chip is already fully
   * controlled via its own `selected` prop, so the caller's own state (one `mode ===
   * candidate` comparison per chip) is what actually drives which one is checked. This
   * prop only changes the underlying control's `type`/`name`, which is what assistive
   * tech and the keyboard actually read. Omitting it (the default) leaves every existing
   * checkbox-shaped filter chip byte-for-byte unchanged — `filterProps` in Mantine's own
   * `useProps` strips any prop set to `undefined`, so `type`/`name` fall through to
   * Mantine's `defaultProps` (`type: "checkbox"`) exactly as before.
   */
  radioGroup?: string;
}

export const Chip = forwardRef<HTMLInputElement, ChipProps>(function Chip(
  {
    variant = 'assist',
    selected,
    onSelectedChange,
    icon,
    onRemove,
    onClick,
    className,
    children,
    'data-testid': dataTestId,
    id,
    type: _type,
    onChange: _onChange,
    style,
    radioGroup,
    ...rest
  },
  ref,
) {
  const isFilter = variant === 'filter';
  const showsCheckGlyph = isFilter && Boolean(selected);

  return (
    // `m3-chip-wrapper` styles nothing: the rule that gave it
    // `display: inline-flex; align-items: center; gap: 4px` lived in the pre-Mantine
    // `Chip.css`, which nothing ever imported and which is now deleted. It is kept as a
    // caller-facing hook (`className` merges into it) and is currently harmless because
    // the wrapper only ever holds one child — no caller uses `variant="input"` with
    // `onRemove`. The first one that does will need that layout restored here.
    <span className={clsx('m3-chip-wrapper', className)} data-testid={dataTestId} id={id}>
      <MantineChip
        ref={ref}
        variant={showsCheckGlyph ? 'filled' : 'outline'}
        checked={isFilter ? Boolean(selected) : false}
        // `radioGroup` deliberately bypasses Mantine's own `Chip.Group`/context
        // machinery — see the `radioGroup` doc comment on `ChipProps` above. Passing
        // `undefined` when it's unset is load-bearing, not just tidy: Mantine's
        // `filterProps` (`useProps`) drops any prop whose value is `undefined` before
        // merging over `defaultProps`, so `type` falls through to `defaultProps.type =
        // "checkbox"` exactly as it did before this prop existed.
        type={radioGroup ? 'radio' : undefined}
        name={radioGroup}
        style={{ ...chipStyleVars(showsCheckGlyph), ...style }}
        styles={{ label: chipLabelStyle(showsCheckGlyph) }}
        classNames={{ label: CHIP_LABEL_CLASS }}
        onChange={(checked) => {
          if (isFilter) onSelectedChange?.(checked);
        }}
        onClick={(event) => {
          onClick?.(event as unknown as React.MouseEvent<HTMLButtonElement>);
        }}
        // `rest` is typed against `ButtonHTMLAttributes<HTMLButtonElement>` (the
        // public `ChipProps` shape), but every event handler in it now feeds an
        // `<input>`, not a `<button>` — genuinely incompatible generics (e.g.
        // `onFocus: (e: FocusEvent<HTMLButtonElement>) => void` isn't assignable to
        // a slot expecting `FocusEvent<HTMLInputElement>`), not a real runtime
        // hazard: both interfaces expose the same DOM properties these handlers
        // actually read. No current caller passes anything here beyond what's
        // already destructured above.
        {...(rest as Record<string, unknown>)}
      >
        {!showsCheckGlyph && icon ? <span className="m3-chip__icon-inline">{icon}</span> : null}
        {children}
      </MantineChip>
      {variant === 'input' && onRemove ? (
        <CloseButton size="xs" aria-label="Remove" onClick={onRemove} />
      ) : null}
    </span>
  );
});
