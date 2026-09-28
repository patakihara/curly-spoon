import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { choicesOf } from './app.js';
import { REPO_ROOT, SONORA_DIR } from './outputs.js';
import { readProps } from './props.js';
import { discoverComponents } from './sonora.js';

const sonora = join(REPO_ROOT, SONORA_DIR);
const selectors = (
  JSON.parse(readFileSync(join(sonora, '_adherence.oxlintrc.json'), 'utf8')) as {
    rules: { 'no-restricted-syntax': [string, ...{ selector: string }[]] };
  }
).rules['no-restricted-syntax']
  .slice(1)
  .map((r) => (r as { selector: string }).selector);

/** Each literal rule's component and prop, with the words it allows, sorted. */
const allowed = new Map(
  selectors.flatMap((s) => {
    const m =
      /^JSXOpeningElement\[name\.name='(\w+)'\] > JSXAttribute\[name\.name='(\w+)'\] > Literal\[value!=\/\^\(\?:([^)]*)\)\$\/\]$/.exec(
        s,
      );
    return m === null ? [] : [[`${m[1]}.${m[2]}`, m[3]!.split('|').sort().join('|')] as const];
  }),
);

describe("Sonora's adherence rules", () => {
  const choices = choicesOf(readProps(discoverComponents(sonora)));

  it('[M0.canvas] hold every prop that takes one of a set of words to those words, whether or not it also takes null', () => {
    const missing: string[] = [];
    for (const [component, props] of choices) {
      for (const [prop, { words }] of props) {
        if (allowed.get(`${component}.${prop}`) !== [...words].sort().join('|'))
          missing.push(`${component}.${prop}`);
      }
    }
    expect(missing).toEqual([]);
    expect(choices.get('ResultRow')?.get('tone')?.nullable).toBe(true);
  });
});
