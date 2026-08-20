import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test.describe('Chip', () => {
  test('renders assist, filter and input variants', async ({ page }) => {
    await expect(page.getByTestId('chip-assist')).toContainText('Download');
    await expect(page.getByTestId('chip-filter')).toContainText('Audiobooks');
    await expect(page.getByTestId('chip-input')).toContainText('Fiction');
  });

  test('a filter chip is a selectable toggle', async ({ page }) => {
    // Mantine's Chip is a styled checkbox (`<input type="checkbox">`), not a `<button>` —
    // there is no `aria-pressed`; the toggle state is the input's checked state. The
    // input itself is visually zero-size/opacity:0 (Mantine hides it and paints the
    // sibling `<label>` instead), so Playwright's actionability check refuses to click
    // it directly — click the label, same as a real pointer would, and assert state on
    // the input.
    const chip = page.getByTestId('chip-filter').locator('input').first();
    const label = page.getByTestId('chip-filter').locator('label').first();
    await expect(chip).toBeChecked();
    await label.click();
    await expect(chip).not.toBeChecked();
    await label.click();
  });

  test('an input chip has a working remove control', async ({ page }) => {
    const remove = page.getByTestId('chip-input').getByRole('button', { name: 'Remove' });
    await expect(remove).toBeVisible();
    const box = await remove.boundingBox();
    // The visual glyph is small, but the hit area (m3-hit-slop) must still be reachable.
    expect(box).not.toBeNull();
  });

  test('an assist chip is keyboard operable', async ({ page }) => {
    // Same Mantine-checkbox DOM as above — the focusable control is the `<input>`.
    const chip = page.getByTestId('chip-assist').locator('input').first();
    await chip.focus();
    await expect(chip).toBeFocused();
  });

  test('a checked filter chip resolves the Sonora accent as its background in both themes', async ({
    page,
  }) => {
    // Wave 16c-1 (docs/ROADMAP.md §16): proves the --chip-bg/--chip-color overrides
    // (Chip.tsx's chipStyleVars) resolved to *used* values, not just that a var()
    // reference was written. `chip-filter` starts selected (App.tsx pins
    // `useState(true)`), so no interaction is needed to see the checked state.
    // Reconciled against docs/design/sonora/primitives/Chip.jsx: selected uses plain
    // `var(--accent)`, not `--accent-ink` — same correction as IconButton's `active`, and
    // since `--accent` is static (not theme-scoped), the correct invariant is now
    // equality across themes, not the difference the first draft (wrongly) asserted.
    const label = page.getByTestId('chip-filter').locator('label').first();

    await expect(page.getByTestId('mode-dark')).toBeVisible();
    const darkBg = await label.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(darkBg).toBe('rgb(139, 92, 246)'); // --accent

    await page.getByTestId('mode-light').click();
    await page.waitForTimeout(700);
    const lightBg = await label.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(lightBg).toBe('rgb(139, 92, 246)');

    // restore for other tests sharing this worker's page context
    await page.getByTestId('mode-dark').click();
  });

  test('a filter chip stays checkbox-shaped by default — the radioGroup prop is opt-in', async ({
    page,
  }) => {
    // Wave 16h-chip-singleselect: the ungrouped `chip-filter` (no `radioGroup` prop)
    // must be byte-for-byte unaffected by adding the prop — every existing multi-select
    // filter row in the app (For You's content-type filter, Search's two rows) depends
    // on this staying `type="checkbox"`. DISCRIMINATES: fails if `radioGroup`'s default
    // ever leaked a `type="radio"` onto a chip that never opted in.
    const chip = page.getByTestId('chip-filter').locator('input').first();
    await expect(chip).toHaveAttribute('type', 'checkbox');
    await expect(chip).not.toHaveAttribute('name', /.+/);
  });

  test('radioGroup renders native radio inputs, exclusive in the accessibility tree', async ({
    page,
  }) => {
    // Wave 16h-chip-singleselect. DISCRIMINATES on both fronts:
    // - the `type="radio"` assertion fails against the pre-wave `Chip` (which had no
    //   `radioGroup` prop at all, so every filter chip was always `type="checkbox"`);
    // - the exclusivity assertions fail if `radioGroup` merely painted the type without
    //   the shared `name` actually grouping the inputs (e.g. a typo'd or per-chip-unique
    //   `name`), since the browser only tracks radios sharing one `name`+form as one
    //   group. Clicking a native `<input type="radio">` unchecks its group siblings
    //   without their own change event firing — this is verified as an observed
    //   accessibility-tree state, not inferred from the click handler running.
    const group = page.getByTestId('chip-radio-group');
    const newest = group.getByTestId('chip-radio-newest').locator('input');
    const oldest = group.getByTestId('chip-radio-oldest').locator('input');
    const title = group.getByTestId('chip-radio-title').locator('input');

    await expect(newest).toHaveAttribute('type', 'radio');
    await expect(oldest).toHaveAttribute('type', 'radio');
    await expect(title).toHaveAttribute('type', 'radio');
    const groupName = await newest.getAttribute('name');
    expect(groupName).toBeTruthy();
    await expect(oldest).toHaveAttribute('name', groupName!);
    await expect(title).toHaveAttribute('name', groupName!);

    // Default selection.
    await expect(newest).toBeChecked();
    await expect(oldest).not.toBeChecked();
    await expect(title).not.toBeChecked();

    // Selecting a different option deselects the previous one — exclusivity, not just
    // a repainted label.
    await group.getByTestId('chip-radio-title').locator('label').click();
    await expect(title).toBeChecked();
    await expect(newest).not.toBeChecked();
    await expect(oldest).not.toBeChecked();

    // restore for other tests sharing this worker's page context
    await group.getByTestId('chip-radio-newest').locator('label').click();
  });

  test('an unchecked chip has a real surface-card fill, not a near-invisible outline', async ({
    page,
  }) => {
    // Wave 16c-1: the first draft made the unchecked background `transparent`, reasoning
    // from the readme's general "borders are nearly invisible" guidance. The real
    // Chip.jsx gives the unchecked state a var(--surface-card) fill — a control needs a
    // real boundary, not just an 8%-opacity outline with nothing behind it. This exact
    // test is what caught the first fix attempt's bug: it measured `rgb(46, 46, 46)`
    // (Mantine's own unrelated dark-mode default) instead of `--surface-card`'s intended
    // value, which is what led to the `chipLabelStyle`/Mantine-`styles`-API fix in
    // Chip.tsx — see that file's comment. `chip-assist` never toggles, so its background
    // is unconditionally the unchecked treatment.
    const label = page.getByTestId('chip-assist').locator('label').first();

    await expect(page.getByTestId('mode-dark')).toBeVisible();
    const darkBg = await label.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(darkBg).toBe('rgb(20, 20, 20)'); // --surface-card, dark

    await page.getByTestId('mode-light').click();
    await page.waitForTimeout(700);
    const lightBg = await label.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(lightBg).toBe('rgb(225, 225, 225)'); // --surface-card, light

    // restore for other tests sharing this worker's page context
    await page.getByTestId('mode-dark').click();
  });
});
