/**
 * Live checks against what is published beyond these machines. They reach the network, so they
 * run only with LIVE=1, in the Live workflow. `pnpm test` and CI's unit job leave this file out:
 * a skipped result there would replace the Live run's result for the same test name.
 * Run: LIVE=1 node --test scripts/repo/live.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDue, newestRelease, STAGING_GRACE_MS } from './staging.mjs';

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
/** The image release.yml publishes, in GHCR's lowercase path. */
const IMAGE = 'patakihara/auralis';

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

/**
 * The newest release and the commit its tag names, and the commit the staging container reports.
 * Skips the test while the release is younger than the grace period staging has to follow it.
 */
async function stagingAndNewestRelease(t) {
  assert.ok(STAGING, 'AURALIS_STAGING_URL names the staging container');
  const res = await get(new URL('/api/health', STAGING));
  assert.equal(res.status, 200, 'staging answers /api/health');
  const health = await res.json();
  assert.equal(health?.status, 'ok', 'staging reports ok');
  assert.match(String(health?.commit), /^[0-9a-f]{40}$/, 'staging reports the commit it runs');

  const release = newestRelease(await github('/releases/latest'));
  const { sha } = await github(`/commits/${encodeURIComponent(release.tag)}`);
  assert.match(String(sha), /^[0-9a-f]{40}$/, `${release.tag} names a commit`);
  if (!isDue(release, Date.now())) {
    t.skip(`${release.tag} is younger than ${STAGING_GRACE_MS / 60_000} minutes`);
    return null;
  }
  return { running: health.commit, release: { ...release, commit: sha } };
}

test(
  '[M0.staging/a] the staging container reports the newest release 30 minutes after its publish',
  { skip },
  async (t) => {
    const seen = await stagingAndNewestRelease(t);
    if (seen === null) return;
    const { running, release } = seen;
    const at = new Date(release.at).toISOString();
    assert.equal(running, release.commit, `staging runs ${running}, not ${release.tag} of ${at}`);
  },
);

/** The image's manifest digest under a tag in GHCR, read anonymously: the package is public. */
async function imageDigest(tag) {
  const auth = await get(`https://ghcr.io/token?scope=repository:${IMAGE}:pull`);
  assert.equal(auth.status, 200, 'GHCR hands out an anonymous pull token');
  const { token } = await auth.json();
  const res = await get(`https://ghcr.io/v2/${IMAGE}/manifests/${tag}`, {
    method: 'HEAD',
    headers: {
      authorization: `Bearer ${token}`,
      accept: [
        'application/vnd.oci.image.index.v1+json',
        'application/vnd.docker.distribution.manifest.list.v2+json',
      ].join(', '),
    },
  });
  assert.equal(res.status, 200, `GHCR holds ${IMAGE}:${tag}`);
  const digest = res.headers.get('docker-content-digest');
  assert.match(String(digest), /^sha256:[0-9a-f]{64}$/, `GHCR names the digest of :${tag}`);
  return digest;
}

test(
  '[M1.release/b] the container on mediaserver reports the commit of the newest release, which :latest holds',
  { skip },
  async (t) => {
    const seen = await stagingAndNewestRelease(t);
    if (seen === null) return;
    const { running, release } = seen;
    assert.equal(running, release.commit, `the newest release is ${release.tag}`);
    const version = release.tag.replace(/^v/, '');
    assert.equal(await imageDigest('latest'), await imageDigest(version), `:latest is ${version}`);
  },
);
