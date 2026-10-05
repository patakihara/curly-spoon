import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * A Browse shelf scrolled to its end leaves the page where it was: the page's own scroller and the
 * document never scroll sideways, by wheel, by touch or by setting `scrollLeft`, and nothing
 * between the shelf and the document runs wider than the viewport.
 */
const SIZES = [
  { name: 'a phone', width: 390, height: 844, touch: true },
  { name: 'a desktop', width: 1440, height: 900, touch: false },
];

/** Marks Browse's first shelf track, the first element on the page that scrolls sideways. */
const markTrack = (page: Page) =>
  page.evaluate(() => {
    const track = [...document.querySelectorAll('div')].find(
      (d) => /auto|scroll/.test(getComputedStyle(d).overflowX) && d.scrollWidth > d.clientWidth + 1,
    );
    if (track === undefined) throw new Error('no shelf scrolls sideways');
    track.dataset.e2eTrack = '';
  });

/**
 * Every box between the shelf's track and the document that clips or scrolls (an
 * `overflow: visible` box such as the shelf's own wrapper lets the bleed through to the next),
 * each asked to scroll sideways, with how far it went and how wide its content runs past it.
 */
const sideways = (page: Page) =>
  page.evaluate(() => {
    const track = document.querySelector<HTMLElement>('[data-e2e-track]');
    if (track === null) throw new Error('the shelf track is gone');
    const out: { el: string; scrollLeft: number; overflow: number }[] = [];
    for (let n = track.parentElement; n !== null; n = n.parentElement) {
      if (n !== document.documentElement && getComputedStyle(n).overflowX === 'visible') continue;
      n.scrollLeft = 200;
      out.push({
        el: `${n.tagName.toLowerCase()} ${n.getAttribute('style') ?? ''}`.slice(0, 160),
        scrollLeft: n.scrollLeft,
        overflow: n.scrollWidth - n.clientWidth,
      });
      n.scrollLeft = 0;
    }
    const doc = document.scrollingElement ?? document.documentElement;
    out.push({
      el: 'document',
      scrollLeft: window.scrollX,
      overflow: doc.scrollWidth - window.innerWidth,
    });
    return out;
  });

/** Where the shelf's track sits on screen; the page moving sideways moves it. */
const trackLeft = (page: Page) =>
  page.locator('[data-e2e-track]').evaluate((t) => t.getBoundingClientRect().left);

for (const size of SIZES) {
  test.describe(`on ${size.name}`, () => {
    test.use({
      viewport: { width: size.width, height: size.height },
      hasTouch: size.touch,
      isMobile: size.touch,
    });

    test(`[M0.sonoraclean/e] a Browse shelf scrolled to its end leaves the page unscrollable sideways at ${size.width} px`, async ({
      page,
    }) => {
      await page.goto('/', { waitUntil: 'networkidle' });
      await page.locator('img').first().waitFor();
      await markTrack(page);
      const track = page.locator('[data-e2e-track]');
      const left = await trackLeft(page);

      // To the end, the way a reader gets there: the wheel or a swipe on the shelf itself.
      const box = await track.boundingBox();
      if (box === null) throw new Error('the shelf track has no box');
      const y = box.y + box.height / 2;
      if (size.touch) {
        const cdp = await page.context().newCDPSession(page);
        for (let i = 0; i < 4; i++) {
          await cdp.send('Input.synthesizeScrollGesture', {
            x: Math.round(box.x + box.width * 0.8),
            y: Math.round(y),
            xDistance: -Math.round(box.width * 2),
            yDistance: 0,
            gestureSourceType: 'touch',
            speed: 3000,
          });
        }
        // Past the end, and then a swipe on the page beneath the shelf.
        await cdp.send('Input.synthesizeScrollGesture', {
          x: Math.round(box.x + box.width * 0.8),
          y: Math.round(y),
          xDistance: -300,
          yDistance: 0,
          gestureSourceType: 'touch',
        });
        await cdp.send('Input.synthesizeScrollGesture', {
          x: Math.round(size.width * 0.8),
          y: Math.round(Math.min(size.height - 220, box.y + box.height + 60)),
          xDistance: -300,
          yDistance: 0,
          gestureSourceType: 'touch',
        });
      } else {
        await page.mouse.move(box.x + box.width / 2, y);
        for (let i = 0; i < 8; i++) await page.mouse.wheel(1000, 0);
      }
      await track.evaluate((t) => {
        t.scrollLeft = t.scrollWidth;
      });
      await expect
        .poll(() => track.evaluate((t) => t.scrollWidth - t.clientWidth - t.scrollLeft))
        .toBeLessThan(2);
      // One more push past the end, on the wheel, while the end's overlay is showing.
      await page.mouse.move(box.x + box.width / 2, y);
      await page.mouse.wheel(400, 0);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));

      const boxes = await sideways(page);
      for (const n of boxes) {
        expect(n, `${n.el} scrolls sideways`).toMatchObject({ scrollLeft: 0 });
        expect(n.overflow, `${n.el} runs ${n.overflow} px wider than its box`).toBeLessThanOrEqual(
          0,
        );
      }
      expect(await trackLeft(page)).toBeCloseTo(left, 0);
    });
  });
}

