import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CoverArt, MediaCard, MediaHeader } from './generated/ui/index.js';

const art = (props: Parameters<typeof CoverArt>[0]) =>
  renderToString(createElement(CoverArt, props));
const images = (html: string) => [...html.matchAll(/<img[^>]*src="([^"]+)"/g)].map((m) => m[1]);
const covers = ['/art/a.jpg', '/art/b.jpg', '/art/c.jpg', '/art/d.jpg', '/art/e.jpg'];

describe("Sonora's art for a collection with none of its own", () => {
  it("[M0.canvas] draws four of its items' covers as a 2×2 mosaic", () => {
    const html = art({ covers });
    expect(html).toContain('grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr');
    expect(images(html)).toEqual(covers.slice(0, 4));
  });

  it('[M0.canvas] counts a cover repeated by several items once', () => {
    const html = art({ covers: ['/art/a.jpg', '/art/a.jpg', '/art/b.jpg', '/art/c.jpg'] });
    expect(html).not.toContain('grid-template-columns');
    expect(images(html)).toEqual(['/art/a.jpg']);
  });

  it('[M0.canvas] draws the one cover alone when it holds one item, and the plain tile when it holds none', () => {
    const one = art({ covers: ['/art/a.jpg'] });
    expect(one).not.toContain('grid-template-columns');
    expect(images(one)).toEqual(['/art/a.jpg']);
    const none = art({ covers: [] });
    expect(images(none)).toEqual([]);
    expect(none).toContain('background:var(--accent)');
  });

  it("[M0.canvas] keeps art of its own over its items' covers", () => {
    expect(images(art({ src: '/art/own.jpg', covers }))).toEqual(['/art/own.jpg']);
  });

  it('[M0.canvas] gives the mosaic to a header and a card', () => {
    const header = renderToString(
      createElement(MediaHeader, { platform: 'desktop', kindLabel: 'Digest', covers }),
    );
    const card = renderToString(createElement(MediaCard, { title: 'The Digest', covers }));
    for (const html of [header, card]) expect(images(html)).toEqual(covers.slice(0, 4));
  });
});
