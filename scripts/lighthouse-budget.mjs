#!/usr/bin/env node
/**
 * Lighthouse performance budget — Phase 10's second release-polish check
 * (docs/ROADMAP.md §10), alongside `scripts/bundle-budget.mjs`'s bundle-size one.
 *
 * A small bundle does not guarantee a fast page: render-blocking requests, layout
 * thrash from artwork-derived colour extraction, and an unoptimised critical path
 * are all invisible to a byte count. This runs a real Chrome against the built app
 * and checks Lighthouse's own performance metrics, for both `desktop` and `mobile`
 * form factors, against numbers measured locally (see
 * `scripts/lighthouse-budget.config.mjs`'s header for exactly which build, against
 * which upstream, and when).
 *
 * How it gets a browser: there is no system Chrome on this machine or on the CI
 * runner, so it borrows the Chromium binary Playwright already manages
 * (`chromium.executablePath()` from `@playwright/test`, pre-installed by
 * `pnpm exec playwright install --with-deps chromium`) and launches it with
 * `chrome-launcher`, one of Lighthouse's own dependencies. `chrome-launcher` is
 * not itself a root `package.json` dependency, so it is not hoisted into this
 * project's own `node_modules` under pnpm's strict layout; it is resolved
 * dynamically off Lighthouse's own dependency graph instead (`loadChromeLauncher`
 * below), rather than importing it as a bare specifier, which would only work by
 * accident of hoisting and could break on an unrelated lockfile change.
 *
 * Two pages are audited (`PAGES` below), both at the same URL (`/`) since the
 * app is an SPA whose root route renders entirely differently depending on
 * server/session state, not on the path: `signedOut` is the original
 * unconfigured-server onboarding screen, and `home` is the authenticated
 * library/home experience a returning user actually spends their time in.
 * `home` is included because a real regression already slipped past this
 * budget once while it audited only `signedOut` — see `lighthouse-budget.config.mjs`'s
 * header for the incident and `establishAuthenticatedSession` below for how the
 * session is obtained.
 *
 * Noise is the central engineering problem here, more than for the bundle-size
 * check: Lighthouse's own timing metrics vary run to run even against an
 * unchanged build, because they are real wall-clock measurements of a real
 * browser. Each page/form-factor pair is therefore audited `--runs` times
 * (default 3) and every metric is judged on the **median** of those runs, never
 * the mean — a single slow or fast outlier run must not move the result — with
 * the observed min/max reported alongside so a human reading a failure can tell
 * "this regressed" from "this run was noisy."
 *
 * Metrics budgeted, per form factor: the Lighthouse performance category score
 * (a floor — higher is better) and five Core-Web-Vitals-adjacent timing metrics,
 * all as `numericValue` in milliseconds except CLS, which is unitless (a
 * ceiling — lower is better, same direction as every timing metric):
 *   - first-contentful-paint
 *   - largest-contentful-paint
 *   - total-blocking-time
 *   - cumulative-layout-shift
 *   - speed-index
 *
 * Desktop uses Lighthouse's own `desktop-config.js` preset (imported directly,
 * not hand-copied, so it always matches whatever Lighthouse itself considers
 * "desktop" as the installed version drifts) — 1350x940 emulation, no CPU/network
 * throttling beyond its own `desktopDense4G` profile. Mobile uses Lighthouse's
 * default config (no `config` argument): simulated slow 4G, 4x CPU throttle,
 * mobile viewport emulation.
 *
 * Usage:
 *   node scripts/lighthouse-budget.mjs [--url http://127.0.0.1:4320]
 *                                       [--budget scripts/lighthouse-budget.config.mjs]
 *                                       [--runs 3]
 *
 * Exit 0: every metric within budget for every page/form-factor pair, OR a
 *         real Chrome could not be launched at all, OR Lighthouse ran but
 *         returned a `runtimeError` or a non-numeric metric on some sample —
 *         see below for why all three of those are 0, not 1.
 * Exit 1: a real audit ran, produced trustworthy numbers, and at least one
 *         metric's median is over budget.
 * Exit 2: a usage/config error (bad flags, budget module failed to load,
 *         signing in to the freshly-booted server failed, or an
 *         authenticated-page audit did not actually land on the authenticated
 *         app — see `establishAuthenticatedSession`/`assertAuthenticated`).
 *         Deliberately **not** exit 0: unlike a missing Chrome binary or a
 *         glitched sample, a session that fails to establish means this run
 *         audited the wrong page (or nothing), which is exactly the silent
 *         failure mode this file's `home` page coverage exists to remove — see
 *         `assertAuthenticated`'s own doc comment.
 *
 * A missing/unlaunchable Chrome, or an audit Lighthouse itself flags as
 * untrustworthy (`AuditUnavailableError`, below), exits 0, not 1 or 2 —
 * mirroring `bundle-budget.mjs`'s "missing dist/ is not a budget failure"
 * stance: this script does not control whether a Chrome binary is present
 * (CI installs one explicitly; a stray local environment might not) or
 * whether one particular sample glitched, so "could not even attempt (or
 * trust) the check" must never read as "the check failed." The explanation
 * always goes to stderr, loudly, so it is never silently mistaken for a pass.
 */
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { resolve as resolvePath, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import { chromium } from '@playwright/test';

/** Thrown for bad CLI flags or an unloadable budget module — maps to exit 2. */
export class UsageError extends Error {}

/**
 * Thrown when the HTTP calls that configure and sign in to the freshly-booted
 * server (`establishAuthenticatedSession`) fail outright — a non-2xx response
 * from `/api/v1/setup` or `/api/v1/auth/login`, or a login response that did
 * not set the session cookie. This is a fresh, single-tenant server this
 * script's own `.sh` wrapper just booted specifically to be configured, so
 * failing here is an environment/config bug, not "the check could not run" —
 * it maps to exit 2, the same bucket as a bad CLI flag, not the fail-soft
 * exit-0 path `AuditUnavailableError` below takes.
 */
export class SessionSetupError extends Error {}

/**
 * Thrown when an authenticated-page audit's `finalDisplayedUrl` shows it did
 * not actually reach the authenticated app — see `assertAuthenticated`. Also
 * maps to exit 2: a Lighthouse audit that ran to completion against the wrong
 * page is not "no result" (`AuditUnavailableError`'s case) and is not a
 * measured budget failure either — it is proof the check itself is not
 * checking what it claims to, which is worse than either and must never be
 * spent-exit-0-and-move-on.
 */
export class SessionAuthenticationError extends Error {}

/**
 * Thrown when Lighthouse ran but did not produce a trustworthy result — a
 * `runtimeError` on the `lhr`, or a metric whose `numericValue` isn't a finite
 * number. Caught in `main()` and treated the same as "no Chrome available":
 * fail-soft, exit 0, loud on stderr. Without this, a single bad sample would
 * `median()` a `NaN` into the report and fail a metric on something that was
 * never a real regression — exactly the flaky-gate-on-`publish` failure mode
 * this whole noise-tolerant design exists to avoid.
 */
export class AuditUnavailableError extends Error {}

/**
 * The five timing/score metrics this script budgets, in report order. `direction`
 * says which way is "good": `floor` metrics must be at-or-above their budget
 * (the performance score), `ceiling` metrics must be at-or-below it (every
 * timing metric, including CLS, which is unitless but still "lower is better").
 */
export const METRICS = [
  { key: 'score', label: 'Performance score', direction: 'floor', unit: '' },
  { key: 'fcp', label: 'First Contentful Paint', direction: 'ceiling', unit: 'ms' },
  { key: 'lcp', label: 'Largest Contentful Paint', direction: 'ceiling', unit: 'ms' },
  { key: 'tbt', label: 'Total Blocking Time', direction: 'ceiling', unit: 'ms' },
  { key: 'cls', label: 'Cumulative Layout Shift', direction: 'ceiling', unit: '' },
  { key: 'si', label: 'Speed Index', direction: 'ceiling', unit: 'ms' },
];

const AUDIT_IDS = {
  fcp: 'first-contentful-paint',
  lcp: 'largest-contentful-paint',
  tbt: 'total-blocking-time',
  cls: 'cumulative-layout-shift',
  si: 'speed-index',
};

const FORM_FACTORS = ['desktop', 'mobile'];

/**
 * The two pages this script audits, both at the app's own root URL — see this
 * file's header for why one URL serves two entirely different pages. `key`
 * indexes into `lighthouse-budget.config.mjs`'s `budget` object
 * (`budget[page.key][formFactor]`); `authenticated` decides whether
 * `establishAuthenticatedSession`'s cookie is attached and whether
 * `assertAuthenticated` runs against the result.
 */
export const PAGES = [
  {
    key: 'signedOut',
    label: 'Signed-out onboarding (/)',
    authenticated: false,
  },
  {
    key: 'home',
    label: 'Signed-in Home (/)',
    authenticated: true,
  },
];

/** Mirrors `apps/server/src/auth/cookies.ts`'s `SESSION_COOKIE_NAME` — not imported,
 *  same reasoning `e2e/app/helpers/onboarding.ts` gives for its own constants: this
 *  script has no workspace dependency on `apps/server`. */
const SESSION_COOKIE_NAME = 'auralis_session';

/** Mirrors `e2e/app/helpers/onboarding.ts`'s fake-Audiobookshelf credentials — the
 *  same ones `apps/server/src/testSupport/fakes/fakeAbs.ts` accepts under
 *  `AURALIS_FAKE_UPSTREAMS=1`, which is how `scripts/lighthouse-budget.sh` boots the
 *  server this script audits. Not imported, same reasoning as `SESSION_COOKIE_NAME`
 *  above. */
const FAKE_ABS_BASE_URL = 'http://fake.abs.local';
const FAKE_USERNAME = 'kara';
const FAKE_PASSWORD = 'hunter2';

/**
 * The median of a sample array — deliberately not the mean, so one outlier run
 * (a GC pause, a scheduler hiccup) cannot single-handedly move the reported
 * value the way it would move an average. Sorts a copy; does not mutate input.
 */
export function median(samples) {
  if (samples.length === 0) {
    throw new UsageError('median() called with no samples');
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/** Summarizes one metric's raw run samples into {median, min, max}. */
export function summarizeSamples(samples) {
  return {
    median: median(samples),
    min: Math.min(...samples),
    max: Math.max(...samples),
  };
}

/**
 * Turns `{ score: [...], fcp: [...], ... }` (raw per-run samples, one array per
 * metric key) into `{ score: {median,min,max}, fcp: {median,min,max}, ... }`.
 */
export function summarizeFormFactor(sampleSets) {
  const summary = {};
  for (const { key } of METRICS) {
    summary[key] = summarizeSamples(sampleSets[key]);
  }
  return summary;
}

/**
 * Compares a form factor's summarized measurements against its budget. Returns
 * one result per metric — not just the first failure — so a report can show how
 * far off every metric is, not only the first one found.
 */
export function evaluateBudget(measured, budgetConfig) {
  return METRICS.map(({ key, label, direction, unit }) => {
    const limit = budgetConfig[key];
    const { median: value, min, max } = measured[key];
    const pass = direction === 'floor' ? value >= limit : value <= limit;
    return { key, label, direction, unit, value, min, max, limit, pass };
  });
}

function formatValue(key, value) {
  if (key === 'score') return value.toFixed(2);
  if (key === 'cls') return value.toFixed(3);
  return `${Math.round(value)}`;
}

/** The human-readable per-page/form-factor report: metric, median, min-max, budget, verdict. */
export function formatReport(pageLabel, formFactor, results) {
  const lines = [`Lighthouse performance budget — ${pageLabel} — ${formFactor}:`, ''];
  for (const r of results) {
    const status = r.pass ? 'ok  ' : 'OVER';
    const dirWord = r.direction === 'floor' ? '>=' : '<=';
    const value = formatValue(r.key, r.value);
    const range = `(${formatValue(r.key, r.min)}-${formatValue(r.key, r.max)})`;
    const limit = formatValue(r.key, r.limit);
    lines.push(
      `  [${status}] ${r.label.padEnd(24)} median ${value.padStart(8)}${r.unit ? ` ${r.unit}` : ''} ` +
        `${range.padStart(14)}  budget ${dirWord} ${limit}${r.unit ? ` ${r.unit}` : ''}`,
    );
  }
  const failures = results.filter((r) => !r.pass);
  if (failures.length > 0) {
    lines.push('', 'Over budget:');
    for (const f of failures) {
      lines.push(
        `  - ${f.label}: median ${formatValue(f.key, f.value)}${f.unit ? ` ${f.unit}` : ''} ` +
          `does not satisfy budget ${f.direction === 'floor' ? '>=' : '<='} ` +
          `${formatValue(f.key, f.limit)}${f.unit ? ` ${f.unit}` : ''}.`,
      );
    }
  }
  return lines.join('\n');
}

/**
 * A copy-pasteable line for re-deriving `lighthouse-budget.config.mjs`, in the
 * same spirit as `bundle-budget.mjs`'s own "measured:" output — a human raising
 * a budget should read this off a real run, not invent a number.
 */
export function formatMeasuredLine(pageKey, formFactor, runs, measured) {
  const parts = METRICS.map(
    ({ key }) =>
      `${key}=${formatValue(key, measured[key].median)}` +
      ` (${formatValue(key, measured[key].min)}-${formatValue(key, measured[key].max)})`,
  );
  // The run count is part of the line deliberately: "the median of 3 runs" and
  // "the median of 7 runs" are different claims, and a config re-derived from
  // one without noting which would be unverifiable from the printed report alone.
  return `measured: ${pageKey} ${formFactor} (${runs} runs) ${parts.join(' ')}`;
}

/**
 * Parses CLI flags into `{ url, budgetPath, runs }`. `--runs` must be a positive
 * integer — anything else is a `UsageError`, never a silent `NaN` that would make
 * the later `for` loop run zero times and report an empty, vacuously-passing budget.
 */
export function parseArgs(argv, defaults = {}) {
  const flag = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? undefined : argv[i + 1];
  };
  const url = flag('url') ?? defaults.url ?? 'http://127.0.0.1:4320';
  const budgetPath =
    flag('budget') ?? defaults.budgetPath ?? 'scripts/lighthouse-budget.config.mjs';
  const runsRaw = flag('runs');
  let runs = defaults.runs ?? 3;
  if (runsRaw !== undefined) {
    const n = Number(runsRaw);
    if (!Number.isInteger(n) || n < 1) {
      throw new UsageError(`--runs must be a positive integer, got "${runsRaw}"`);
    }
    runs = n;
  }
  return { url, budgetPath, runs };
}

/**
 * Configures the fresh, single-tenant, in-memory server `lighthouse-budget.sh`
 * just booted and signs in — the same two HTTP calls
 * `e2e/app/onboarding.spec.ts` drives through a real browser (`POST
 * /api/v1/setup`, then `POST /api/v1/auth/login`), but over a plain `fetch`
 * here instead: Lighthouse drives its own, separately-launched Chrome
 * instance rather than Playwright's `page`, so there is no `page.context()`
 * to hand a `storageState` file to (approach 2 from this wave's spec —
 * driving Playwright against Lighthouse's own Chrome over its CDP endpoint —
 * was rejected for exactly this extra moving part: this is simpler and has
 * nothing to keep in sync between two automation libraries sharing one
 * browser process).
 *
 * Returns a `Cookie` request-header value for the signed-in session, which
 * `auditFormFactor` attaches to `home` page audits via Lighthouse's
 * `extraHeaders` setting (`core/gather/driver/prepare.js` sends it as
 * `Network.setExtraHTTPHeaders` before any navigation) — the browser
 * Lighthouse launches is a brand-new profile (`userDataDir` is a fresh
 * `mkdtempSync` directory every run; see `main`) with no cookie jar of its
 * own, so nothing else could carry the session across.
 *
 * Called once per script invocation, and the resulting cookie is reused
 * across every `home` sample of both form factors: `POST /auth/login` is
 * rate-limited to 10 attempts per minute per IP
 * (`apps/server/src/auth/rateLimitHook.ts`), and a script that signed in once
 * per sample would 429 partway through any `--runs` count above a couple.
 */
export async function establishAuthenticatedSession(baseUrl, fetchImpl = globalThis.fetch) {
  const setupResponse = await fetchImpl(`${baseUrl}/api/v1/setup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ baseUrl: FAKE_ABS_BASE_URL }),
  });
  if (!setupResponse.ok) {
    throw new SessionSetupError(
      `POST /api/v1/setup failed with ${setupResponse.status}: ${await setupResponse.text()}`,
    );
  }

  const loginResponse = await fetchImpl(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: FAKE_USERNAME, password: FAKE_PASSWORD }),
  });
  if (!loginResponse.ok) {
    throw new SessionSetupError(
      `POST /api/v1/auth/login failed with ${loginResponse.status}: ${await loginResponse.text()}`,
    );
  }

  // `Headers.getSetCookie()` (Node 22, whatwg fetch) returns each `Set-Cookie`
  // header as its own array entry — unlike `Headers.get('set-cookie')`, which
  // joins multiple occurrences with `, ` and is ambiguous whenever a cookie's
  // own value could contain a comma. There is only ever one `Set-Cookie` here
  // today, but this is the correct API for "one or more" regardless.
  const setCookies =
    typeof loginResponse.headers.getSetCookie === 'function'
      ? loginResponse.headers.getSetCookie()
      : [];
  const sessionCookie = setCookies
    .map((raw) => raw.split(';')[0].trim())
    .find((nameValue) => nameValue.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!sessionCookie) {
    throw new SessionSetupError(
      `POST /auth/login at ${baseUrl} succeeded but did not set a "${SESSION_COOKIE_NAME}" cookie ` +
        '— cannot authenticate the "home" page audit.',
    );
  }
  return sessionCookie;
}

/**
 * Confirms an authenticated-page audit really reached the authenticated app,
 * rather than the sign-in or setup screen a bad/expired/missing cookie
 * redirects to. This is the check the whole `home` page addition exists to
 * make honest: a misconfigured cookie that silently audits the signed-out
 * page anyway would look plausible — every metric would still be a real
 * number, just for the wrong page — which is precisely the hole this wave
 * was scoped to close (`lighthouse-budget.config.mjs`'s header names the
 * incident).
 *
 * Checks `lhr.finalDisplayedUrl` rather than DOM content because the LHR
 * exposes the former directly and not the latter: Lighthouse's `URL`
 * gatherer tracks both full navigations and same-document history-API
 * changes, so the client-side redirect `AuthGate`/`RootLayout` perform on an
 * unauthenticated `/` (see `apps/web/src/components/RootLayout.tsx`'s
 * `isBareLayoutPath` — `/login` and `/setup` both count) shows up here even
 * though the server never issued an HTTP redirect. A no-op for `signedOut`
 * page audits, which are supposed to land on `/setup`.
 */
export function assertAuthenticated(page, lhr) {
  if (!page.authenticated) return;
  const finalUrl = lhr?.finalDisplayedUrl ?? '';
  const landedOnAuthFlow = /\/(login|setup)(\/|$|[?#])/.test(finalUrl);
  if (!finalUrl || landedOnAuthFlow) {
    throw new SessionAuthenticationError(
      `Expected the "${page.label}" audit to reach the authenticated app, but Lighthouse's ` +
        `finalDisplayedUrl was "${finalUrl || '(empty)'}" — the session cookie did not ` +
        'authenticate. Refusing to silently report numbers for the signed-out page instead.',
    );
  }
}

/**
 * Resolves `chrome-launcher` off Lighthouse's own dependency graph rather than
 * importing it as a bare specifier. It is a dependency of `lighthouse`, not of
 * this project's root `package.json`, so pnpm's strict `node_modules` layout does
 * not hoist it to somewhere a plain `import 'chrome-launcher'` from `scripts/`
 * would find — `createRequire` rooted at Lighthouse's own `package.json` walks
 * its dependency resolution instead, the same way Lighthouse's own code would.
 */
async function loadChromeLauncher() {
  const lighthousePkgUrl = import.meta.resolve('lighthouse/package.json');
  const req = createRequire(lighthousePkgUrl);
  const chromeLauncherPath = req.resolve('chrome-launcher');
  return import(chromeLauncherPath);
}

function extractMetrics(lhr) {
  const metrics = { score: lhr.categories.performance.score };
  for (const [key, auditId] of Object.entries(AUDIT_IDS)) {
    metrics[key] = lhr.audits[auditId].numericValue;
  }
  return metrics;
}

/**
 * Audits one page/form-factor pair `runs` times. `sessionCookie` is only
 * attached (via `extraHeaders`) when `page.authenticated` is true — passing it
 * on `signedOut` audits too would be harmless in practice (that page never
 * reads the cookie) but would muddy what's actually being proven: a
 * `signedOut` page must stay auditable with no session at all, exactly as a
 * fresh visitor sees it.
 */
async function auditFormFactor(url, page, formFactor, port, runs, sessionCookie) {
  const sampleSets = Object.fromEntries(METRICS.map(({ key }) => [key, []]));
  const config = formFactor === 'desktop' ? desktopConfig : undefined;
  const extraHeaders = page.authenticated ? { Cookie: sessionCookie } : undefined;
  for (let i = 0; i < runs; i++) {
    const result = await lighthouse(
      url,
      { port, onlyCategories: ['performance'], output: 'json', extraHeaders },
      config,
    );
    if (!result?.lhr) {
      throw new AuditUnavailableError(
        `Lighthouse produced no result for "${page.label}" ${formFactor} run ${i + 1}/${runs}`,
      );
    }
    if (result.lhr.runtimeError) {
      throw new AuditUnavailableError(
        `Lighthouse reported a runtime error auditing "${page.label}" ${formFactor} ` +
          `(run ${i + 1}/${runs}): ${result.lhr.runtimeError.code} ${result.lhr.runtimeError.message}`,
      );
    }
    // Checked on every run, not just the first: a cookie that authenticates
    // once (e.g. a session with a short TTL) but expires partway through a
    // multi-run audit must still be caught, not averaged away.
    assertAuthenticated(page, result.lhr);
    const metrics = extractMetrics(result.lhr);
    for (const key of Object.keys(sampleSets)) {
      const value = metrics[key];
      if (!Number.isFinite(value)) {
        throw new AuditUnavailableError(
          `Lighthouse returned a non-numeric ${key} auditing "${page.label}" ${formFactor} ` +
            `(run ${i + 1}/${runs}): ${value}`,
        );
      }
      sampleSets[key].push(value);
    }
  }
  return summarizeFormFactor(sampleSets);
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(2);
    return;
  }

  let budgetModule;
  try {
    const budgetUrl = pathToFileURL(resolvePath(process.cwd(), opts.budgetPath)).href;
    budgetModule = await import(budgetUrl);
  } catch (err) {
    console.error(`Could not load budget config at ${opts.budgetPath}: ${err.message}`);
    process.exit(2);
    return;
  }
  const budgetConfig = budgetModule.budget;
  for (const page of PAGES) {
    if (!budgetConfig?.[page.key]?.desktop || !budgetConfig?.[page.key]?.mobile) {
      console.error(
        `Budget config at ${opts.budgetPath} must export "budget" with "${page.key}.desktop" ` +
          `and "${page.key}.mobile" keys.`,
      );
      process.exit(2);
      return;
    }
  }

  // Signing in to the freshly-booted server is not "can we even attempt an
  // audit" — it is a precondition this script's own invocation is responsible
  // for, against a server it (via `lighthouse-budget.sh`) just booted
  // specifically to be configured. A failure here is loud and exits 2, per
  // `SessionSetupError`'s own doc comment, and happens before Chrome is even
  // launched so there is nothing yet to tear down.
  let sessionCookie;
  try {
    sessionCookie = await establishAuthenticatedSession(opts.url);
  } catch (err) {
    console.error(`Could not establish an authenticated session at ${opts.url}: ${err.message}`);
    process.exit(2);
    return;
  }

  // Everything from here down is "can we even run a real audit at all" — any
  // failure in this block is fail-soft (exit 0), per this file's header comment.
  let chrome;
  let userDataDir;
  try {
    const chromeLauncher = await loadChromeLauncher();
    const chromePath = chromium.executablePath();
    // An explicit `userDataDir` under the OS temp dir, passed to chrome-launcher
    // *and* re-asserted as our own trailing `--user-data-dir` flag — working
    // around two independent WSL2 bugs found by running this script on this
    // project's own dev machine (docs/HANDOVER.md §4), each of which only
    // half-fixes the other:
    //   1. Passing a real string as `userDataDir` makes chrome-launcher skip
    //      its own tmp-dir creation for chrome-out.log/chrome-err.log/
    //      chrome.pid (good), but its `flags` getter still runs that string
    //      through `toWin32Path()` whenever `is-wsl` reports true — which it
    //      does unconditionally on WSL2, with no way to opt out, even though
    //      the Chrome binary in use here is Playwright's native *Linux*
    //      Chromium, not a Windows one. `toWin32Path` calls `wslpath -w`,
    //      which correctly answers "what Windows UNC path names this
    //      location" (e.g. `\\wsl.localhost\Ubuntu-25.04\tmp\...`) — correct
    //      for a Windows Chrome, meaningless for a Linux one, which then
    //      treats the backslash-laden string as a literal relative filename
    //      and creates it under the current working directory (observed
    //      directly: it landed inside this very repo).
    //   2. Passing `userDataDir: false` avoids that corrupted flag, but then
    //      chrome-launcher's `prepare()` still needs *somewhere* to put the
    //      log/pid files above and falls back to its own broken WSL tmp-dir
    //      logic (a `PATH` regex-match for a Windows `AppData\Local` segment,
    //      absent here since no Windows PATH entries are shared into this
    //      distro), again creating a stray relative directory in the repo.
    // Doing both together gets the good half of each: a real `userDataDir`
    // string keeps chrome-launcher's own tmp-dir logic (bug 2) out of the
    // way, and appending our own correct `--user-data-dir=` flag *after*
    // chrome-launcher's corrupted one (`chromeFlags` are concatenated last —
    // see this dependency's own `flags` getter) wins on Chrome's command
    // line, since a repeated Chromium switch takes its last occurrence.
    userDataDir = mkdtempSync(join(tmpdir(), 'auralis-lighthouse-'));
    chrome = await chromeLauncher.launch({
      chromePath,
      userDataDir,
      chromeFlags: [
        `--user-data-dir=${userDataDir}`,
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
      ],
    });
  } catch (err) {
    if (userDataDir) {
      rmSync(userDataDir, { recursive: true, force: true });
    }
    console.error(
      `Could not launch a real Chrome for the Lighthouse budget check (${err.message}). ` +
        'This check needs a Chromium binary — run `pnpm exec playwright install --with-deps ' +
        'chromium` — but its absence is an environment fact, not a budget failure, so this ' +
        'exits 0 rather than red.',
    );
    process.exit(0);
    return;
  }

  // `process.exit()` terminates immediately and would skip a pending `finally`
  // block entirely, so the exit code is computed here and the actual `exit`
  // call happens *after* the try/finally below, once teardown has genuinely
  // run — not inside the `try`. Getting this wrong was caught empirically: an
  // earlier version called `process.exit()` inside the `try`, and every run
  // leaked its Chrome process (chrome-launcher spawns detached, so the parent
  // shell's process-group kill in `lighthouse-budget.sh` doesn't reach it
  // either) and its `userDataDir` temp directory.
  //
  // `anyOverBudget` lives *outside* the `try` deliberately. A form factor that has
  // already run, printed `OVER` and been counted is a settled fact, and a later form
  // factor failing to run at all must not erase it: the fail-soft branch below means
  // "this sample proved nothing", not "everything is fine". Scoped inside the `try`
  // it was reachable — desktop over budget, then mobile throwing
  // `AuditUnavailableError` — and the run exited 0 with the real failure printed and
  // ignored, holding `publish`'s gate open on exactly the regression this check
  // exists to catch.
  let exitCode;
  let anyOverBudget = false;
  try {
    for (const page of PAGES) {
      for (const formFactor of FORM_FACTORS) {
        const measured = await auditFormFactor(
          opts.url,
          page,
          formFactor,
          chrome.port,
          opts.runs,
          sessionCookie,
        );
        const results = evaluateBudget(measured, budgetConfig[page.key][formFactor]);
        console.log(formatReport(page.label, formFactor, results));
        console.log(formatMeasuredLine(page.key, formFactor, opts.runs, measured));
        console.log('');
        if (!results.every((r) => r.pass)) {
          anyOverBudget = true;
        }
      }
    }
    exitCode = anyOverBudget ? 1 : 0;
  } catch (err) {
    if (err instanceof AuditUnavailableError) {
      console.error(
        `Could not complete a trustworthy Lighthouse audit (${err.message}). ` +
          'Treated the same as "no Chrome available" — the check could not run, which is not ' +
          'the same claim as "the budget was exceeded" — so this exits 0 rather than red.',
      );
      // Unless a page/form-factor pair that *did* run was already over budget, in
      // which case that verdict stands: an unavailable audit cannot retract a
      // measured failure.
      exitCode = anyOverBudget ? 1 : 0;
    } else if (err instanceof SessionAuthenticationError) {
      console.error(
        `${err.message} Treated as a usage/config error (exit 2), not a budget failure — a ` +
          'session that stopped authenticating partway through is a broken check, not a ' +
          'measured regression, and must not be swallowed the way an unavailable audit is.',
      );
      exitCode = 2;
    } else {
      throw err;
    }
  } finally {
    await chrome.kill();
    // chrome-launcher only cleans up a `userDataDir` it generated itself
    // (`destroyTmp()` is a no-op whenever `opts.userDataDir` was explicitly
    // passed in, which it was here — see the comment above `mkdtempSync`).
    rmSync(userDataDir, { recursive: true, force: true });
  }
  process.exit(exitCode);
}

// Only run when invoked directly (`node scripts/lighthouse-budget.mjs`), not when
// imported by the test file — the tests exercise the pure functions above without
// launching a real browser.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
