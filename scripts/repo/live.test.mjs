/**
 * Live checks against what is published beyond these machines. They reach the network, so they
 * run only with LIVE=1, in the Live workflow. `pnpm test` and CI's unit job leave this file out:
 * a skipped result there would replace the Live run's result for the same test name.
 * Run: LIVE=1 node --test scripts/repo/live.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const skip = process.env.LIVE === '1' ? false : 'a live check: set LIVE=1 to reach the network';

const INDEX = 'https://patakihara.github.io/curly-spoon/repo/index-v2.json';
const PACKAGE = 'net.develivarr.auralis';
/** 0.2.0's version code, the last legacy release. */
const LEGACY_CODE = 2;
const TIMEOUT = 20_000;

const get = (url, init = {}) => fetch(url, { signal: AbortSignal.timeout(TIMEOUT), ...init });

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
