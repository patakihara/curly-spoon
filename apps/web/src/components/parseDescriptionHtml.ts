/**
 * Turns an Audiobookshelf/podcast-feed description into a small, safe AST
 * instead of raw HTML. Descriptions come from metadata providers (AudiobookBay,
 * podcast RSS feeds, directory search results) — never from this app's own
 * user — so treating the string as trusted markup is a stored-XSS hole
 * waiting for a `<script>` or an `onerror=` to show up in someone's library
 * metadata. `dangerouslySetInnerHTML` is therefore never an option here, and
 * neither is a sanitiser dependency (`pnpm add` is off-limits for a subagent
 * in this repo — concurrent agents installing packages is this project's main
 * lockfile-corruption failure mode).
 *
 * Instead this is a hand-rolled scanner over a narrow allowlist — paragraphs,
 * line breaks, bold/italic, lists, and links with a scheme-checked `href`.
 * Everything else — the tag itself, every attribute except a validated
 * `href`, and all `<script>`/`<style>` content — is discarded before it ever
 * reaches a React element, so there is no HTML string left for the browser to
 * parse as markup at render time: `RichDescription.tsx` maps this AST onto
 * plain React elements, never onto an HTML string.
 *
 * Deliberately dependency-free — no `DOMParser`. This file is unit-tested
 * under Vitest's `node` environment, which has no DOM, and the parsing logic
 * is exactly the part that most wants a fast, browser-free test loop.
 */

export type DescriptionNode =
  | { type: 'text'; value: string }
  | { type: 'break' }
  | { type: 'paragraph'; children: DescriptionNode[] }
  | { type: 'bold'; children: DescriptionNode[] }
  | { type: 'italic'; children: DescriptionNode[] }
  | { type: 'list'; ordered: boolean; children: DescriptionNode[] }
  | { type: 'listItem'; children: DescriptionNode[] }
  | { type: 'link'; href: string; children: DescriptionNode[] };

type ContainerTag = 'p' | 'b' | 'i' | 'ul' | 'ol' | 'li' | 'a';

/** Case-insensitive source tag name -> the AST container it produces. `strong`/`em` collapse onto `b`/`i`. */
const CONTAINER_TAGS: Record<string, ContainerTag> = {
  p: 'p',
  b: 'b',
  strong: 'b',
  i: 'i',
  em: 'i',
  ul: 'ul',
  ol: 'ol',
  li: 'li',
  a: 'a',
};

/** Tags whose entire content — including any markup nested inside — must never reach the AST. */
const CONTENT_DROPPED_TAGS = new Set(['script', 'style']);

/**
 * Schemes a rendered link may use. `javascript:`/`data:`/protocol-relative/bare
 * paths are all excluded on purpose — the only thing an allowed scheme buys a
 * description author is "open a page", never "run code in this origin".
 */
const ALLOWED_LINK_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const codePoint =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) return match;
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return match;
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

/**
 * Whether `href` is safe to render as a live link. Requires a scheme (no bare
 * `/path` or `//host` — those aren't validated against anything, so they're
 * left as text rather than guessed at) drawn from `ALLOWED_LINK_SCHEMES`, and
 * that `new URL` accepts it. A scheme embedding whitespace/control characters
 * to smuggle past a naive `javascript:` string check (e.g. `"jav\tascript:"`)
 * fails the scheme regex outright, since it only accepts `[a-zA-Z0-9+.-]`
 * between the first letter and the colon.
 */
function isSafeHref(href: string): boolean {
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(href.trim());
  if (!schemeMatch) return false;
  const scheme = `${(schemeMatch[1] ?? '').toLowerCase()}:`;
  if (!ALLOWED_LINK_SCHEMES.has(scheme)) return false;
  try {
    new URL(href);
    return true;
  } catch {
    return false;
  }
}

/** A container node while it is still open, plus the attributes it carries. */
interface OpenFrame {
  tag: ContainerTag;
  href?: string;
  children: DescriptionNode[];
}

/** Appends text, merging into a trailing text node instead of creating a run of adjacent single-char nodes. */
function appendText(target: DescriptionNode[], text: string): void {
  if (text.length === 0) return;
  const last = target[target.length - 1];
  if (last?.type === 'text') {
    last.value += text;
  } else {
    target.push({ type: 'text', value: text });
  }
}

function closeFrame(frame: OpenFrame): DescriptionNode {
  switch (frame.tag) {
    case 'p':
      return { type: 'paragraph', children: frame.children };
    case 'b':
      return { type: 'bold', children: frame.children };
    case 'i':
      return { type: 'italic', children: frame.children };
    case 'ul':
      return { type: 'list', ordered: false, children: frame.children };
    case 'ol':
      return { type: 'list', ordered: true, children: frame.children };
    case 'li':
      return { type: 'listItem', children: frame.children };
    case 'a':
      // The unsafe-href case is handled by the caller before this runs.
      return { type: 'link', href: frame.href as string, children: frame.children };
  }
}

