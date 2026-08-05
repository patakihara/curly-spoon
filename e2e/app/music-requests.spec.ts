/**
 * Music requests: configuring slskd, reaching `/music/requests` from the Music home page,
 * the search panel's error-vs-empty distinction, and the save-path failure message on a
 * request's own status row.
 *
 * `AURALIS_FAKE_UPSTREAMS` (see `playwright.config.ts`) only swaps in a fake Audiobookshelf
 * and a fake Jellyfin — there is no fake slskd (`testSupport/fakes/fakeSlskd.ts` exists but
 * is "not yet wired into `main.ts`'s dev-mode routing", its own header comment says). So
 * exactly like `requests.spec.ts`'s Prowlarr/qBittorrent, however slskd's base URL is
 * configured here, it is genuinely unreachable: `fakeAbs.ts`'s `fetch` throws a
 * `getaddrinfo ENOTFOUND` for any origin that isn't its own, and slskd is configured at a
 * made-up host below, so every real network call this file provokes fails exactly the way a
 * real unreachable slskd would.
 *
 * That rules out ever seeing a real search candidate here, so the search panel's own
 * "Request" button and "Requested" chip remain untested in this file — same gap
 * `requests.spec.ts` documents for the book search's per-release button, for the same
 * reason. What *is* testable without a reachable provider, and is exercised below:
 *
 * - The search panel's error-vs-empty distinction (an unreachable provider must not look
 *   like a settled "no matches").
 * - The save-path failure message: `music/slskd.ts`'s `isRelativeSavePath` check runs
 *   *before* any network call, so an absolute save path fails locally even against an
 *   unreachable host — enough to exercise the real, actionable `ProviderError` message
 *   end to end (seed the request via the API, since there is no reachable provider to
 *   search a real one into existence through the UI) and confirm the Retry button
 *   surfaces the same real message again, not a generic fallback.
 *
 * Jellyfin is connected idempotently at the top of this file, the same pattern
 * `music.spec.ts` uses and explains: `serial` only orders tests *within* one file, so a
 * second file must not assume another file in this project has already connected it (or
 * hasn't) — `POST /jellyfin/config` overwrites, so connecting again here is always safe.
 * Music requests otherwise have no destinations.ts nav gate of their own to race, unlike
 * the book Requests destination requests.spec.ts asserts on
 * (`MusicRequestsPage.tsx`'s header comment explains why).
 */
import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const FAKE_JELLYFIN_BASE_URL = 'http://fake.jellyfin.local';
const FAKE_JELLYFIN_USERNAME = 'nova';
const FAKE_JELLYFIN_PASSWORD = 'stardust1';

test.beforeEach(async ({ page }) => {
  // Signed in already, via the `app` project's `storageState`.
  await page.goto('/settings');
  await expect(page.getByTestId('settings-page')).toBeVisible();
});

test('connecting Jellyfin and configuring slskd both save without error', async ({ page }) => {
  await page.getByTestId('jellyfin-base-url-input').fill(FAKE_JELLYFIN_BASE_URL);
  await page.getByTestId('jellyfin-username-input').fill(FAKE_JELLYFIN_USERNAME);
  await page.getByTestId('jellyfin-password-input').fill(FAKE_JELLYFIN_PASSWORD);
  await page.getByTestId('jellyfin-connect-submit').click();
  await expect(page.getByTestId('jellyfin-status-connected')).toBeVisible();

  const slskd = page.getByTestId('provider-slskd');
  await expect(slskd).toBeVisible();
  await slskd.getByTestId('provider-slskd-baseurl-input').fill('http://slskd.invalid.local:5030');
  await slskd.getByTestId('provider-slskd-secret-apiKey-input').fill('test-slskd-api-key');
  await slskd.getByTestId('provider-slskd-enabled-toggle').check();
  await slskd.getByTestId('provider-slskd-save').click();
  await expect(slskd.getByTestId('provider-slskd-save-error')).toHaveCount(0);
});

test('the Music home page links to Requests, which opens with an empty list', async ({ page }) => {
  await page.goto('/music');
  await expect(page.getByTestId('music-page')).toBeVisible();

  await page.getByTestId('music-requests-link').click();
  await expect(page.getByTestId('music-requests-page')).toBeVisible();
  await expect(page.getByText('Your music requests')).toBeVisible();
});

test('an unreachable slskd surfaces a non-blocking error notice, not a false "no matches"', async ({
  page,
}) => {
  await page.goto('/music/requests');
  await expect(page.getByTestId('music-requests-page')).toBeVisible();

  await page.getByTestId('music-request-search-field').getByRole('combobox').fill('dune');
  await page.getByTestId('music-request-search-submit').click();

  await expect(page.getByTestId('music-request-search-errors')).toBeVisible();
  // `summaryLine` (`MusicRequestSearchPanel.tsx`) deliberately drops the "No matches" text
  // once an error is present — the error notice already explains the empty result, and a
  // second, unrelated "nothing here" line would read as a contradiction, not confirmation.
  await expect(page.getByText(/No matches for/)).toHaveCount(0);
  await expect(page.getByTestId('music-request-search-results')).toHaveCount(0);
});

test("an invalid save path surfaces slskd's own actionable message, and Retry repeats it honestly", async ({
  page,
}) => {
  await page.getByTestId('music-save-path-input').fill('/not/a/relative/path');
  await page.getByTestId('music-request-settings-save').click();
  await expect(page.getByTestId('music-request-settings-error')).toHaveCount(0);
  await expect(page.getByText('Saved.')).toBeVisible();

  // Seeded via the API rather than the search panel — see this file's header comment for
  // why no real candidate can reach the UI here. `guid` is shaped the way `music/slskd.ts`'s
  // `decodeCandidateHandle` expects (`JSON.stringify({ username, filename, size })`), so
  // `grab()` gets far enough to hit the save-path check rather than failing earlier on an
  // undecodable handle.
  const candidate = {
    guid: JSON.stringify({ username: 'somepeer', filename: 'track.mp3', size: 4_000_000 }),
    providerId: 'slskd',
    sourceName: 'somepeer',
    title: 'A Seeded Track',
    artist: null,
    album: null,
    sizeBytes: 4_000_000,
    bitrateKbps: 320,
    format: 'mp3',
  };
  const createResponse = await page.request.post('/api/v1/music-requests', {
    data: { candidate },
  });
  expect(createResponse.ok()).toBe(true);
  const { request: created } = await createResponse.json();
  // Default approval policy is `auto` (`appSettingsRepo.ts`'s `DEFAULTS`) and nothing else
  // in this suite touches it — see this file's header comment.
  expect(created.status).toBe('approved');

  // Drives it to `failed` the same way `MusicRequestSearchPanel.tsx`'s own auto-grab would
  // have, had this request been created through the UI — `isRelativeSavePath` rejects the
  // path set above before any network call, so this succeeds even with slskd unreachable.
  await page.request.post(`/api/v1/music-requests/${created.id}/grab`);

  await page.goto('/music/requests');
  const row = page.getByTestId(`music-request-${created.id}`);
  await expect(row).toBeVisible();
  await expect(row.getByTestId(`music-request-${created.id}-status`)).toHaveText('Failed');
  const failureReason = row.getByTestId(`music-request-${created.id}-failure-reason`);
  await expect(failureReason).toContainText('Check the music save-path setting');

  // Retry re-attempts against the still-invalid path and must surface the same real,
  // actionable message again — not a generic "could not be completed" fallback masking it.
  await row.getByTestId(`music-request-${created.id}-retry`).click();
  await expect(failureReason).toContainText('Check the music save-path setting');
});
