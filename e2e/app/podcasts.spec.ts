/**
 * Podcast discovery (Phase 8, wave B): search the directory or paste an RSS URL,
 * preview the real feed, then subscribe.
 *
 * Fixture data (`apps/server/src/testSupport/fakes/fakeAbs.ts`): the directory
 * search term "daily tech" matches "The Daily Tech Digest" (itunesId 987654321,
 * feedUrl `https://feeds.fake.abs.local/daily-tech.xml`), and that exact feed URL
 * previews to a one-episode feed ("Episode 1: Welcome"). `lib-podcasts` is the
 * fixture's podcast-mediaType library, with one folder — the target `POST
 * /podcasts` subscribes into.
 *
 * These tests don't share state the way `requests.spec.ts` does: each one does
 * its own search/preview (read-only against the fake) or its own subscribe
 * (which only ever adds a new, independent item), so no `serial` mode is needed.
 */
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Signed in already, via the `app` project's `storageState`.
  await page.goto('/podcasts/discover');
  await expect(page.getByTestId('podcast-discover-page')).toBeVisible();
});

test('the podcast library page has an "Add podcast" entry point that opens discovery', async ({
  page,
}) => {
  await page.goto('/library/lib-podcasts');
  await expect(page.getByTestId('library-page')).toBeVisible();

  await page.getByTestId('add-podcast').click();
  await expect(page.getByTestId('podcast-discover-page')).toBeVisible();
});

test('searching the directory and selecting a result previews the real feed, including episodes', async ({
  page,
}) => {
  await page.getByTestId('podcast-search-field').getByRole('combobox').fill('daily tech');
  await page.getByTestId('podcast-search-submit').click();

  const result = page.getByTestId('podcast-result-987654321');
  await expect(result).toBeVisible();
  await expect(result.getByText('The Daily Tech Digest')).toBeVisible();

  await result.click();

  const preview = page.getByTestId('podcast-preview');
  await expect(preview).toBeVisible();
  await expect(preview.getByText('The Daily Tech Digest')).toBeVisible();
  await expect(page.getByTestId('podcast-preview-episodes')).toContainText('Episode 1: Welcome');
  await expect(page.getByTestId('podcast-subscribe')).toBeVisible();
});

test('subscribing after a preview shows a success state', async ({ page }) => {
  await page.getByTestId('podcast-search-field').getByRole('combobox').fill('daily tech');
  await page.getByTestId('podcast-search-submit').click();
  await page.getByTestId('podcast-result-987654321').click();
  await expect(page.getByTestId('podcast-preview')).toBeVisible();

  await page.getByTestId('podcast-subscribe').click();
  await expect(page.getByTestId('podcast-subscribe-success')).toBeVisible();
});

test('pasting an RSS URL directly previews the feed, with no directory search needed', async ({
  page,
}) => {
  await page.getByTestId('podcast-rss-input').fill('https://feeds.fake.abs.local/daily-tech.xml');
  await page.getByTestId('podcast-rss-preview').click();

  const preview = page.getByTestId('podcast-preview');
  await expect(preview).toBeVisible();
  await expect(preview.getByText('The Daily Tech Digest')).toBeVisible();
  await expect(page.getByTestId('podcast-subscribe')).toBeVisible();
});
