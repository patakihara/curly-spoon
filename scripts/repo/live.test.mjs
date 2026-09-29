/**
 * Live checks against what is published beyond these machines. They reach the network, so they
 * run only with LIVE=1, in the Live workflow. `pnpm test` and CI's unit job leave this file out:
 * a skipped result there would replace the Live run's result for the same test name.
 * Run: LIVE=1 node --test scripts/repo/live.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duePublish, publishes, STAGING_GRACE_MS } from './staging.mjs';

const skip = process.env.LIVE === '1' ? false : 'a live check: set LIVE=1 to reach the network';

const INDEX = 'https://patakihara.github.io/curly-spoon/repo/index-v2.json';
const PACKAGE = 'net.develivarr.auralis';
/** 0.2.0's version code, the last legacy release. */
const LEGACY_CODE = 2;
const TIMEOUT = 20_000;

const get = (url, init = {}) => fetch(url, { signal: AbortSignal.timeout(TIMEOUT), ...init });

/** Where the staging container answers: a repository secret, since no hostname is committed. */
const STAGING = process.env.AURALIS_STAGING_URL;
const REPO = process.env.GITHUB_REPOSITORY ?? 'patakihara/curly-spoon';

/** A GET on GitHub's REST API, with the workflow's token when it has one. */
async function github(path) {
  const headers = { accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await get(`https://api.github.com/repos/${REPO}${path}`, { headers });
  assert.equal(res.status, 200, `GitHub answers ${path}`);
  return res.json();
}

/** The package's versions from an index-v2 document, as `{ code, name, url }`. */
function versionsOf(index, pkg) {
  assert.equal(typeof index?.repo?.address, 'string', 'the index has repo.address');
  const versions = index.packages?.[pkg]?.versions;
  assert.ok(versions && typeof versions === 'object', `the index lists ${pkg}`);
  return Object.values(versions).map((v) => {
    assert.equal(typeof v?.manifest?.versionCode, 'number', 'a version has manifest.versionCode');
    assert.equal(typeof v?.file?.name, 'string', 'a version has file.name');
    const file = v.file.name.startsWith('/') ? v.file.name : `/${v.file.name}`;
    return {
      code: v.manifest.versionCode,
      name: v.manifest.versionName,
      url: index.repo.address + file,
    };
  });
}

test(
  `[M0.repo/c] the F-Droid repository serves ${PACKAGE} above 0.2.0, with an APK that answers`,
  { skip },
  async () => {
    const res = await get(INDEX);
    assert.equal(res.status, 200, `${INDEX} answers`);
    const versions = versionsOf(await res.json(), PACKAGE);
    const listed = versions.map((v) => `${v.name} (${v.code})`).join(', ');
    const newer = versions.filter((v) => v.code > LEGACY_CODE).sort((a, b) => b.code - a.code);
    assert.ok(newer.length > 0, `a version code above ${LEGACY_CODE}; the index has ${listed}`);
    const apk = await get(newer[0].url, { headers: { Range: 'bytes=0-0' } });
    await apk.body?.cancel();
    assert.ok([200, 206].includes(apk.status), `${newer[0].url} answers ${apk.status}`);
  },
);

test(
  '[M0.staging/a] the staging container reports the latest green main build, or newer, 30 minutes after its publish',
  { skip },
  async (t) => {
    assert.ok(STAGING, 'AURALIS_STAGING_URL names the staging container');
    const { workflow_runs: runs } = await github(
      '/actions/workflows/publish.yml/runs?status=success&per_page=50',
    );
    const list = publishes(runs);
    assert.ok(list.length > 0, 'a Publish run names the commit it published');
    const due = duePublish(list, Date.now());
    if (due === null) {
      t.skip(`every publish is younger than ${STAGING_GRACE_MS / 60_000} minutes`);
      return;
    }

    const res = await get(new URL('/api/health', STAGING));
    assert.equal(res.status, 200, 'staging answers /api/health');
    const health = await res.json();
    assert.equal(health?.status, 'ok', 'staging reports ok');
    assert.match(String(health?.commit), /^[0-9a-f]{40}$/, 'staging reports the commit it runs');
    if (health.commit === due.commit) return;

    const at = new Date(due.at).toISOString();
    const since = await github(`/compare/${due.commit}...${health.commit}`);
    assert.equal(
      since.status,
      'ahead',
      `staging runs ${health.commit}, not ${due.commit} published at ${at} or a later commit`,
    );
    const onMain = await github(`/compare/main...${health.commit}`);
    assert.ok(
      ['behind', 'identical'].includes(onMain.status),
      `staging runs ${health.commit}, which is not on main`,
    );
  },
);
