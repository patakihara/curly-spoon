/**
 * What server-live.yml takes as a live run's result: the JUnit a real run of
 * canary.live.test.mjs wrote, and nothing that could stand in for any other plan check.
 * Run: node --test scripts/mediaserver/canary-results.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveJunit } from './canary-results.mjs';
import { CANARY_TEST } from './canary-probe.mjs';

const xml = (name, extra = '<!-- canary {"passed":true} -->') =>
  `<?xml version="1.0" encoding="utf-8"?><testsuites><testcase name="${name}" time="1" classname="test"/>${extra}</testsuites>`;
const sent = (text) => Buffer.from(text).toString('base64');

test('the live test’s JUnit, base64 as a workflow input carries it, is taken as sent', () => {
  assert.equal(liveJunit(sent(xml(CANARY_TEST))), xml(CANARY_TEST));
});

test('a result naming any other plan check is refused', () => {
  const both = xml(CANARY_TEST) + xml('[M3.books/a] something else');
  assert.throws(() => liveJunit(sent(both)), /\[M3\.books\/a\]/);
});

test('a file with no live test in it is refused', () => {
  assert.throws(() => liveJunit(sent(xml('some other test'))), /no live canary/);
  assert.throws(() => liveJunit(''), /no live canary/);
});

test('a result carrying no reading from the container is refused', () => {
  assert.throws(() => liveJunit(sent(xml(CANARY_TEST, ''))), /no reading/);
});

test('a result holding a URL is refused', () => {
  const leaking = xml(CANARY_TEST, '<!-- canary {"url":"https://example.invalid/x"} -->');
  assert.throws(() => liveJunit(sent(leaking)), /URL/);
});