/**
 * A ScrollArea's overlay thumb, Android's: hidden at rest, shown at `--opacity-scrollbar` while
 * its scroller moves, and faded out once it has stood still for `--duration-linger`. The thumb is
 * the `aria-hidden` span beside the scroller, inside ScrollArea's clipped frame.
 */
const thumbOpacity = (scroller: Locator) =>
  scroller.evaluate((s) => {
    const thumb = s.nextElementSibling;
    if (!(thumb instanceof HTMLElement) || thumb.getAttribute('aria-hidden') !== 'true') {
      throw new Error('the scroller has no overlay thumb beside it');
    }
    return Number(getComputedStyle(thumb).opacity);
  });

const restOpacity = (page: Page) =>
  page.evaluate(() =>
    Number(getComputedStyle(document.documentElement).getPropertyValue('--opacity-scrollbar')),
  );

/** Marks the page's own scroller: the first element that scrolls up and down. */
const markPage = (page: Page) =>
  page.evaluate(() => {
    const scroller = [...document.querySelectorAll('div')].find(
      (d) =>
        /auto|scroll/.test(getComputedStyle(d).overflowY) && d.scrollHeight > d.clientHeight + 1,
    );
    if (scroller === undefined) throw new Error('nothing on the page scrolls up and down');
    scroller.dataset.e2ePage = '';
  });

/** Where each scroller shows its thumb: a shelf only on a phone, the page everywhere. */
const THUMBS = [
  { which: 'a Browse shelf', mark: '[data-e2e-track]', width: 390, height: 844, touch: true },
  { which: 'the page', mark: '[data-e2e-page]', width: 1440, height: 900, touch: false },
];

for (const t of THUMBS) {
  test.describe(`the overlay scrollbar at ${t.width} px`, () => {
    test.use({
      viewport: { width: t.width, height: t.height },
      hasTouch: t.touch,
      isMobile: t.touch,
    });

    test(`[M0.sonoraclean/e] ${t.which} shows its thumb while it scrolls and fades it after`, async ({
      page,
    }) => {
      await page.goto('/', { waitUntil: 'networkidle' });
      await page.locator('img').first().waitFor();
      await markTrack(page);
      await markPage(page);
      const scroller = page.locator(t.mark);
      const rest = await restOpacity(page);
      expect(rest).toBeGreaterThan(0);
      expect(await thumbOpacity(scroller)).toBe(0);

      if (t.touch) {
        // The shelf scrolls as a swipe leaves it; the thumb answers the scroll, whatever moved it.
        await scroller.evaluate((s) => {
          s.scrollLeft += s.clientWidth / 2;
        });
      } else {
        const box = await scroller.boundingBox();
        if (box === null) throw new Error('the scroller has no box');
        await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 200));
        await page.mouse.wheel(0, 300);
      }

      await expect.poll(() => thumbOpacity(scroller), { timeout: 2000 }).toBeCloseTo(rest, 2);
      await expect.poll(() => thumbOpacity(scroller), { timeout: 5000 }).toBe(0);
    });
  });
}

test("[M0.sonoraclean/d] a Browse shelf's forward arrow keeps its raised look while it fades out at the end, and then cannot be reached", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.locator('img').first().waitFor();
  const forward = page.getByRole('button', { name: 'Scroll forward' }).first();
  const track = page.locator(`[id="${await forward.getAttribute('aria-controls')}"]`);
  const box = await track.boundingBox();
  if (box === null) throw new Error('the shelf track has no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => forward.evaluate((el) => getComputedStyle(el).opacity)).not.toBe('0');
  const raised = await forward.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { background: cs.backgroundColor, shadow: cs.boxShadow };
  });

  // Every frame of the fade, from the scroll that reaches the end until the arrow is gone.
  const frames = await forward.evaluate(
    (el, id) =>
      new Promise<{ opacity: number; background: string; shadow: string }[]>((done) => {
        const scroller = document.getElementById(id);
        if (scroller === null) throw new Error('no track');
        scroller.scrollLeft = scroller.scrollWidth;
        const seen: { opacity: number; background: string; shadow: string }[] = [];
        const start = performance.now();
        const frame = () => {
          let opacity = 1;
          for (let n: Element | null = el; n !== null; n = n.parentElement)
            opacity *= Number(getComputedStyle(n).opacity);
          const cs = getComputedStyle(el);
          seen.push({ opacity, background: cs.backgroundColor, shadow: cs.boxShadow });
          if (performance.now() - start < 600) requestAnimationFrame(frame);
          else done(seen);
        };
        requestAnimationFrame(frame);
      }),
    (await forward.getAttribute('aria-controls')) ?? '',
  );
  const fading = frames.filter((f) => f.opacity > 0);
  expect(fading.length, 'the arrow is seen fading').toBeGreaterThan(0);
  for (const f of fading)
    expect({ background: f.background, shadow: f.shadow }, 'still raised while it fades').toEqual(
      raised,
    );
  expect(frames.at(-1)?.opacity, 'gone at the end').toBe(0);

  const reachable = await forward.evaluate((el) => {
    (el as HTMLElement).focus();
    return {
      focused: document.activeElement === el,
      hidden: el.closest('[inert],[aria-hidden="true"]') !== null,
    };
  });
  expect(reachable, 'neither focusable nor announced once gone').toEqual({
    focused: false,
    hidden: true,
  });
});

