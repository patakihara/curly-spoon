import { describe, expect, it } from 'vitest';
import { isTypingTarget, matchShortcut } from './shortcuts.js';

describe('matchShortcut', () => {
  it('focuses search on "/"', () => {
    expect(matchShortcut('/', false)).toEqual({ action: 'focus-search', chordPending: false });
  });

  it('opens the shortcut sheet on "?"', () => {
    expect(matchShortcut('?', false)).toEqual({
      action: 'open-shortcut-sheet',
      chordPending: false,
    });
  });

  it('arms a chord on "g" without firing an action yet', () => {
    expect(matchShortcut('g', false)).toEqual({ action: null, chordPending: true });
  });

  it('completes "g h" as go-home', () => {
    expect(matchShortcut('h', true)).toEqual({ action: 'go-home', chordPending: false });
  });

  it('completes "g l" as go-library', () => {
    expect(matchShortcut('l', true)).toEqual({ action: 'go-library', chordPending: false });
  });

  it('cancels the chord on an unrelated key without firing anything', () => {
    expect(matchShortcut('x', true)).toEqual({ action: null, chordPending: false });
  });

  it('does nothing for unrelated keys with no chord armed', () => {
    expect(matchShortcut('a', false)).toEqual({ action: null, chordPending: false });
  });
});

describe('isTypingTarget', () => {
  // `EventTarget` in the real DOM always has far more on it than `tagName` — these
  // fakes are cast, matching the shape `isTypingTarget` actually reads at runtime.
  const fakeTarget = (shape: { tagName: string; isContentEditable?: boolean }) =>
    shape as unknown as EventTarget;

  it('is true for an input-like element', () => {
    expect(isTypingTarget(fakeTarget({ tagName: 'INPUT' }))).toBe(true);
    expect(isTypingTarget(fakeTarget({ tagName: 'TEXTAREA' }))).toBe(true);
  });

  it('is true for a contenteditable element', () => {
    expect(isTypingTarget(fakeTarget({ tagName: 'DIV', isContentEditable: true }))).toBe(true);
  });

  it('is false for an ordinary element', () => {
    expect(isTypingTarget(fakeTarget({ tagName: 'DIV' }))).toBe(false);
  });

  it('is false for null', () => {
    expect(isTypingTarget(null)).toBe(false);
  });
});
