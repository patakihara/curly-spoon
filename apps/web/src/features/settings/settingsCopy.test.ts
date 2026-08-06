/**
 * Pins the Settings copy fix (web design audit, 2026-08-06): the accent-colour
 * hint used to read "Source colour (Phase 5 will set this automatically from
 * artwork)", naming an internal phase number to the user for automatic
 * artwork-derived colour that was never actually wired into this control —
 * it stays a manual swatch picker today, so the copy now just describes that.
 *
 * Read via `fs`, not rendered — this repo has no DOM test environment
 * (`vitest.config.ts`'s `environment: 'node'`; see `hooks/breakpoint.test.ts`'s
 * doc comment), so a source-text assertion is what's available; it pins the
 * exact string rather than simulating a render.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'SettingsPage.tsx'),
  'utf-8',
);

describe('Settings accent-colour copy', () => {
  it('describes the control without naming an internal phase number', () => {
    expect(source).toContain('Accent colour:');
  });

  it('no longer names a phase number in the accent-colour hint shown to the user', () => {
    // Deliberately scoped to the removed JSX string rather than every mention
    // of "Phase" in this file — the file's own doc comment (not user-facing)
    // is out of scope for this fix.
    expect(source).not.toContain('Source colour (Phase 5 will set this automatically');
  });
});
