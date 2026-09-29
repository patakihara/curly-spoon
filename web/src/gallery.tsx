/**
 * The Sonora gallery page, `/gallery.html`: every Sonora component once, in dark and light, from
 * its card (design-codegen/src/gallery.ts). Its own entry beside the app, linked from nowhere in
 * it, for the screenshot test (web/e2e/gallery.spec.ts). It draws only Sonora with literal props
 * and makes no request of its own.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts/fonts.css';
import './generated/tokens/sonora-tokens.css';
import './generated/tokens/sonora-theme.css';
import './base.css';
import { Gallery } from './generated/gallery';

const root = document.getElementById('root');
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <Gallery />
    </StrictMode>,
  );
}
