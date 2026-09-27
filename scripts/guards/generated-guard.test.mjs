/**
 * The generated-folder guard: Claude's edit tools cannot touch a file under `generated/`.
 * Run: node --test scripts/guards/generated-guard.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT, removeTree } from '../plan/testing.mjs';
import { runHook } from './testing.mjs';

function withRoot(fn) {
  const root = mkdtempSync(join(tmpdir(), 'generated-guard-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  try {
    fn(root);
  } finally {
    removeTree(root);
  }
}

const edit = (root, tool_name, tool_input) =>
  runHook('generated-guard.mjs', { tool_name, tool_input, cwd: root });

const decision = (run) => JSON.parse(run.stdout).hookSpecificOutput;

test('[M0.uikit/b] the hook refuses an Edit to a file under a generated folder', () => {
  withRoot((root) => {
    const run = edit(root, 'Edit', { file_path: join(root, 'web/src/generated/Button.tsx') });
    assert.equal(run.status, 0);
    const out = decision(run);
    assert.equal(out.hookEventName, 'PreToolUse');
    assert.equal(out.permissionDecision, 'deny');
    assert.match(out.permissionDecisionReason, /web\/src\/generated\/Button\.tsx/);
    assert.match(out.permissionDecisionReason, /design\//);
  });
});

test('[M0.uikit/b] the hook refuses Write, MultiEdit and NotebookEdit under generated folders', () => {
  withRoot((root) => {
    const runs = [
      edit(root, 'Write', { file_path: 'schema/generated/openapi.json' }),
      edit(root, 'MultiEdit', {
        file_path: join(root, 'android/app/src/main/kotlin/net/x/generated/Props.kt'),
      }),
      edit(root, 'NotebookEdit', { notebook_path: join(root, 'web/generated/n.ipynb') }),
    ];
    for (const run of runs) assert.equal(decision(run).permissionDecision, 'deny');
  });
});

test('edits outside generated folders are allowed', () => {
  withRoot((root) => {
    for (const file of ['web/src/app.tsx', 'docs/plan/15-milestones.md', 'web/src/generated.ts']) {
      const run = edit(root, 'Edit', { file_path: join(root, file) });
      assert.equal(run.status, 0);
      assert.equal(run.stdout, '', file);
    }
  });
});

test('[M0.uikit/b] a symlink into the repo does not hide a generated folder', () => {
  withRoot((root) => {
    mkdirSync(join(root, 'web/src/generated'), { recursive: true });
    symlinkSync(join(root, 'web/src'), join(root, 'link'));
    symlinkSync(join(root, 'web/src/generated'), join(root, 'gen'));
    for (const file of ['link/generated/x.ts', 'gen/x.ts', 'gen/new/deeper/y.ts']) {
      const run = edit(root, 'Write', { file_path: join(root, file) });
      assert.equal(decision(run).permissionDecision, 'deny', file);
    }
  });
});

test('[M0.uikit/b] a repo reached through a symlink still guards its generated folders', () => {
  withRoot((root) => {
    const alias = join(mkdtempSync(join(tmpdir(), 'generated-alias-')), 'repo');
    symlinkSync(root, alias);
    try {
      const run = edit(alias, 'Edit', { file_path: join(alias, 'web/generated/y/z.ts') });
      assert.equal(decision(run).permissionDecision, 'deny');
    } finally {
      removeTree(join(alias, '..'));
    }
  });
});

test('[M0.uikit/b] a file literally named generated is not a folder, so it is allowed', () => {
  withRoot((root) => {
    for (const file of ['web/src/generated', 'generated']) {
      const run = edit(root, 'Write', { file_path: join(root, file) });
      assert.equal(run.status, 0);
      assert.equal(run.stdout, '', file);
    }
  });
});

test("a generated folder outside the repo is not this hook's business", () => {
  withRoot((root) => {
    const run = edit(root, 'Write', { file_path: '/tmp/x/generated/a.ts' });
    assert.equal(run.status, 0);
    assert.equal(run.stdout, '');
  });
});

test('it fails open on a payload it cannot read', () => {
  const run = runHook('generated-guard.mjs', 'not json');
  assert.equal(run.status, 0);
  assert.equal(run.stdout, '');
  assert.match(run.stderr, /generated-guard:/);
});

test(
  '[M0.uikit/b] .claude/settings.json registers the generated-folder guard for every edit tool',
  { todo: 'orchestrator registers hooks' },
  () => {
    const { hooks } = JSON.parse(readFileSync(join(REPO_ROOT, '.claude', 'settings.json'), 'utf8'));
    const commands = (event) =>
      (hooks[event] ?? []).flatMap((entry) => entry.hooks.map((h) => h.command));
    assert.ok(
      hooks.PreToolUse.some(
        (entry) =>
          entry.matcher === 'Edit|Write|MultiEdit|NotebookEdit' &&
          entry.hooks.some((h) => h.command.endsWith('scripts/guards/generated-guard.mjs"')),
      ),
    );
    assert.ok(commands('SessionStart').some((c) => c.includes('scripts/guards/session-start.mjs')));
    assert.ok(commands('Stop').some((c) => c.includes('scripts/guards/stop-publish.mjs')));
    for (const event of ['SessionStart', 'UserPromptSubmit', 'PreToolUse'])
      assert.ok(
        commands(event).some((c) => c.includes('usage-gate.sh')),
        `${event} keeps usage-gate.sh`,
      );
  },
);
