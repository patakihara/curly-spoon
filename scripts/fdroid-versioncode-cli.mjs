#!/usr/bin/env node
/**
 * Thin CLI wrapper around `computeVersionCode` (see fdroid-versioncode.mjs for the real
 * logic and its tests) — exists so `.github/workflows/fdroid-repo.yml` can derive a
 * versionCode with a plain `node scripts/fdroid-versioncode-cli.mjs <tag> <tag> ...` rather
 * than embedding a multi-line inline module in YAML. This file has no logic of its own to
 * test: it parses argv and prints one line.
 *
 * Usage: node fdroid-versioncode-cli.mjs <target-tag> [known-tag ...]
 * Prints the versionCode to stdout, or an error to stderr and exits 1.
 */
import { computeVersionCode } from './fdroid-versioncode.mjs';

const [, , targetTag, ...knownTags] = process.argv;

if (!targetTag) {
  console.error('Usage: fdroid-versioncode-cli.mjs <target-tag> [known-tag ...]');
  process.exit(1);
}

try {
  console.log(computeVersionCode(knownTags, targetTag));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
