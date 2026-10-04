import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MediaCard, ResultRow } from './generated/ui/index.js';

/** The pill a status draws, by the fill and ink Badge gives it. */
const PILL = {
  accent: 'background:var(--accent);color:var(--accent-contrast)',
  warning: 'background:var(--tone-request);color:var(--tone-request-ink)',
  error: 'background:var(--tone-error);color:var(--tone-error-ink)',
};

const row = (status: string, tone: 'progress' | 'request' | 'error') =>
  renderToString(createElement(ResultRow, { title: 'Salt and Static', status, tone }));
const card = (status: string, tone: 'progress' | 'request' | 'error') =>
  renderToString(
    createElement(MediaCard, { title: 'Salt and Static', image: '/art/x.jpg', status, tone }),
  );

describe("A status pill on Sonora's rows and cards", () => {
  it.each([
    ['Downloading · 87%', 'progress', PILL.accent],
    ['Requested', 'request', PILL.warning],
    ['Failed', 'error', PILL.error],
  ] as const)(
    '[M0.sonoraclean/e] "%s" (%s) draws the same pill on a row as on a card',
    (status, tone, pill) => {
      expect(row(status, tone)).toContain(pill);
      expect(card(status, tone)).toContain(pill);
    },
  );
});
