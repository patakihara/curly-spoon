/**
 * Tests for the Lighthouse budget checker's pure logic: median-of-samples,
 * budget comparison (floor vs. ceiling), and CLI argument parsing. Deliberately
 * does not launch a browser or call Lighthouse — every function under test takes
 * plain data in and returns plain data out.
 *
 * Uses Node's built-in test runner (`node:test`/`node:assert`), not Vitest, for
 * the same reason `bundle-budget.test.mjs` does: this file lives under `scripts/`,
 * outside `vitest.config.ts`'s `include` globs (each workspace package's own
 * `src/`). Confirmed directly — `pnpm vitest run scripts/lighthouse-budget.test.mjs`
 * reports "No test files found", because Vitest's CLI path argument filters the
 * files its `include` glob already discovered rather than adding to them, so it
 * cannot see anything under `scripts/` regardless of the path passed on the
 * command line. Standalone tooling gets a standalone, self-contained test runner
 * rather than a new include glob pointed at `scripts/`.
 *
 * Run directly:
 *   node --test scripts/lighthouse-budget.test.mjs
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  median,
  summarizeSamples,
  summarizeFormFactor,
  evaluateBudget,
  parseArgs,
  UsageError,
  METRICS,
  PAGES,
  assertAuthenticated,
  establishAuthenticatedSession,
  SessionAuthenticationError,
  SessionSetupError,
  formatReport,
  formatMeasuredLine,
} from './lighthouse-budget.mjs';

describe('median', () => {
  test('is the middle value for an odd-length sample, not the mean', () => {
    // mean of [1, 2, 100] is 34.33; median is 2 — these must disagree, or this
    // test would not prove the function isn't secretly averaging.
    assert.equal(median([100, 1, 2]), 2);
  });

  test('is the average of the two middle values for an even-length sample', () => {
    assert.equal(median([1, 2, 3, 4]), 2.5);
  });

  test('is the value itself for a single sample', () => {
    assert.equal(median([42]), 42);
  });

  test('does not mutate its input', () => {
    const input = [3, 1, 2];
    median(input);
    assert.deepEqual(input, [3, 1, 2]);
  });

  test('throws a UsageError on an empty sample set rather than returning NaN or undefined', () => {
    assert.throws(() => median([]), UsageError);
  });
});

describe('summarizeSamples / summarizeFormFactor', () => {
  test('reports median, min and max for one metric', () => {
    assert.deepEqual(summarizeSamples([10, 30, 20]), { median: 20, min: 10, max: 30 });
  });

  test('summarizes every budgeted metric from a set of per-metric sample arrays', () => {
    const sampleSets = Object.fromEntries(METRICS.map(({ key }) => [key, [1, 2, 3]]));
    const summary = summarizeFormFactor(sampleSets);
    for (const { key } of METRICS) {
      assert.deepEqual(summary[key], { median: 2, min: 1, max: 3 });
    }
  });
});

describe('evaluateBudget', () => {
  const stat = (value) => ({ median: value, min: value, max: value });
  const allStats = () => Object.fromEntries(METRICS.map(({ key }) => [key, stat(1)]));
  const allBudgets = () =>
    Object.fromEntries(METRICS.map(({ key }) => [key, key === 'score' ? 0 : Infinity]));

  test('a floor metric (score) passes at exactly the budget', () => {
    const measured = { ...allStats(), score: stat(0.9) };
    const budget = { ...allBudgets(), score: 0.9 };
    const results = evaluateBudget(measured, budget);
    assert.equal(results.find((r) => r.key === 'score').pass, true);
  });

  test('a floor metric (score) fails below the budget', () => {
    const measured = { ...allStats(), score: stat(0.89) };
    const budget = { ...allBudgets(), score: 0.9 };
    const results = evaluateBudget(measured, budget);
    assert.equal(results.find((r) => r.key === 'score').pass, false);
  });

  test('a ceiling metric (fcp) passes at exactly the budget', () => {
    const measured = { ...allStats(), fcp: stat(1000) };
    const budget = { ...allBudgets(), fcp: 1000 };
    const results = evaluateBudget(measured, budget);
    assert.equal(results.find((r) => r.key === 'fcp').pass, true);
  });

  test('a ceiling metric (fcp) fails above the budget', () => {
    const measured = { ...allStats(), fcp: stat(1001) };
    const budget = { ...allBudgets(), fcp: 1000 };
    const results = evaluateBudget(measured, budget);
    assert.equal(results.find((r) => r.key === 'fcp').pass, false);
  });

  test('a mix of passing and failing metrics yields exactly the right per-metric verdicts', () => {
    const measured = {
      score: stat(0.95), // passes (floor 0.9)
      fcp: stat(1500), // fails (ceiling 1000)
      lcp: stat(2000), // passes (ceiling 2500)
      tbt: stat(50), // passes (ceiling 200)
      cls: stat(0.5), // fails (ceiling 0.1)
      si: stat(3000), // passes (ceiling 4000)
    };
    const budget = { score: 0.9, fcp: 1000, lcp: 2500, tbt: 200, cls: 0.1, si: 4000 };
    const results = evaluateBudget(measured, budget);
    const byKey = Object.fromEntries(results.map((r) => [r.key, r.pass]));
    assert.deepEqual(byKey, {
      score: true,
      fcp: false,
      lcp: true,
      tbt: true,
      cls: false,
      si: true,
    });
  });
});

describe('parseArgs', () => {
  test('defaults url, budget path and runs when no flags are given', () => {
    const opts = parseArgs([]);
    assert.deepEqual(opts, {
      url: 'http://127.0.0.1:4320',
      budgetPath: 'scripts/lighthouse-budget.config.mjs',
      runs: 3,
    });
  });

  test('reads explicit --url, --budget and --runs', () => {
    const opts = parseArgs([
      '--url',
      'http://example.test',
      '--budget',
      'my-budget.mjs',
      '--runs',
      '5',
    ]);
    assert.deepEqual(opts, { url: 'http://example.test', budgetPath: 'my-budget.mjs', runs: 5 });
  });

  test('an invalid --runs throws a UsageError instead of producing NaN runs', () => {
    assert.throws(() => parseArgs(['--runs', 'not-a-number']), UsageError);
  });

  test('a zero or negative --runs throws a UsageError', () => {
    assert.throws(() => parseArgs(['--runs', '0']), UsageError);
    assert.throws(() => parseArgs(['--runs', '-1']), UsageError);
  });

  test('a non-integer --runs throws a UsageError', () => {
    assert.throws(() => parseArgs(['--runs', '2.5']), UsageError);
  });
});

describe('PAGES', () => {
  test('has exactly one unauthenticated and one authenticated page, each with a distinct key', () => {
    const keys = PAGES.map((p) => p.key);
    assert.deepEqual(new Set(keys).size, keys.length, 'page keys must be unique');
    assert.equal(PAGES.filter((p) => p.authenticated).length, 1);
    assert.equal(PAGES.filter((p) => !p.authenticated).length, 1);
  });
});

describe('assertAuthenticated', () => {
  const unauthenticatedPage = { key: 'signedOut', label: 'Signed-out', authenticated: false };
  const authenticatedPage = { key: 'home', label: 'Signed-in Home', authenticated: true };

  test('is a no-op for an unauthenticated page, whatever finalDisplayedUrl says', () => {
    assert.doesNotThrow(() =>
      assertAuthenticated(unauthenticatedPage, {
        finalDisplayedUrl: 'http://127.0.0.1:4320/login',
      }),
    );
  });

  test('passes for an authenticated page whose finalDisplayedUrl is the app itself', () => {
    assert.doesNotThrow(() =>
      assertAuthenticated(authenticatedPage, { finalDisplayedUrl: 'http://127.0.0.1:4320/' }),
    );
  });

  test('throws SessionAuthenticationError when an authenticated page redirected to /login', () => {
    assert.throws(
      () =>
        assertAuthenticated(authenticatedPage, {
          finalDisplayedUrl: 'http://127.0.0.1:4320/login',
        }),
      SessionAuthenticationError,
    );
  });

  test('throws SessionAuthenticationError when an authenticated page redirected to /setup', () => {
    assert.throws(
      () =>
        assertAuthenticated(authenticatedPage, {
          finalDisplayedUrl: 'http://127.0.0.1:4320/setup',
        }),
      SessionAuthenticationError,
    );
  });

  test('throws SessionAuthenticationError when finalDisplayedUrl is missing entirely', () => {
    assert.throws(() => assertAuthenticated(authenticatedPage, {}), SessionAuthenticationError);
  });

  test('does not false-positive on a path that merely contains "login" or "setup" as a substring', () => {
    // A page at e.g. /music/loginhistory or /setupguide must not be mistaken for the
    // auth-flow redirect targets, which are exactly /login and /setup (optionally with
    // a trailing slash, query or fragment).
    assert.doesNotThrow(() =>
      assertAuthenticated(authenticatedPage, {
        finalDisplayedUrl: 'http://127.0.0.1:4320/music/loginhistory',
      }),
    );
  });
});

describe('establishAuthenticatedSession', () => {
  function fakeFetch({
    setupOk = true,
    loginOk = true,
    setCookies = ['auralis_session=abc123; Path=/; HttpOnly'],
  } = {}) {
    return async (url) => {
      if (url.endsWith('/api/v1/setup')) {
        return {
          ok: setupOk,
          status: setupOk ? 200 : 500,
          text: async () => (setupOk ? '{}' : 'setup failed'),
        };
      }
      if (url.endsWith('/api/v1/auth/login')) {
        return {
          ok: loginOk,
          status: loginOk ? 200 : 401,
          text: async () => (loginOk ? '{}' : 'invalid credentials'),
          headers: { getSetCookie: () => setCookies },
        };
      }
      throw new Error(`fakeFetch: unexpected URL ${url}`);
    };
  }

  test('returns a "name=value" Cookie header parsed from the login response', async () => {
    const cookie = await establishAuthenticatedSession('http://127.0.0.1:4320', fakeFetch());
    assert.equal(cookie, 'auralis_session=abc123');
  });

  test('ignores other cookies and picks out only the session cookie', async () => {
    const cookie = await establishAuthenticatedSession(
      'http://127.0.0.1:4320',
      fakeFetch({ setCookies: ['other_cookie=xyz; Path=/', 'auralis_session=abc123; Path=/'] }),
    );
    assert.equal(cookie, 'auralis_session=abc123');
  });

  test('throws SessionSetupError when POST /api/v1/setup fails', async () => {
    await assert.rejects(
      () => establishAuthenticatedSession('http://127.0.0.1:4320', fakeFetch({ setupOk: false })),
      SessionSetupError,
    );
  });

  test('throws SessionSetupError when POST /api/v1/auth/login fails', async () => {
    await assert.rejects(
      () => establishAuthenticatedSession('http://127.0.0.1:4320', fakeFetch({ loginOk: false })),
      SessionSetupError,
    );
  });

  test('throws SessionSetupError when login succeeds but sets no session cookie', async () => {
    await assert.rejects(
      () =>
        establishAuthenticatedSession(
          'http://127.0.0.1:4320',
          fakeFetch({ setCookies: ['other_cookie=xyz; Path=/'] }),
        ),
      SessionSetupError,
    );
  });
});

describe('formatReport / formatMeasuredLine', () => {
  const stat = (value) => ({ median: value, min: value, max: value });
  const results = evaluateBudget(
    Object.fromEntries(METRICS.map(({ key }) => [key, stat(key === 'score' ? 0.95 : 1)])),
    Object.fromEntries(METRICS.map(({ key }) => [key, key === 'score' ? 0.9 : 1000])),
  );

  test('formatReport includes the page label alongside the form factor', () => {
    const report = formatReport('Signed-in Home (/)', 'mobile', results);
    assert.match(report, /Signed-in Home \(\/\) — mobile/);
  });

  test('formatMeasuredLine includes the page key alongside the form factor and run count', () => {
    const summary = summarizeFormFactor(
      Object.fromEntries(METRICS.map(({ key }) => [key, [1, 2, 3]])),
    );
    const line = formatMeasuredLine('home', 'desktop', 5, summary);
    assert.match(line, /^measured: home desktop \(5 runs\)/);
  });
});