/** Scans forward from `from` for the `>` that ends the current tag, skipping over quoted attribute values. */
function findTagEnd(html: string, from: number): number {
  let quote: '"' | "'" | null = null;
  for (let j = from; j < html.length; j++) {
    const ch = html[j];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '>') return j;
  }
  return -1;
}

function extractHref(attrText: string): string | undefined {
  const match = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(attrText);
  if (!match) return undefined;
  return decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
}

function findLastOpenIndex(stack: OpenFrame[], tag: ContainerTag): number {
  for (let k = stack.length - 1; k >= 0; k--) {
    if (stack[k]?.tag === tag) return k;
  }
  return -1;
}

/**
 * Parses an untrusted description into the allowlisted AST above. Total: no
 * input shape — a missing tag close, a bare `<`, an unknown or dangerous tag,
 * a `javascript:` href — ever throws. Everything degrades to the most
 * readable thing available (usually: keep the text, drop the markup) instead.
 */
export function parseDescriptionHtml(html: string | null | undefined): DescriptionNode[] {
  if (!html) return [];

  const root: DescriptionNode[] = [];
  const stack: OpenFrame[] = [];
  const currentChildren = (): DescriptionNode[] => stack.at(-1)?.children ?? root;

  const closeDownTo = (matchIndex: number): void => {
    while (stack.length > matchIndex) {
      const frame = stack.pop() as OpenFrame;
      const parent = stack.at(-1)?.children ?? root;
      if (frame.tag === 'a' && !(frame.href && isSafeHref(frame.href))) {
        // No safe destination: keep the link's own text, drop the anchor —
        // this is also where a `javascript:`/`data:` href gets defused, since
        // it never survives into a rendered `href` at all.
        for (const child of frame.children) {
          if (child.type === 'text') appendText(parent, child.value);
          else parent.push(child);
        }
        continue;
      }
      parent.push(closeFrame(frame));
    }
  };

  let i = 0;
  const lower = html.toLowerCase();

  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      appendText(currentChildren(), decodeEntities(html.slice(i)));
      break;
    }
    if (lt > i) {
      appendText(currentChildren(), decodeEntities(html.slice(i, lt)));
    }

    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    if (html[lt + 1] === '!' || html[lt + 1] === '?') {
      // Doctype/processing-instruction-shaped junk — not real content.
      const end = html.indexOf('>', lt + 1);
      i = end === -1 ? html.length : end + 1;
      continue;
    }

    const isClose = html[lt + 1] === '/';
    const nameStart = isClose ? lt + 2 : lt + 1;
    const nameMatch = /^[a-zA-Z][a-zA-Z0-9]*/.exec(html.slice(nameStart));
    if (!nameMatch) {
      // A `<` that isn't the start of a real tag (stray "a < b") — keep it as text.
      appendText(currentChildren(), '<');
      i = lt + 1;
      continue;
    }
    const rawName = nameMatch[0];
    const name = rawName.toLowerCase();
    const tagEnd = findTagEnd(html, nameStart + rawName.length);
    if (tagEnd === -1) {
      // An opening `<` with no closing `>` anywhere in the rest of the
      // string — nothing after it can be parsed as markup, so keep it as
      // plain text rather than silently dropping the tail of the description.
      appendText(currentChildren(), decodeEntities(html.slice(lt)));
      break;
    }

    if (name === 'br') {
      currentChildren().push({ type: 'break' });
      i = tagEnd + 1;
      continue;
    }

    if (CONTENT_DROPPED_TAGS.has(name) && !isClose) {
      const closeIdx = lower.indexOf(`</${name}`, tagEnd + 1);
      if (closeIdx === -1) {
        i = html.length; // unterminated <script>/<style> — nothing after it is safe to keep
      } else {
        const closeGt = html.indexOf('>', closeIdx);
        i = closeGt === -1 ? html.length : closeGt + 1;
      }
      continue;
    }

    const mappedTag = CONTAINER_TAGS[name];
    if (!mappedTag) {
      // Unknown/disallowed tag (div, span, img, table, ...): drop the tag
      // itself but keep scanning its content at the current nesting level.
      i = tagEnd + 1;
      continue;
    }

    if (isClose) {
      const matchIndex = findLastOpenIndex(stack, mappedTag);
      if (matchIndex !== -1) closeDownTo(matchIndex);
      // else: a stray close tag with nothing open to match — ignore it.
      i = tagEnd + 1;
      continue;
    }

    // A new `<p>` while one is already open auto-closes the previous one,
    // matching common CMS-exported markup that never bothers closing `<p>`.
    if (mappedTag === 'p' && stack.at(-1)?.tag === 'p') {
      closeDownTo(stack.length - 1);
    }

    const attrText = html.slice(nameStart + rawName.length, tagEnd);
    const selfClosing = html[tagEnd - 1] === '/';
    const frame: OpenFrame = {
      tag: mappedTag,
      href: mappedTag === 'a' ? extractHref(attrText) : undefined,
      children: [],
    };
    stack.push(frame);
    if (selfClosing) closeDownTo(stack.length - 1);
    i = tagEnd + 1;
  }

  closeDownTo(0);
  return root;
}