test("[M0.sonoraclean/d] pressing a Browse shelf's forward arrow until it goes at the end moves focus to the back arrow, never the page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.locator('img').first().waitFor();
  const forward = page.getByRole('button', { name: 'Scroll forward' }).first();
  const id = (await forward.getAttribute('aria-controls')) ?? '';
  const back = page.locator(`button[aria-label="Scroll back"][aria-controls="${id}"]`);
  await forward.focus();
  await expect(forward).toBeFocused();

  // Press until the forward arrow goes, waiting out each smooth page.
  for (let n = 0; n < 40; n++) {
    const gone = await forward.evaluate((el) => el.closest('[inert]') !== null);
    if (gone) break;
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
  }
  expect(await forward.evaluate((el) => el.closest('[inert]') !== null), 'gone at the end').toBe(
    true,
  );
  await expect(back, 'focus lands on the back arrow').toBeFocused();
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);

  // And the same the other way: back to the start, focus moves to the forward arrow.
  for (let n = 0; n < 40; n++) {
    const gone = await back.evaluate((el) => el.closest('[inert]') !== null);
    if (gone) break;
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
  }
  await expect(forward, 'focus lands on the forward arrow').toBeFocused();
});

test('[M0.sonoraclean/d] a Browse shelf scrolled to its end by wheel, after focus has left its arrows for the page, leaves focus where it is', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.locator('img').first().waitFor();
  const forward = page.getByRole('button', { name: 'Scroll forward' }).first();
  const id = (await forward.getAttribute('aria-controls')) ?? '';
  const track = page.locator(`[id="${id}"]`);
  const back = page.locator(`button[aria-label="Scroll back"][aria-controls="${id}"]`);

  // Page the shelf once by its arrow, then click a blank part of the page: focus goes to the body.
  await forward.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  await page.mouse.click(1430, 450);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);

  // Scroll the shelf to its end with the wheel, as a trackpad would.
  const box = (await track.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let n = 0; n < 40; n++) {
    const end = await track.evaluate((el) => el.scrollLeft >= el.scrollWidth - el.clientWidth - 1);
    if (end) break;
    await page.mouse.wheel(400, 0);
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(400);
  await expect(back, 'no arrow takes focus the listener did not give it').not.toBeFocused();
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
});

test("[M0.sonoraclean/d] a Browse shelf's arrow holding keyboard focus stays shown when the mouse leaves the shelf", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.locator('img').first().waitFor();
  const forward = page.getByRole('button', { name: 'Scroll forward' }).first();
  const track = page.locator(`[id="${await forward.getAttribute('aria-controls')}"]`);
  const box = await track.boundingBox();
  if (box === null) throw new Error('the shelf track has no box');
  const shown = () =>
    forward.evaluate((el) => {
      let opacity = 1;
      for (let n: Element | null = el; n !== null; n = n.parentElement)
        opacity *= Number(getComputedStyle(n).opacity);
      return opacity;
    });
  // A shown arrow rests at `--opacity-rest`, not full opacity.
  const rest = await page.evaluate(() =>
    Number(getComputedStyle(document.documentElement).getPropertyValue('--opacity-rest')),
  );
  expect(rest).toBeGreaterThan(0);

  // Hover the shelf, then put keyboard focus on its forward arrow, then move the mouse away.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await forward.focus();
  await expect.poll(shown).toBeCloseTo(rest, 2);
  await page.mouse.move(box.x + box.width / 2, 2);
  await page.waitForTimeout(600);
  expect(await forward.evaluate((el) => document.activeElement === el), 'still focused').toBe(true);
  expect(await shown(), 'the focused arrow is still shown').toBeCloseTo(rest, 2);
});
