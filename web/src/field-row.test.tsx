import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FieldRow, Input } from './generated/ui/index.js';

type Node = ReactElement<Record<string, unknown>> | undefined;

/** The first element in a tree of plain elements that `match` picks, rendering components as it goes. */
function find(node: unknown, match: (el: ReactElement) => boolean): Node {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child, match);
      if (hit) return hit;
    }
    return undefined;
  }
  if (node === null || typeof node !== 'object' || !('props' in node)) return undefined;
  const el = node as ReactElement<Record<string, unknown>>;
  if (match(el)) return el;
  if (typeof el.type === 'function') {
    return find((el.type as (p: unknown) => unknown)(el.props), match);
  }
  return find(el.props.children, match);
}

/** Types `text` into the text box a FieldRow draws, as a browser would hand it the change. */
function typeInto(row: ReactElement, text: string) {
  const box = find(row, (el) => el.type === 'input');
  (box!.props.onChange as (e: unknown) => void)({ target: { value: text } });
}

describe("Sonora's FieldRow", () => {
  it('[M0.canvas] hands its onChange the text typed, not the browser event', () => {
    const onChange = vi.fn();
    typeInto(<FieldRow label="Server" onChange={onChange} />, 'jellyfin.local');
    expect(onChange).toHaveBeenCalledWith('jellyfin.local');
  });

  it('[M0.states/c] with no onChange draws a disabled box that nothing types into', () => {
    const box = find(<Input placeholder="Search" />, (el) => el.type === 'input');
    expect(box?.props.disabled).toBe(true);
    expect(box?.props.onChange).toBeUndefined();
  });
});
