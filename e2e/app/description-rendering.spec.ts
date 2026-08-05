/**
 * Regression coverage for the "descriptions render as raw HTML" bug: Audiobookshelf
 * stores `media.description` as HTML, and rendering it as plain text used to leave the
 * markup itself visible on the page (`<p><b>...`).
 *
 * `parseDescriptionHtml.test.ts` unit-tests the parsing/sanitisation logic itself; this
 * spec proves the piece that only a real browser can show — that `ItemPage` actually
 * mounts real `<b>`/`<br>`/`<a>` DOM elements from the fixture's HTML description
 * (`apps/server/src/testSupport/fakes/fixtures/items-books.json`'s `item-dune`, which was
 * given synthetic HTML — including a `<script>` tag and a `javascript:` link — for
 * exactly this test) rather than a text node containing literal angle brackets, and that
 * the dangerous parts of that markup never make it into the page at all.
 */
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Signed in already, via the `app` project's `storageState`.
  await page.goto('/item/item-dune');
  await expect(page.getByTestId('item-page')).toBeVisible();
});

test('renders the HTML description as real elements, not literal markup as text', async ({
  page,
}) => {
  const description = page.getByTestId('item-description');
  await expect(description).toBeVisible();

  // The literal tag text must never be readable on the page — this is the bug itself.
  const visibleText = await description.innerText();
  expect(visibleText).not.toContain('<p>');
  expect(visibleText).not.toContain('<b>');
  expect(visibleText).not.toContain('<br');

  // The markup instead became real DOM structure: a paragraph containing a real <b>.
  await expect(description.locator('p')).toHaveCount(1);
  await expect(description.locator('b')).toHaveCount(1);
  await expect(description.locator('b')).toContainText('towering achievement');
  // <br /> became a real line break, not a "<br />" substring in the text.
  expect(await description.locator('br').count()).toBeGreaterThan(0);
});

test('keeps a safe https link live, and never turns the javascript: link into one', async ({
  page,
}) => {
  const description = page.getByTestId('item-description');

  const safeLink = description.getByRole('link', { name: 'large print' });
  await expect(safeLink).toBeVisible();
  await expect(safeLink).toHaveAttribute('href', 'https://example.com/dune');
  await expect(safeLink).toHaveAttribute('rel', 'noopener noreferrer');

  // The javascript: link's own text is still readable, but it is not a link at all.
  await expect(description.getByText('this link')).toBeVisible();
  await expect(description.getByRole('link', { name: 'this link' })).toHaveCount(0);
});

test('never executes or renders the <script> tag embedded in the description', async ({ page }) => {
  const description = page.getByTestId('item-description');
  await expect(description).toBeVisible();

  // The fixture's <script> sets this global if it ever runs — proves script content
  // is dropped before it reaches the DOM, not merely hidden by CSS.
  const scriptRan = await page.evaluate(() => (window as unknown as Record<string, unknown>).__xss);
  expect(scriptRan).toBeUndefined();

  expect(await description.locator('script').count()).toBe(0);
  const visibleText = await description.innerText();
  expect(visibleText).not.toContain('__xss');
  expect(visibleText).not.toContain('window.__xss');
});
