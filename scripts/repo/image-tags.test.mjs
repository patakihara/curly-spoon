/**
 * Which image tags each push publishes. A green push to `main` publishes `:edge`, a release tag
 * publishes `:latest`, and the container on mediaserver follows `:latest`, so it moves only when
 * a release is cut. The workflows are read as text: no YAML parser sits at the repo root.
 * Run: node --test scripts/repo/image-tags.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const workflows = join(root, '.github', 'workflows');
const read = (file) => readFileSync(join(workflows, file), 'utf8');
const IMAGE = 'ghcr.io/patakihara/auralis';

/** The lines of each `tags: |` block in a workflow, trimmed: one image tag per line. */
function imageTags(text) {
  const out = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const block = /^(\s*)tags: \|$/.exec(line);
    if (block === null) return;
    for (const next of lines.slice(i + 1)) {
      const indent = /^\s*/.exec(next)[0].length;
      if (next.trim() === '' || indent <= block[1].length) break;
      out.push(next.trim());
    }
  });
  return out;
}

/** The `on:` block of a workflow, up to the next top-level key. */
const triggers = (text) => /^on:\n((?:[ #].*\n|\n)*)/m.exec(text)?.[1] ?? '';

test('[M1.release/a] a green push to main publishes :edge and the commit, never :latest', () => {
  const text = read('publish.yml');
  assert.match(triggers(text), /workflow_run:\n\s+workflows: \['CI'\]/);
  assert.match(text, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.deepEqual(imageTags(text), [
    `${IMAGE}:edge`,
    `${IMAGE}:\${{ github.event.workflow_run.head_sha }}`,
  ]);
  assert.doesNotMatch(text, /auralis:latest/);
});

test('[M1.release/a] a release tag publishes :latest and its version, and never :edge', () => {
  const text = read('release.yml');
  assert.match(triggers(text), /push:\n\s+tags:\n\s+- 'v\*'\n/);
  assert.doesNotMatch(triggers(text), /branches|pull_request|workflow_run/);
  assert.deepEqual(imageTags(text), [
    `${IMAGE}:\${{ needs.validate-version.outputs.version }}`,
    `\${{ needs.validate-version.outputs.prerelease == 'false' && '${IMAGE}:latest' || '' }}`,
  ]);
  assert.doesNotMatch(text, /auralis:edge/);
});

test('[M1.release/a] no other workflow pushes an image', () => {
  const pushing = readdirSync(workflows)
    .filter((file) => /^\s*push: true$/m.test(read(file)))
    .sort();
  assert.deepEqual(pushing, ['publish.yml', 'release.yml']);
});

test('a tags block is read line by line and ends where its indent does', () => {
  const text = [
    '      with:',
    '        tags: |',
    '          a:1',
    '          b:2',
    '        push: true',
  ];
  assert.deepEqual(imageTags(text.join('\n')), ['a:1', 'b:2']);
});
