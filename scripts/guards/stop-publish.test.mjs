/**
 * The end-of-session hook: a session is asked to publish before it stops, once.
 * Run: node --test scripts/guards/stop-publish.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { edit, git, removeTree, write } from '../plan/testing.mjs';
import { publishedRepo, runHook } from './testing.mjs';

function withRepo(fn) {
  const { root } = publishedRepo({ checked: ['plan', 'sonora'] });
  const cache = mkdtempSync(join(tmpdir(), 'stop-publish-cache-'));
  try {
    fn(root, cache);
  } finally {
    removeTree(root);
    removeTree(cache);
  }
}

const stop = (root, cache, extra = {}) =>
  runHook(
    'stop-publish.mjs',
    { hook_event_name: 'Stop', session_id: 'x', cwd: root, stop_hook_active: false, ...extra },
    { env: { XDG_CACHE_HOME: cache } },
  );

const changePlan = (root) => {
  edit(root, 'docs/plan/00-intro.md', (t) => t + '\nA new sentence.\n');
  git(root, 'commit', '-qam', 'Change the plan', '-m', 'Plan: M0.aa');
};

const blocked = (run) => {
  assert.equal(run.status, 0, run.stderr);
  const out = JSON.parse(run.stdout);
  assert.equal(out.decision, 'block');
  return out.reason;
};

const allowed = (run) => {
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, '');
};

test('[M0.uikit/f] the end-of-session hook blocks while a plan change is unpublished', () => {
  withRepo((root, cache) => {
    changePlan(root);
    const reason = blocked(stop(root, cache));
    assert.match(reason, /docs\/plan, docs\/outbox, .*\(plan\): changed since the publish/);
    assert.match(reason, /docs\/plan\/README\.md/);
  });
});

test('[M0.uikit/f] the end-of-session hook blocks while a design change is uncommitted', () => {
  withRepo((root, cache) => {
    write(root, 'design/sonora/README.md', '# Sonora, edited\n');
    assert.match(blocked(stop(root, cache)), /uncommitted changes since the publish/);
  });
});

test('[M0.uikit/f] the hook lets the session stop once everything is published', () => {
  withRepo((root, cache) => allowed(stop(root, cache)));
});

test('[M0.uikit/f] it never traps a session: a second stop is allowed', () => {
  withRepo((root, cache) => {
    changePlan(root);
    allowed(stop(root, cache, { stop_hook_active: true }));
  });
});

test("a subagent's stop is never blocked", () => {
  withRepo((root, cache) => {
    changePlan(root);
    allowed(stop(root, cache, { agent_id: 'a1' }));
    allowed(stop(root, cache, { hook_event_name: 'SubagentStop' }));
  });
});

test('[M0.uikit/f] it allows the stop while the usage gate is blocking', () => {
  withRepo((root, cache) => {
    changePlan(root);
    const gate = join(cache, 'auralis-budget.json');
    writeFileSync(gate, '{"verdict":"over"}');
    allowed(stop(root, cache));
    writeFileSync(gate, '{"verdict":"ok"}');
    blocked(stop(root, cache));
    writeFileSync(gate, '{"verdict":"over"}');
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    utimesSync(gate, hourAgo, hourAgo);
    blocked(stop(root, cache));
  });
});

test('it fails open', () => {
  withRepo((root, cache) => {
    allowed(runHook('stop-publish.mjs', 'not json', { env: { XDG_CACHE_HOME: cache } }));
    const bare = mkdtempSync(join(tmpdir(), 'stop-publish-bare-'));
    try {
      const run = runHook(
        'stop-publish.mjs',
        { hook_event_name: 'Stop', cwd: bare, stop_hook_active: false },
        { cwd: bare, env: { XDG_CACHE_HOME: cache } },
      );
      allowed(run);
      assert.match(run.stderr, /stop-publish:/);
    } finally {
      removeTree(bare);
    }
  });
});

test('a change to a source the config does not check does not block', () => {
  withRepo((root, cache) => {
    write(root, 'design/app/nav.json', '{"tabs":["home"]}\n');
    git(root, 'commit', '-qam', 'Change the canvas');
    allowed(stop(root, cache));
  });
});
