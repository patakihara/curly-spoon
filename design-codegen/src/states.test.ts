import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT, SONORA_DIR } from './outputs.js';
import { discoverComponents } from './sonora.js';
import { unlayeredControls } from './states.js';

const sonora = join(REPO_ROOT, SONORA_DIR);

/** Every level of Sonora: each control at each level draws Material's states. */
const LEVELS = ['basic', 'components', 'layouts'];

const NS = "const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};\n";

describe("Sonora's controls, read from their sources", () => {
  it('[M0.states/a] every element that takes an action draws NS().StateLayer in its state host', () => {
    const unlayered = discoverComponents(sonora)
      .filter((c) => LEVELS.includes(c.folder))
      .flatMap((c) =>
        unlayeredControls(readFileSync(c.jsx, 'utf8')).map((where) => `${c.name}: ${where}`),
      );
    expect(unlayered).toEqual([]);
  });

  it('[M0.states/a] names a button with no state layer, and passes one with its layer', () => {
    const bare = `${NS}export function A({ onClick }) { return <button onClick={onClick}>a</button>; }`;
    expect(unlayeredControls(bare)).toEqual(['<button onClick> (line 2)']);

    const layered = `${NS}export function A({ onClick }) {
  const StateLayer = NS().StateLayer;
  return <button className="sn-int" onClick={onClick}>a<StateLayer /></button>;
}`;
    expect(unlayeredControls(layered)).toEqual([]);
  });

  it('[M0.states/a] takes an input inside its layered field, and an aria-hidden scrim, but not a layer drawn elsewhere', () => {
    const field = `${NS}export function F({ onChange }) {
  const { StateLayer } = NS();
  return <div className={'sn-int'}><input onChange={onChange} /><StateLayer ripple={false} /></div>;
}`;
    expect(unlayeredControls(field)).toEqual([]);

    const scrim = `export function S({ onClose }) { return <div aria-hidden="true" onClick={onClose} />; }`;
    expect(unlayeredControls(scrim)).toEqual([]);

    const elsewhere = `${NS}export function E({ onClick }) {
  const StateLayer = NS().StateLayer;
  return <div><StateLayer /><span className="sn-int" onClick={onClick} /></div>;
}`;
    expect(unlayeredControls(elsewhere)).toEqual(['<span onClick> (line 4)']);
  });
});
