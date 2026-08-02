import { expect, test } from '@playwright/test';

/**
 * Guards the capabilities every later UI test depends on. If this file goes red,
 * component failures elsewhere are environmental, not regressions in the design system.
 */

const FIXTURE = `
  <style>
    :root { --auralis-primary: #ffb59a; color-scheme: dark light; }
    @media (prefers-color-scheme: light) { :root { --auralis-primary: #8b4f2f; } }
    #swatch { background: var(--auralis-primary); width: 64px; height: 64px; }
    #box { transition: transform 200ms linear; transform: translateX(0); }
    #box.moved { transform: translateX(100px); }
  </style>
  <main>
    <h1>harness</h1>
    <div id="swatch"></div>
    <div id="box"></div>
    <button id="go">go</button>
  </main>
  <script>
    document.getElementById('go').addEventListener('click', () => {
      document.getElementById('box').classList.add('moved');
    });
  </script>
`;

test.describe('Playwright harness', () => {
  test('renders a page and resolves CSS custom properties', async ({ page }) => {
    await page.setContent(FIXTURE);

    await expect(page.getByRole('heading', { name: 'harness' })).toBeVisible();

    const swatch = page.locator('#swatch');
    await expect(swatch).toHaveCSS('background-color', 'rgb(255, 181, 154)');
  });

  test('honours colour-scheme emulation, which the theme tests rely on', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setContent(FIXTURE);

    await expect(page.locator('#swatch')).toHaveCSS('background-color', 'rgb(139, 79, 47)');
  });

  test('runs page scripts and settles transitions', async ({ page }) => {
    await page.setContent(FIXTURE);

    await page.getByRole('button', { name: 'go' }).click();

    await expect(page.locator('#box')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 100, 0)');
  });

  test('exposes a viewport, so adaptive-layout assertions are meaningful', async ({ page }) => {
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    expect(viewport!.width).toBeGreaterThan(0);
  });
});
