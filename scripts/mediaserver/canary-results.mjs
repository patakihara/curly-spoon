/**
 * server-live.yml's one step of its own: turns its input into the JUnit file collect-results reads.
 * The runner cannot reach this server, and must not ask a stream from its own address, so the live
 * test runs from the laptop and sends its JUnit. Only that test's result gets through: it carries the
 * container's reading and could stand in for no other plan check.
 *
 *   JUNIT=<base64> node scripts/mediaserver/canary-results.mjs reports/junit/server-live.xml
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJUnit, tagOf } from '../plan/results.mjs';
import { CANARY_TEST } from './canary-probe.mjs';

export function liveJunit(base64) {
  const xml = Buffer.from(base64, 'base64').toString('utf8');
  const cases = parseJUnit(xml);
  if (!cases.some(({ name }) => name === CANARY_TEST)) {
    throw new Error('no live canary test in this file');
  }
  for (const { name } of cases) {
    if (name !== CANARY_TEST && tagOf(name) !== null) {
      throw new Error(`this file also names ${name}`);
    }
  }
  if (!/<!--\s*canary \{/.test(xml)) throw new Error('no reading from the container in this file');
  if (/https?:\/\/|googlevideo/i.test(xml.replace(/<\?xml[^>]*\?>/, ''))) {
    throw new Error('this file holds a URL');
  }
  return xml;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = process.argv[2];
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, liveJunit(process.env.JUNIT ?? ''));
  console.log(`canary-results: wrote ${out}`);
}
